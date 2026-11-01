/**
 * Minimal Supabase REST client for the Worker: service role, no SDK.
 * rpc() calls a database function; select() reads a table; the error shape
 * matches src/services/rpc/errors.js on the site: {code, message, retryAfter}.
 */
export class SupabaseError extends Error {
  constructor(code, message, status) { super(message || code); this.code = code; this.status = status; }
}

export function parseDbError(body, status) {
  const message = (body && (body.message || body.error)) || `HTTP ${status}`;
  const m = /^([A-Z_]+)(?::(.*))?$/.exec(String(message).trim());
  return new SupabaseError(m ? m[1] : (status === 401 || status === 403 ? 'UNAUTHENTICATED' : 'STORAGE_UNAVAILABLE'), m ? (m[2] || m[1]) : message, status);
}

export function makeDb(env, fetchImpl = globalThis.fetch) {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new SupabaseError('MISCONFIGURED', 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  async function rpc(name, params = {}) {
    const res = await fetchImpl(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(params) });
    const text = await res.text();
    const body = text ? safeJson(text) : null;
    if (!res.ok) throw parseDbError(body, res.status);
    return body;
  }

  async function select(table, query) {
    const res = await fetchImpl(`${base}/rest/v1/${table}?${query}`, { headers: { ...headers, Accept: 'application/json' } });
    const body = safeJson(await res.text());
    if (!res.ok) throw parseDbError(body, res.status);
    return Array.isArray(body) ? body : [];
  }

  async function upload(bucket, path, bytes, contentType) {
    const res = await fetchImpl(`${base}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType, 'x-upsert': 'true' }, body: bytes
    });
    if (!res.ok) throw parseDbError(safeJson(await res.text()), res.status);
    return `${base}/storage/v1/object/public/${bucket}/${path}`;
  }

  return { rpc, select, upload };
}

function safeJson(text) { try { return JSON.parse(text); } catch { return { message: text }; } }
