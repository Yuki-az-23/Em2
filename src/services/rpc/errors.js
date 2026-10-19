/**
 * Turn a PostgREST / PostgreSQL error raised by our SECURITY DEFINER
 * functions into {code, message, retryAfter}. Our functions raise messages
 * of the form 'CODE' or 'CODE:detail', so the code is always the prefix.
 */
export function parseRpcError(err) {
  const message = (err && err.message) || 'unknown error';
  const m = /^([A-Z_]+)(?::(.*))?$/.exec(message.trim());
  if (!m) {
    return { code: err?.code || 'STORAGE_UNAVAILABLE', message, retryAfter: null };
  }
  const code = m[1];
  const detail = m[2] || '';
  const retryAfter = code === 'RATE_LIMITED' && /^\d+$/.test(detail) ? Number(detail) : null;
  return { code, message: detail || code, retryAfter };
}
