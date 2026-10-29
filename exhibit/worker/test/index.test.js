import { describe, it, expect } from 'vitest';
import { app } from '../src/index.js';
import { fakeWorld, tgUpdate } from './helpers.js';

describe('routes', () => {
  it('/health reports what is configured', async () => {
    const w = fakeWorld();
    const res = await app.request('/health', {}, w.env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, hasDb: true, hasBot: true });
  });

  it('/telegram refuses a wrong secret before touching anything', async () => {
    const w = fakeWorld();
    const res = await app.request('/telegram', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'wrong', 'Content-Type': 'application/json' }, body: JSON.stringify(tgUpdate(1, '/help')) }, w.env);
    expect(res.status).toBe(403);
    expect(w.calls.rpc.length + w.calls.selects.length).toBe(0);
  });

  it('/telegram with the secret answers ok at once', async () => {
    const w = fakeWorld({ tables: { profiles: [] } });
    const res = await app.request('/telegram', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'shh', 'Content-Type': 'application/json' }, body: JSON.stringify(tgUpdate(1, 'hi')) }, w.env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('/mcp is honest about not existing yet', async () => {
    const res = await app.request('/mcp', { method: 'POST' }, fakeWorld().env);
    expect(res.status).toBe(501);
  });
});
