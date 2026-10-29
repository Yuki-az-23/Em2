import { describe, it, expect } from 'vitest';
import { makeFakeAi } from '../src/fakeAi.js';
import { makeAi } from '../src/ai.js';
import { runPipeline } from '../src/pipeline.js';
import { makeDb } from '../src/supabase.js';
import { makeTelegram } from '../src/telegram.js';
import { fakeWorld, tgUpdate } from './helpers.js';

const consent = { version: 'exhibit-consent-1', acceptedAt: '2026-10-20T10:00:00Z' };

describe('fake model (demo only)', () => {
  it('AI_MODE=fake selects it, and it says so', () => {
    expect(makeAi({ AI_MODE: 'fake' }).textModel).toBe('demo-fake');
  });

  it('removes participant names, emails, phones and places, and confirms', async () => {
    const r = await makeFakeAi().redact('אלה כהן כתבה לבן מחיפה: ella@example.com, 050-123-4567. Dana knows.', { names: ['אלה כהן', 'בן'] });
    expect(r.confirmed).toBe(true);
    expect(r.text).not.toMatch(/אלה|כהן|חיפה|ella@example\.com|050-123-4567|Dana/);
    expect(r.removed.length).toBeGreaterThanOrEqual(5);
  });

  it('paraphrases without any word of the conversation', async () => {
    const p = await makeFakeAi().paraphrase('הים היה שטוח\nזוכר את החוף');
    expect(p).not.toMatch(/הים|שטוח|החוף/);
    expect(p).toMatch(/2/);
  });

  it('drives the real pipeline to a published card with model demo-fake and no names', async () => {
    const world = fakeWorld({ rpc: { publish_post: () => 'post-9' } });
    const env = { ...world.env, AI_MODE: 'fake' };
    const bundle = {
      id: '22222222-2222-2222-2222-222222222222', at: '2026-10-29T10:00:00Z',
      participants: [
        { id: 'a-id', name: 'אלה כהן', pseudonym: 'נמל-שקט', emotion: 'joy', color: 'yellow', consent },
        { id: 'b-id', name: 'בן לוי', pseudonym: 'כרם-מלא', emotion: 'sad', color: 'blue', consent }
      ],
      messages: [{ from: 'a-id', text: 'בן, זוכר את חיפה?', at: 't1' }, { from: 'b-id', text: 'כן אלה, הים היה שטוח.', at: 't2' }]
    };
    const r = await runPipeline(bundle, { db: makeDb(env, world.fetchImpl), ai: makeAi(env) });
    expect(r).toEqual({ ok: true, postId: 'post-9' });
    const card = world.calls.rpc.find(([n]) => n === 'publish_post')[1].p_card;
    expect(card.provenance.model).toBe('demo-fake');
    expect(JSON.stringify(card)).not.toMatch(/אלה|לוי|חיפה|שטוח/);
  });
});

describe('TELEGRAM_API_BASE', () => {
  it('sends bot replies to the configured base instead of api.telegram.org', async () => {
    const urls = [];
    const world = fakeWorld({ tables: { profiles: [] } });
    const fetchImpl = async (url, init) => { urls.push(String(url)); return world.fetchImpl(url, init); };
    const env = { ...world.env, TELEGRAM_API_BASE: 'http://127.0.0.1:54321/fake-telegram/' };
    const tg = makeTelegram(env, makeDb(env, fetchImpl), fetchImpl);
    await tg.handle(tgUpdate(5, 'hello'));
    expect(urls.some((u) => u === 'http://127.0.0.1:54321/fake-telegram/botbot/sendMessage')).toBe(true);
    expect(urls.some((u) => u.includes('api.telegram.org'))).toBe(false);
  });
});
