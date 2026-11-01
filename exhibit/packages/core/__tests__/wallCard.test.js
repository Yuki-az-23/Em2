import { describe, it, expect } from 'vitest';
import { exchangeToWallCard, findLeak, ERR, CONSENT_VERSION } from '../src/wallCard.js';

const consent = { version: CONSENT_VERSION, acceptedAt: '2026-10-19T20:00:00Z' };

function exchange(overrides = {}) {
  return {
    id: 'x1',
    participants: [
      { id: 'user_alice_001', name: 'Alice Cohen', pseudonym: 'quiet-harbor', consent },
      { id: 'user_bob_0002', name: 'Bob Levi', pseudonym: 'late-orchard', consent }
    ],
    messages: [
      { from: 'user_alice_001', text: 'Remember the beach in Haifa with Dana? The sea was flat.', at: '2026-10-19T20:01:00Z' },
      { from: 'user_bob_0002', text: 'I remember. You said flat sea means we are allowed to start over.', at: '2026-10-19T20:02:00Z' }
    ],
    assigned: { emotion: 'Sad', color: 'blue', intensity: 1.2, confidence: 0.9 },
    seed: 'two figures, still water, dusk',
    at: '2026-10-19T20:03:00Z',
    ...overrides
  };
}

const goodDeps = {
  redact: (text) => ({ text: text.replace(/Haifa|Dana/g, '[redacted]'), removed: ['Haifa', 'Dana'], confirmed: true }),
  paraphrase: () => 'Two people recall a calm shoreline and a promise to begin again.',
  now: () => '2026-10-19T20:05:00Z'
};

describe('exchangeToWallCard: the happy path', () => {
  it('produces a card with pseudonyms, assigned state and paraphrase only', () => {
    const r = exchangeToWallCard(exchange(), goodDeps);
    expect(r.ok).toBe(true);
    const c = r.card;
    expect(c.pseudonyms).toEqual(['quiet-harbor', 'late-orchard']);
    expect(c.emotion).toBe('sad');
    expect(c.color).toBe('blue');
    expect(c.paraphrase).toMatch(/shoreline/);
    expect(c.provenance.redactionRemoved).toBe(2);
    expect(c.provenance.messageCount).toBe(2);
    expect(c.createdAt).toBe('2026-10-19T20:05:00Z');
  });

  it('never carries raw words or real names', () => {
    const r = exchangeToWallCard(exchange(), goodDeps);
    const s = JSON.stringify(r.card);
    expect(s).not.toMatch(/Alice|Bob|Haifa|Dana|flat sea/i);
    expect(findLeak(r.card, exchange())).toBeNull();
  });

  it('normalizes the assigned state to lowercase ring names', () => {
    const r = exchangeToWallCard(exchange({ assigned: { emotion: 'JOY', color: 'Yellow' } }), goodDeps);
    expect(r.card.emotion).toBe('joy');
    expect(r.card.color).toBe('yellow');
  });
});

describe('exchangeToWallCard: fails closed', () => {
  it('refuses without consent from every participant', () => {
    const ex = exchange();
    delete ex.participants[1].consent;
    const r = exchangeToWallCard(ex, goodDeps);
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe(ERR.CONSENT_MISSING);
    expect(r.error.detail).toBe('late-orchard');
  });

  it('refuses stale consent versions', () => {
    const ex = exchange();
    ex.participants[0].consent = { version: 'exhibit-consent-0', acceptedAt: '2026-01-01T00:00:00Z' };
    expect(exchangeToWallCard(ex, goodDeps).error.code).toBe(ERR.CONSENT_STALE);
  });

  it('refuses when redaction did not confirm', () => {
    const deps = { ...goodDeps, redact: (t) => ({ text: t, removed: [], confirmed: false }) };
    expect(exchangeToWallCard(exchange(), deps).error.code).toBe(ERR.REDACTION_UNCONFIRMED);
  });

  it('refuses when redaction throws', () => {
    const deps = { ...goodDeps, redact: () => { throw new Error('model down'); } };
    const r = exchangeToWallCard(exchange(), deps);
    expect(r.error.code).toBe(ERR.REDACTION_FAILED);
    expect(r.error.detail).toBe('model down');
  });

  it('refuses an empty paraphrase', () => {
    const deps = { ...goodDeps, paraphrase: () => '   ' };
    expect(exchangeToWallCard(exchange(), deps).error.code).toBe(ERR.PARAPHRASE_FAILED);
  });

  it('refuses an assigned state off the torus', () => {
    expect(exchangeToWallCard(exchange({ assigned: { emotion: 'calm', color: 'blue' } }), goodDeps).error.code).toBe(ERR.INVALID_STATE);
  });

  it('refuses malformed exchanges', () => {
    expect(exchangeToWallCard(null, goodDeps).error.code).toBe(ERR.INVALID_EXCHANGE);
    expect(exchangeToWallCard(exchange({ messages: [] }), goodDeps).error.code).toBe(ERR.INVALID_EXCHANGE);
    expect(exchangeToWallCard(exchange({ participants: [exchange().participants[0]] }), goodDeps).error.code).toBe(ERR.INVALID_EXCHANGE);
  });

  it('refuses when dependencies are missing', () => {
    expect(exchangeToWallCard(exchange(), {}).error.code).toBe(ERR.REDACTION_FAILED);
  });

  it('catches a paraphrase that leaks a raw line or a name', () => {
    const leakyLine = { ...goodDeps, paraphrase: () => 'I remember. You said flat sea means we are allowed to start over.' };
    expect(exchangeToWallCard(exchange(), leakyLine).error.code).toBe(ERR.LEAK_DETECTED);
    const leakyName = { ...goodDeps, paraphrase: () => 'Alice Cohen misses the sea.' };
    expect(exchangeToWallCard(exchange(), leakyName).error.code).toBe(ERR.LEAK_DETECTED);
  });
});
