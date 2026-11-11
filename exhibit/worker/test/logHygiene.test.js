import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { app, makePipelineLog } from '../src/index.js';
import { runPipeline } from '../src/pipeline.js';
import { makeDb } from '../src/supabase.js';
import { makeAi } from '../src/ai.js';
import { fakeWorld } from './helpers.js';

const consent = { version: 'exhibit-consent-1', acceptedAt: '2026-10-20T10:00:00Z' };
const XID = '11111111-1111-4111-8111-111111111111';
const LINES = ['זוכר את החוף בחיפה עם דנה? הים היה שטוח.', 'secret plans for Tuesday at the old harbour'];
const NAMES = ['אלה כהן', 'בן לוי'];
const bundle = {
  id: XID, channel: 'telegram', status: 'closed', at: '2026-10-20T10:30:00Z',
  participants: [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: NAMES[0], pseudonym: 'נמל-שקט', emotion: 'joy', color: 'yellow', style: 'comic', consent },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: NAMES[1], pseudonym: 'כרם-מלא', emotion: 'sad', color: 'blue', style: 'watercolor', consent }
  ],
  messages: [
    { from: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', text: LINES[0], at: 't1' },
    { from: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', text: LINES[1], at: 't2' }
  ]
};
const words = [...LINES, ...NAMES, 'חיפה', 'דנה', 'harbour', 'Tuesday'];

// Every way a step can fail while echoing the conversation back in its error or output.
const echo = (input) => JSON.stringify(input.messages || input.prompt || input);
const failures = {
  'redaction throws with the text': { run: async (m, input) => { throw new Error(`model error on: ${echo(input)}`); } },
  'redaction returns the text unconfirmed': { run: async (m, input) => (input.response_format ? `I refuse: ${echo(input)}` : null) },
  'paraphrase throws with the text': { run: async (m, input) => { if (input.response_format) return { text: 'x', removed: [] }; throw new Error(`paraphrase failed: ${echo(input)}`); } },
  'paraphrase leaks a line': { run: async (m, input) => (input.response_format ? { text: 'x', removed: [] } : { response: LINES[1] }) },
  'render throws with the prompt': { run: async (m, input) => { if (input.response_format) return { text: 'x', removed: [] }; if (input.messages) return { response: 'שניים מדברים.' }; throw new Error(`render: ${echo(input)} ${LINES[0]}`); } }
};

function captured() {
  const lines = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...a) => { lines.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a) => { lines.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation((...a) => { lines.push(a.map(String).join(' ')); });
  return { lines, spy };
}

afterEach(() => vi.restoreAllMocks());

describe('pipeline logs never carry message text', () => {
  for (const [name, ai] of Object.entries(failures)) {
    it(`${name}`, async () => {
      const { lines } = captured();
      const world = fakeWorld({
        ai,
        rpc: {
          publish_post: () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          set_post_image: () => null,
          mark_exchange_failed: () => { throw new Error(`could not mark: ${LINES[0]}`); }
        }
      });
      const images = { put: async () => { throw new Error(LINES[1]); } };
      await runPipeline(bundle, { db: makeDb(world.env, world.fetchImpl), ai: makeAi(world.env), images, log: makePipelineLog('[pipeline]') });
      expect(lines.length).toBeGreaterThan(0);
      const all = lines.join('\n');
      for (const w of words) expect(all).not.toContain(w);
      expect(all).toContain(XID);
    });
  }

  it('keeps ids and error codes, withholds everything else', () => {
    const out = [];
    const log = makePipelineLog('[t]', (...a) => out.push(a));
    log('pipeline_failed', XID, 'LEAK_DETECTED', 'raw message text present on card');
    log('render_failed', XID, new Error(LINES[0]));
    log('x', 3, '', { text: LINES[1] }, 'hello');
    expect(out).toEqual([
      ['[t]', 'pipeline_failed', XID, 'LEAK_DETECTED', '[withheld]'],
      ['[t]', 'render_failed', XID, '[withheld]'],
      ['[t]', 'x', 3, '', '[withheld]', '[withheld]']
    ]);
  });

  it('the cron retry logs no message text either', async () => {
    const { lines } = captured();
    const world = fakeWorld({
      ai: failures['paraphrase throws with the text'],
      tables: { exchanges: (q) => (q.startsWith('status=eq.failed') ? [{ id: XID }] : []) },
      rpc: { exchange_bundle: () => bundle, mark_exchange_failed: () => null }
    });
    const pending = [];
    await worker.scheduled({}, world.env, { waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
    const all = lines.join('\n');
    expect(all).toContain('pipeline_failed');
    for (const w of words) expect(all).not.toContain(w);
  });
});

describe('webhook secret', () => {
  it('refuses every request while no secret is configured, even with no header', async () => {
    const w = fakeWorld();
    delete w.env.TELEGRAM_WEBHOOK_SECRET;
    const res = await app.request('/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, w.env);
    expect(res.status).toBe(403);
    expect(w.calls.rpc.length + w.calls.selects.length).toBe(0);
  });
});
