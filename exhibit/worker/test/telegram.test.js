import { describe, it, expect } from 'vitest';
import { makeDb } from '../src/supabase.js';
import { makeTelegram } from '../src/telegram.js';
import { fakeWorld, tgUpdate } from './helpers.js';

const A = { id: 'a-id', handle: 'נמל-שקט', consent_at: '2026-10-20T10:00:00Z', stopped_at: null, telegram_user_id: 1001 };
const B = { id: 'b-id', handle: 'כרם-מלא', consent_at: null, stopped_at: null, telegram_user_id: 1002 };

function world(extra = {}) {
  return fakeWorld({
    tables: {
      profiles: (q) => q.includes('telegram_user_id=eq.1001') ? [A] : q.includes('telegram_user_id=eq.1002') ? [B]
        : q.includes('id=eq.a-id') ? [A] : q.includes('id=eq.b-id') ? [B] : [],
      exchanges: (q) => q.includes('status=eq.open') && q.includes('a-id') ? [{ id: 'x1', participants: ['a-id', 'b-id'] }] : [],
      app_settings: [{ value: 'exhibit-consent-1' }],
      invites: (q) => q.includes('claimed_by=eq.b-id') ? [{ created_by: 'a-id' }] : [],
      ...extra.tables
    },
    rpc: {
      claim_invite: ({ p_code }) => p_code === 'badcode' ? (() => { throw new Error('INVITE_EXPIRED'); })()
        : { profile_id: 'b-id', handle: 'כרם-מלא', paired_with: 'a-id', consent_version: null },
      record_consent: () => ({ consent_version: 'exhibit-consent-1' }),
      open_exchange: () => 'x1',
      append_message: () => 7,
      close_exchange: () => ({ id: 'x1', participants: [], messages: [] }),
      create_pair_invite: () => ({ code: 'c'.repeat(22), telegram_link: 'https://t.me/Hermes?start=' + 'c'.repeat(22) }),
      stop_profile: () => null,
      ...extra.rpc
    }
  });
}

describe('telegram relay', () => {
  it('/start with a code claims the invite and asks for consent, naming the handle', async () => {
    const w = world(); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1002, '/start ' + 'k'.repeat(22)));
    expect(w.calls.rpc[0]).toEqual(['claim_invite', { p_code: 'k'.repeat(22), p_telegram_user_id: 1002 }]);
    expect(w.calls.sends[0].text).toContain('כרם-מלא');
    expect(w.calls.sends[0].text).toContain('מסכים');
  });

  it('an expired code is told so', async () => {
    const w = world(); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1002, '/start badcode'));
    expect(w.calls.sends[0].text).toMatch(/פג/);
  });

  it('consent is recorded, then the pair opens and both are told', async () => {
    const w = world(); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1002, 'מסכים'));
    expect(w.calls.rpc.map(([n]) => n)).toEqual(['record_consent', 'open_exchange']);
    expect(w.calls.sends.map((s) => s.chat_id)).toEqual([1002, 1002, 1001]);
    expect(w.calls.sends[2].text).toContain('כרם-מלא');
  });

  it('text from A is stored and relayed to B with A handle, not forwarded raw to anyone else', async () => {
    const w = world(); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1001, 'הים היה שטוח'));
    expect(w.calls.rpc[0]).toEqual(['append_message', { p_exchange: 'x1', p_from: 'a-id', p_text: 'הים היה שטוח', p_witness: 'self_wrote' }]);
    expect(w.calls.sends).toEqual([expect.objectContaining({ chat_id: 1002, text: 'נמל-שקט: הים היה שטוח' })]);
  });

  it('without consent, text is not relayed', async () => {
    const w = world(); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1002, 'שלום?'));
    expect(w.calls.rpc.length).toBe(0);
    expect(w.calls.sends[0].text).toContain('מסכים');
  });

  it('/end closes the exchange, tells both, and hands the bundle to the pipeline', async () => {
    const w = world(); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    let got = null;
    await tg.handle(tgUpdate(1001, '/end'), async (bundle) => { got = bundle; });
    expect(w.calls.rpc.some(([n]) => n === 'close_exchange')).toBe(true);
    expect(got).toEqual({ id: 'x1', participants: [], messages: [] });
    expect(w.calls.sends.map((s) => s.chat_id)).toEqual([1001, 1002]);
  });

  it('/stop silences the profile and nothing after it is stored', async () => {
    const w = world({ tables: { profiles: (q) => q.includes('1001') ? [{ ...A, stopped_at: 'now' }] : [] } });
    const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1001, 'עוד משהו'));
    expect(w.calls.rpc.length).toBe(0); expect(w.calls.sends.length).toBe(0);
  });

  it('/invite returns a pair link and never sends it anywhere else', async () => {
    const w = world(); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1001, '/invite'));
    expect(w.calls.sends).toHaveLength(1);
    expect(w.calls.sends[0].text).toContain('t.me/Hermes?start=');
  });

  it('a rate limit from the database becomes a polite wait', async () => {
    const w = world({ rpc: { create_pair_invite: () => { throw new Error('RATE_LIMITED:120'); } } });
    const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1001, '/invite'));
    expect(w.calls.sends[0].text).toContain('120');
  });
});
