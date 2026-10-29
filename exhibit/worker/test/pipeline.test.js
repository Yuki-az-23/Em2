import { describe, it, expect } from 'vitest';
import { runPipeline } from '../src/pipeline.js';
import { makeDb } from '../src/supabase.js';
import { makeAi } from '../src/ai.js';
import { fakeWorld } from './helpers.js';

const consent = { version: 'exhibit-consent-1', acceptedAt: '2026-10-20T10:00:00Z' };
const bundle = {
  id: '11111111-1111-1111-1111-111111111111', channel: 'telegram', status: 'closed', at: '2026-10-20T10:30:00Z',
  participants: [
    { id: 'a-id', name: 'אלה כהן', pseudonym: 'נמל-שקט', emotion: 'joy', color: 'yellow', style: 'comic', consent },
    { id: 'b-id', name: 'בן לוי', pseudonym: 'כרם-מלא', emotion: 'sad', color: 'blue', style: 'watercolor', consent }
  ],
  messages: [
    { from: 'a-id', text: 'זוכר את החוף בחיפה עם דנה? הים היה שטוח.', at: 't1' },
    { from: 'b-id', text: 'זוכר. אמרת שים שטוח אומר שמותר להתחיל מחדש.', at: 't2' }
  ]
};

const goodAi = {
  run: async (model, input) => {
    if (input.response_format) return { text: input.messages[1].content.replace(/חיפה|דנה/g, '[מושחר]'), removed: ['חיפה', 'דנה'] };
    if (input.messages) return { response: 'שניים נזכרים בקו חוף שקט ובהבטחה להתחיל שוב.' };
    return null; // no image
  }
};

describe('runPipeline', () => {
  it('publishes a card with the assigned state, pseudonyms and paraphrase, never names or words', async () => {
    const world = fakeWorld({ ai: goodAi, rpc: { publish_post: () => 'post-1' } });
    const db = makeDb(world.env, world.fetchImpl); const ai = makeAi(world.env);
    const r = await runPipeline(bundle, { db, ai, now: () => '2026-10-20T10:31:00Z' });
    expect(r).toEqual({ ok: true, postId: 'post-1' });
    const [name, params] = world.calls.rpc.find(([n]) => n === 'publish_post');
    expect(name).toBe('publish_post');
    const card = params.p_card;
    expect(card.pseudonyms).toEqual(['נמל-שקט', 'כרם-מלא']);
    expect(card.emotion).toBe('feared'); expect(card.color).toBe('green');     // midpoint of joy/yellow and sad/blue
    expect(JSON.stringify(card)).not.toMatch(/אלה|בן לוי|חיפה|דנה|a-id|b-id/);
    expect(card.provenance.exchangeId).toBe(bundle.id);
    expect(card.provenance.redactionRemoved).toBe(2);
  });

  it('fails closed and marks the exchange when the model returns no JSON', async () => {
    const badAi = { run: async () => 'sorry, I cannot help with that' };
    const world = fakeWorld({ ai: badAi, rpc: { publish_post: () => 'post-1', mark_exchange_failed: () => null } });
    const db = makeDb(world.env, world.fetchImpl); const ai = makeAi(world.env);
    const r = await runPipeline(bundle, { db, ai });
    expect(r.ok).toBe(false); expect(r.code).toBe('REDACTION_UNCONFIRMED');
    expect(world.calls.rpc.some(([n]) => n === 'publish_post')).toBe(false);
    expect(world.calls.rpc.find(([n]) => n === 'mark_exchange_failed')[1]).toEqual({ p_exchange: bundle.id, p_code: 'REDACTION_UNCONFIRMED' });
  });

  it('refuses a paraphrase that leaks a line, and never publishes it', async () => {
    const leaky = { run: async (m, input) => input.response_format ? { text: 'x', removed: [] } : { response: 'זוכר. אמרת שים שטוח אומר שמותר להתחיל מחדש.' } };
    const world = fakeWorld({ ai: leaky, rpc: { publish_post: () => 'post-1', mark_exchange_failed: () => null } });
    const r = await runPipeline(bundle, { db: makeDb(world.env, world.fetchImpl), ai: makeAi(world.env) });
    expect(r.code).toBe('LEAK_DETECTED');
    expect(world.calls.rpc.some(([n]) => n === 'publish_post')).toBe(false);
  });

  it('refuses without consent from both', async () => {
    const world = fakeWorld({ ai: goodAi, rpc: { publish_post: () => 'post-1', mark_exchange_failed: () => null } });
    const noConsent = { ...bundle, participants: [bundle.participants[0], { ...bundle.participants[1], consent: null }] };
    const r = await runPipeline(noConsent, { db: makeDb(world.env, world.fetchImpl), ai: makeAi(world.env) });
    expect(r.code).toBe('CONSENT_MISSING');
  });

  it('a card without a picture is still a card: render failure does not unpublish', async () => {
    const ai = { run: async (m, input) => input.messages ? goodAi.run(m, input) : (() => { throw new Error('image model down'); })() };
    const world = fakeWorld({ ai, rpc: { publish_post: () => 'post-2', set_post_image: () => null } });
    const images = { put: async () => 'https://images.example.test/post-2.png' };
    const r = await runPipeline(bundle, { db: makeDb(world.env, world.fetchImpl), ai: makeAi(world.env), images });
    expect(r).toEqual({ ok: true, postId: 'post-2' });
    expect(world.calls.rpc.some(([n]) => n === 'set_post_image')).toBe(false);
  });
});
