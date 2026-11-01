/** Fake Supabase and Telegram behind fetch, plus a fake AI, for worker tests. */
export function fakeWorld({ rpc = {}, tables = {}, ai = {} } = {}) {
  const calls = { rpc: [], sends: [], selects: [] };
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('api.telegram.org')) { calls.sends.push(JSON.parse(init.body)); return new Response('{"ok":true}', { status: 200 }); }
    const m = /\/rest\/v1\/rpc\/([a-z_]+)$/.exec(u);
    if (m) {
      const params = JSON.parse(init.body || '{}');
      calls.rpc.push([m[1], params]);
      const h = rpc[m[1]];
      if (!h) return new Response(JSON.stringify({ message: 'NOT_FOUND' }), { status: 404 });
      try { const out = typeof h === 'function' ? await h(params) : h; return new Response(JSON.stringify(out ?? null), { status: 200 }); }
      catch (e) { return new Response(JSON.stringify({ message: e.message }), { status: 400 }); }
    }
    const t = /\/rest\/v1\/([a-z_]+)\?(.*)$/.exec(u);
    if (t) {
      calls.selects.push([t[1], t[2]]);
      const h = tables[t[1]];
      const rows = typeof h === 'function' ? h(t[2]) : (h || []);
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (u.includes('/storage/v1/object/')) return new Response('{}', { status: 200 });
    return new Response('nope', { status: 500 });
  };
  const env = {
    SUPABASE_URL: 'https://api.example.test', SUPABASE_SERVICE_ROLE_KEY: 'service', TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_WEBHOOK_SECRET: 'shh',
    AI: { run: async (model, input) => (ai.run ? ai.run(model, input) : null) },
    __fetch: fetchImpl
  };
  return { env, calls, fetchImpl };
}

export const tgUpdate = (userId, text) => ({ message: { message_id: 1, chat: { id: userId, type: 'private' }, from: { id: userId }, text } });
