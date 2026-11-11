/**
 * Hermes. Routes: /health, /telegram (webhook), /mcp (phase 2), and a cron
 * that fails exchanges stuck in 'closed' and retries failed ones.
 */
import { Hono } from 'hono';
import { secretMatches } from '@hermes/core/telegram';
import { makeDb } from './supabase.js';
import { makeAi } from './ai.js';
import { makeTelegram } from './telegram.js';
import { runPipeline, makeImageStore } from './pipeline.js';

export const app = new Hono();

/** An exchange still 'closed' this long after closing lost its pipeline run (waitUntil ends at 30 s). */
export const STUCK_AFTER_MS = 15 * 60 * 1000;
export const STUCK_CODE = 'PIPELINE_TIMEOUT';

/**
 * Pipeline logs carry only identifiers and codes. Any other argument (an
 * error message, a model's reply, a detail string) is replaced, so no word a
 * participant wrote can reach the Worker's logs, whatever a dependency puts
 * into its errors.
 */
const SAFE_LOG_TOKEN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Z][A-Z0-9_]{1,63})$/;   // a uuid or an ERROR_CODE
const safeLogArg = (a) => (typeof a === 'number' || a === '' || (typeof a === 'string' && SAFE_LOG_TOKEN.test(a))) ? a : '[withheld]';
export function makePipelineLog(tag, sink = console.log) {
  return (event, ...args) => sink(tag, String(event), ...args.map(safeLogArg));
}

app.get('/health', (c) => c.json({ ok: true, service: 'hermes', at: new Date().toISOString(), hasDb: !!(c.env.SUPABASE_URL && c.env.SUPABASE_SERVICE_ROLE_KEY), hasBot: !!c.env.TELEGRAM_BOT_TOKEN }));

app.post('/telegram', async (c) => {
  const given = c.req.header('X-Telegram-Bot-Api-Secret-Token') || '';
  const expected = c.env.TELEGRAM_WEBHOOK_SECRET || '';
  // An unset secret must not match an absent header (the window between deploy and `secret put`).
  if (!expected || !secretMatches(given, expected)) return c.text('forbidden', 403);
  let update;
  try { update = await c.req.json(); } catch { return c.text('bad request', 400); }
  const db = makeDb(c.env, c.env.__fetch);
  const tg = makeTelegram(c.env, db, c.env.__fetch);
  const ai = makeAi(c.env);
  const images = makeImageStore(c.env);
  const work = tg.handle(update, (bundle) => runPipeline(bundle, { db, ai, images, log: makePipelineLog('[pipeline]') }));
  // Reply to Telegram at once; finish the work in the background.
  let ctx = null;
  try { ctx = c.executionCtx; } catch { ctx = null; }   // Hono throws when there is no runtime context (tests)
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(work); else await work;
  return c.text('ok');
});

app.all('/mcp', (c) => c.json({ error: 'NOT_YET', message: 'MCP arrives in phase 2. Agents can use get_feed and react_to_post with their key meanwhile.' }, 501));

app.notFound((c) => c.text('not found', 404));

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),

  /**
   * Cron, in two passes:
   *   1. an exchange still 'closed' more than STUCK_AFTER_MS after closing lost
   *      its run (the isolate ended); mark it failed so it can be retried;
   *   2. retry failed exchanges that have attempts left.
   */
  async scheduled(_event, env, ctx) {
    const db = makeDb(env, env.__fetch);
    const ai = makeAi(env);
    const images = makeImageStore(env);
    const log = makePipelineLog('[retry]');
    const max = Number(env.PIPELINE_MAX_ATTEMPTS || 3);
    const now = typeof env.__now === 'function' ? env.__now() : Date.now();
    const cutoff = new Date(now - STUCK_AFTER_MS).toISOString();
    const stuck = await db.select('exchanges', `status=eq.closed&closed_at=lt.${encodeURIComponent(cutoff)}&select=id&limit=50`);
    for (const x of stuck) {
      try { await db.rpc('mark_exchange_failed', { p_exchange: x.id, p_code: STUCK_CODE }); log('stuck_marked_failed', x.id, STUCK_CODE); }
      catch (e) { log('stuck_mark_error', x.id, e.code || 'UNKNOWN'); }
    }
    const rows = await db.select('exchanges', `status=eq.failed&attempts=lt.${max}&select=id&limit=20`);
    ctx.waitUntil(Promise.all(rows.map(async (x) => {
      try {
        const bundle = await db.rpc('exchange_bundle', { p_exchange: x.id });
        return await runPipeline(bundle, { db, ai, images, log });
      } catch (e) { log('retry_error', x.id, e.code || 'UNKNOWN'); return null; }
    })));
  }
};
