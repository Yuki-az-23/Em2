/**
 * Hermes. Routes: /health, /telegram (webhook), /mcp (phase 2), and a cron
 * that retries failed exchanges and snapshots the wall for "resting" mode.
 */
import { Hono } from 'hono';
import { secretMatches } from '@hermes/core/telegram';
import { makeDb } from './supabase.js';
import { makeAi } from './ai.js';
import { makeTelegram } from './telegram.js';
import { runPipeline, makeImageStore } from './pipeline.js';

export const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'hermes', at: new Date().toISOString(), hasDb: !!(c.env.SUPABASE_URL && c.env.SUPABASE_SERVICE_ROLE_KEY), hasBot: !!c.env.TELEGRAM_BOT_TOKEN }));

app.post('/telegram', async (c) => {
  const given = c.req.header('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!secretMatches(given, c.env.TELEGRAM_WEBHOOK_SECRET || '')) return c.text('forbidden', 403);
  let update;
  try { update = await c.req.json(); } catch { return c.text('bad request', 400); }
  const db = makeDb(c.env, c.env.__fetch);
  const tg = makeTelegram(c.env, db, c.env.__fetch);
  const ai = makeAi(c.env);
  const images = makeImageStore(c.env);
  const work = tg.handle(update, (bundle) => runPipeline(bundle, { db, ai, images, log: (...a) => console.log('[pipeline]', ...a) }));
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

  /** Cron: retry failed exchanges that have attempts left. */
  async scheduled(_event, env, ctx) {
    const db = makeDb(env);
    const ai = makeAi(env);
    const images = makeImageStore(env);
    const max = Number(env.PIPELINE_MAX_ATTEMPTS || 3);
    const rows = await db.select('exchanges', `status=eq.failed&attempts=lt.${max}&select=id&limit=20`);
    ctx.waitUntil(Promise.all(rows.map(async (x) => {
      const bundle = await db.rpc('exchange_bundle', { p_exchange: x.id });
      return runPipeline(bundle, { db, ai, images, log: (...a) => console.log('[retry]', ...a) });
    })));
  }
};
