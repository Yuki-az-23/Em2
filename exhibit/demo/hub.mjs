/**
 * The demo hub: one local port that stands in for Supabase's gateway, the
 * Cloudflare Worker and Telegram, so the exhibit runs end to end offline.
 *
 *   /rest/v1/*                    -> PostgREST (the site and the worker use it as Supabase)
 *   /hermes/*                     -> the worker's own Hono app, in this process
 *   /fake-telegram/bot<t>/<meth>  -> where the worker's bot replies land
 *   GET  /demo/chats/:id          -> one simulated Telegram chat
 *   POST /demo/chats/:id/say      -> a person types; becomes a Telegram update to /hermes/telegram
 *   GET  /demo/health
 *   /auth/v1/*, /realtime/v1/*, /storage/v1/*  -> "not in the light demo"
 */
import { createServer } from 'node:http';
import { app as hermes } from '../worker/src/index.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'apikey,authorization,content-type,x-client-info,prefer,accept,accept-profile,content-profile,range,x-forwarded-for',
  'access-control-expose-headers': 'content-range'
};

const HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive']);

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? Buffer.concat(chunks) : null;
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !(body instanceof Buffer);
  res.writeHead(status, { ...CORS, 'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

export function startHub({ port, host = '127.0.0.1', postgrestUrl, workerEnv, log = console.log }) {
  /** chatId -> [{from:'me'|'bot', text, at}] */
  const chats = new Map();
  const pending = new Set();
  let updateId = 1;
  const chat = (id) => { const k = String(id); if (!chats.has(k)) chats.set(k, []); return chats.get(k); };

  const ctx = {
    waitUntil(p) {
      const t = Promise.resolve(p).catch((e) => log('[hermes] background error', e?.code || e?.message || e)).finally(() => pending.delete(t));
      pending.add(t);
    },
    passThroughOnException() {}
  };

  async function toHermes(path, method, headers, body) {
    const req = new Request(`http://hermes.local${path}`, { method, headers, body: body ?? undefined });
    return hermes.fetch(req, workerEnv, ctx);
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const p = url.pathname;
      if (req.method === 'OPTIONS') return send(res, 204, '');

      if (p.startsWith('/rest/v1/')) {
        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) headers[k] = v;
        headers['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const body = ['GET', 'HEAD'].includes(req.method) ? null : await readBody(req);
        const r = await fetch(`${postgrestUrl}${p.slice('/rest/v1'.length)}${url.search}`, { method: req.method, headers, body });
        const out = Buffer.from(await r.arrayBuffer());
        const rh = {};
        r.headers.forEach((v, k) => { if (!HOP.has(k) && !k.startsWith('access-control-') && k !== 'content-encoding') rh[k] = v; });
        res.writeHead(r.status, { ...CORS, ...rh });
        return res.end(out);
      }

      if (p.startsWith('/hermes/')) {
        const body = ['GET', 'HEAD'].includes(req.method) ? null : await readBody(req);
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !HOP.has(k)));
        const r = await toHermes(p.slice('/hermes'.length) + url.search, req.method, headers, body);
        res.writeHead(r.status, { ...CORS, 'content-type': r.headers.get('content-type') || 'text/plain' });
        return res.end(Buffer.from(await r.arrayBuffer()));
      }

      const tg = /^\/fake-telegram\/bot[^/]+\/(\w+)$/.exec(p);
      if (tg) {
        const body = JSON.parse(String(await readBody(req) || '{}'));
        if (tg[1] === 'sendMessage') chat(body.chat_id).push({ from: 'bot', text: String(body.text || ''), at: new Date().toISOString() });
        return send(res, 200, { ok: true, result: { message_id: Date.now() } });
      }

      const c = /^\/demo\/chats\/(-?\d+)(\/say)?$/.exec(p);
      if (c && req.method === 'GET' && !c[2]) return send(res, 200, { chatId: Number(c[1]), messages: chat(c[1]) });
      if (c && req.method === 'POST' && c[2]) {
        const { text } = JSON.parse(String(await readBody(req) || '{}'));
        if (typeof text !== 'string' || !text.trim()) return send(res, 400, { error: 'text required' });
        const id = Number(c[1]);
        chat(id).push({ from: 'me', text, at: new Date().toISOString() });
        const update = {
          update_id: updateId++,
          message: { message_id: updateId, date: Math.floor(Date.now() / 1000), chat: { id, type: 'private' }, from: { id, is_bot: false, first_name: 'Demo' }, text }
        };
        const r = await toHermes('/telegram', 'POST', {
          'content-type': 'application/json',
          'x-telegram-bot-api-secret-token': workerEnv.TELEGRAM_WEBHOOK_SECRET
        }, JSON.stringify(update));
        return send(res, r.status === 200 ? 200 : 502, { ok: r.status === 200 });
      }

      if (p === '/demo/health') return send(res, 200, { ok: true, chats: chats.size, background: pending.size });
      if (p === '/demo/idle') { await Promise.allSettled([...pending]); return send(res, 200, { ok: true }); }
      if (p.startsWith('/auth/v1/') || p.startsWith('/realtime/v1/') || p.startsWith('/storage/v1/')) {
        return send(res, 501, { message: 'NOT_IN_LIGHT_DEMO:accounts, realtime and storage need full Supabase' });
      }
      return send(res, 404, { message: 'NOT_FOUND' });
    } catch (e) {
      log('[hub] error', e?.message || e);
      return send(res, 500, { message: 'HUB_ERROR' });
    }
  });

  // Realtime websockets are refused; the site falls back to polling.
  server.on('upgrade', (_req, socket) => socket.destroy());

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve({ server, url: `http://127.0.0.1:${port}`, chats, idle: () => Promise.allSettled([...pending]) }));
  });
}
