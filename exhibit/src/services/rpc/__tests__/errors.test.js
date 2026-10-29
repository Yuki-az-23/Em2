import { describe, it, expect } from 'vitest';
import { parseRpcError } from '../errors.js';

describe('parseRpcError', () => {
  it('reads RATE_LIMITED with retry seconds', () => {
    expect(parseRpcError({ message: 'RATE_LIMITED:120' })).toEqual({ code: 'RATE_LIMITED', message: '120', retryAfter: 120 });
  });
  it('reads bare codes', () => {
    expect(parseRpcError({ message: 'INVALID_NAME' }).code).toBe('INVALID_NAME');
    expect(parseRpcError({ message: 'NOT_FOUND' }).retryAfter).toBeNull();
  });
  it('falls back to storage unavailable for anything else', () => {
    expect(parseRpcError({ message: 'fetch failed' }).code).toBe('STORAGE_UNAVAILABLE');
    expect(parseRpcError(null).code).toBe('STORAGE_UNAVAILABLE');
  });
});
