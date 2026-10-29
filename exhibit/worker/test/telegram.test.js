import { describe, it, expect } from 'vitest';
import { makeDb } from '../src/supabase.js';
import { makeTelegram } from '../src/telegram.js';
import { fakeWorld, tgUpdate } from './helpers.js';

const T0 = '2026-10-20T10:00:00Z';
const A = { id: 'a-id', handle: 'נמל-שקט', consent_at: T0, stopped_at: null, telegram_user_id: 1001, emotion_declared_at: T0, color_declared_at: T0 };
const B = { id: 'b-id', handle: 'כרם-מלא', consent_at: null, stopped_at: null, telegram_user_id: 1002, emotion_declared_at: null, color_declared_at: null };
// B after consent, before answering the two questions; and after the emotion only.
const Bc = { ...B, consent_at: T0 };
const Be = { ...Bc, emotion_declared_at: T0 };

function world(extra = {}) {
  const bAs = extra.b || B;
  return fakeWorld({
    tables: {
      profiles: (q) => q.includes('telegram_user_id=eq.1001') ? [A] : q.includes('telegram_user_id=eq.1002') ? [bAs]
        : q.includes('id=eq.a-id') ? [A] : q.includes('id=eq.b-id') ? [bAs] : [],
      exchanges: (q) => q.includes('status=eq.open') && q.includes('a-id') ? [{ id: 'x1', participants: ['a-id', 'b-id'] }] : [],
      app_settings: [{ value: 'exhibit-consent-1' }],
      invites: (q) => q.includes('claimed_by=eq.b-id') ? [{ created_by: 'a-id' }] : [],
      ...extra.tables
    },
    rpc: {
      claim_invite: ({ p_code }) => p_code === 'badcode' ? (() => { throw new Error('INVITE_EXPIRED'); })()
        : { profile_id: 'b-id', handle: 'כרם-מלא', paired_with: 'a-id', consent_version: null },
      record_consent: () => ({ consent_version: 'exhibit-consent-1' }),
      declare_state: ({ p_emotion, p_color, p_reset }) => ({
        emotion: p_emotion || 'trust', color: p_color || 'lime',
        emotionDeclared: !p_reset && (!!p_emotion || extra.emotionAlready === true),
        colorDeclared: !p_reset && !!p_color
      }),
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

  it('consent is recorded, then the bot asks for an emotion with a keyboard, and does not pair yet', async () => {
    const w = world(); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1002, 'מסכים'));
    expect(w.calls.rpc.map(([n]) => n)).toEqual(['record_consent']);
    const ask = w.calls.sends.at(-1);
    expect(ask.text).toContain('איזה רגש');
    expect(ask.reply_markup.keyboard.flat().map((b) => b.text)).toContain('אמון');
  });

  it('an emotion answer is declared and the bot asks for a color', async () => {
    const w = world({ b: Bc }); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1002, 'אמון'));
    expect(w.calls.rpc).toEqual([['declare_state', { p_profile: 'b-id', p_emotion: 'trust', p_color: null }]]);
    const ask = w.calls.sends.at(-1);
    expect(ask.text).toContain('צבע');
    expect(ask.reply_markup.keyboard.flat().map((b) => b.text)).toContain('ליים');
  });

  it('the color answer completes it: confirmed, keyboard removed, then the pair opens and both are told', async () => {
    const w = world({ b: Be, emotionAlready: true }); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1002, 'ליים'));
    expect(w.calls.rpc.map(([n]) => n)).toEqual(['declare_state', 'open_exchange']);
    expect(w.calls.sends[0]).toMatchObject({ chat_id: 1002, reply_markup: { remove_keyboard: true } });
    expect(w.calls.sends[0].text).toContain('אמון');
    expect(w.calls.sends.map((s) => s.chat_id)).toEqual([1002, 1002, 1001]);
    expect(w.calls.sends[2].text).toContain('כרם-מלא');
  });

  it('anything that is not an answer gets the same question again and is not relayed', async () => {
    const w = world({ b: Bc }); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1002, 'שלום, מה נשמע?'));
    expect(w.calls.rpc).toEqual([]);
    expect(w.calls.sends).toHaveLength(1);
    expect(w.calls.sends[0].text).toContain('איזה רגש');
  });

  it('/invite waits until both answers are in', async () => {
    const w = world({ b: Be }); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1002, '/invite'));
    expect(w.calls.rpc).toEqual([]);
    expect(w.calls.sends[0].text).toBe('ואיזה צבע?');
  });

  it('/state clears both answers and asks again', async () => {
    const w = world(); const tg = makeTelegram(w.env, makeDb(w.env, w.fetchImpl), w.fetchImpl);
    await tg.handle(tgUpdate(1001, '/state'));
    expect(w.calls.rpc).toEqual([['declare_state', { p_profile: 'a-id', p_reset: true }]]);
    expect(w.calls.sends[0].text).toContain('איזה רגש');
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
