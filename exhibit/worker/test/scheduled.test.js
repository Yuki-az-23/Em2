import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { STUCK_AFTER_MS, STUCK_CODE } from '../src/index.js';
import { fakeWorld } from './helpers.js';

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const STUCK = '22222222-2222-4222-8222-222222222222';
const FAILED = '33333333-3333-4333-8333-333333333333';

function ctx() {
  const pending = [];
  return { pending, waitUntil: (p) => pending.push(p), settle: () => Promise.all(pending) };
}

afterEach(() => vi.restoreAllMocks());

describe('cron', () => {
  it('marks exchanges stuck in closed for more than 15 minutes as failed, by id only', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const w = fakeWorld({
      tables: { exchanges: (q) => (q.startsWith('status=eq.closed') ? [{ id: STUCK }] : []) },
      rpc: { mark_exchange_failed: () => null }
    });
    w.env.__now = () => NOW;
    const c = ctx();
    await worker.scheduled({}, w.env, c);
    await c.settle();

    const [, stuckQuery] = w.calls.selects.find(([t, q]) => t === 'exchanges' && q.startsWith('status=eq.closed'));
    const params = new URLSearchParams(stuckQuery);
    expect(params.get('status')).toBe('eq.closed');
    expect(params.get('closed_at')).toBe(`lt.${new Date(NOW - STUCK_AFTER_MS).toISOString()}`);
    expect(STUCK_AFTER_MS).toBe(15 * 60 * 1000);
    expect(params.get('select')).toBe('id');

    const marks = w.calls.rpc.filter(([n]) => n === 'mark_exchange_failed');
    expect(marks).toEqual([['mark_exchange_failed', { p_exchange: STUCK, p_code: STUCK_CODE }]]);
  });

  it('does nothing to exchanges that closed recently or none stuck', async () => {
    const w = fakeWorld({ tables: { exchanges: [] }, rpc: { mark_exchange_failed: () => null } });
    w.env.__now = () => NOW;
    const c = ctx();
    await worker.scheduled({}, w.env, c);
    await c.settle();
    expect(w.calls.rpc.length).toBe(0);
  });

  it('marks first, then retries failed exchanges that have attempts left', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const order = [];
    const w = fakeWorld({
      tables: {
        exchanges: (q) => {
          if (q.startsWith('status=eq.closed')) { order.push('select-stuck'); return [{ id: STUCK }]; }
          order.push('select-failed'); return [{ id: FAILED }];
        }
      },
      rpc: {
        mark_exchange_failed: () => { order.push('mark'); return null; },
        exchange_bundle: () => { order.push('bundle'); return { id: FAILED, participants: [], messages: [] }; }
      }
    });
    w.env.PIPELINE_MAX_ATTEMPTS = '3';
    const c = ctx();
    await worker.scheduled({}, w.env, c);
    await c.settle();
    expect(order.slice(0, 3)).toEqual(['select-stuck', 'mark', 'select-failed']);
    const [, failedQuery] = w.calls.selects.find(([, q]) => q.startsWith('status=eq.failed'));
    expect(new URLSearchParams(failedQuery).get('attempts')).toBe('lt.3');
    expect(w.calls.rpc.some(([n, p]) => n === 'exchange_bundle' && p.p_exchange === FAILED)).toBe(true);
  });

  it('a failing mark does not stop the retry pass', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const w = fakeWorld({
      tables: { exchanges: (q) => (q.startsWith('status=eq.closed') ? [{ id: STUCK }] : [{ id: FAILED }]) },
      rpc: {
        mark_exchange_failed: () => { throw new Error('STORAGE_UNAVAILABLE'); },
        exchange_bundle: () => ({ id: FAILED, participants: [], messages: [] })
      }
    });
    const c = ctx();
    await worker.scheduled({}, w.env, c);
    await c.settle();
    expect(w.calls.rpc.some(([n]) => n === 'exchange_bundle')).toBe(true);
  });
});
