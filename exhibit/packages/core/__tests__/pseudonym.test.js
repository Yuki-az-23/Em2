import { describe, it, expect } from 'vitest';
import { makePseudonym, makeCode, PSEUDONYM_WORDS } from '../src/pseudonym.js';

describe('pseudonym', () => {
  it('is two words from the lists joined by a hyphen', () => {
    const p = makePseudonym();
    const [a, b] = p.split('-');
    expect(PSEUDONYM_WORDS.FIRST).toContain(a);
    expect(PSEUDONYM_WORDS.SECOND).toContain(b);
  });

  it('is deterministic under an injected random source', () => {
    const zero = () => 0;
    expect(makePseudonym(zero)).toBe('נמל-שקט');
    expect(makeCode(zero)).toBe('a'.repeat(22));
  });

  it('never contains the visitor name because it never receives it', () => {
    expect(makePseudonym.length).toBe(1); // only the random source
  });

  it('codes are 22 url-safe characters', () => {
    expect(makeCode()).toMatch(/^[a-z2-9]{22}$/);
  });
});
