import { describe, it, expect } from 'vitest';
import {
  EMOTIONS, COLORS, d8, dir8, stepToward, relation, point, names,
  resonance, torusDistance, stepInteraction, emotionIndex, isEmotion
} from '../src/ring.js';

describe('ring: distance and direction', () => {
  it('shortest arc wraps around', () => {
    expect(d8(0, 7)).toBe(1);
    expect(d8(0, 4)).toBe(4);
    expect(d8(2, 6)).toBe(4);
    expect(d8(3, 3)).toBe(0);
  });

  it('dir8 follows the shortest arc and breaks the d=4 tie clockwise', () => {
    expect(dir8(0, 1)).toBe(1);
    expect(dir8(0, 7)).toBe(-1);
    expect(dir8(0, 4)).toBe(1);   // opposite: no freeze
    expect(dir8(5, 5)).toBe(0);
  });

  it('stepToward moves one step and stops at the target', () => {
    expect(stepToward(0, 3)).toBe(1);
    expect(stepToward(0, 3, 5)).toBe(3);
    expect(stepToward(7, 1)).toBe(0);
  });
});

describe('ring: relations replace the lookup tables', () => {
  it('matches Plutchik opposites by distance 4', () => {
    const pairs = [['joy', 'sad'], ['trust', 'disgust'], ['feared', 'angry'], ['surprised', 'anticipated']];
    for (const [a, b] of pairs) {
      expect(relation(emotionIndex(a), emotionIndex(b))).toBe('opposite');
    }
  });

  it('classifies every pair into exactly one of four classes', () => {
    const counts = { same: 0, adjacent: 0, opposite: 0, neutral: 0 };
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) counts[relation(a, b)]++;
    expect(counts).toEqual({ same: 8, adjacent: 16, opposite: 8, neutral: 32 });
  });

  it('is case-insensitive', () => {
    expect(isEmotion('Joy')).toBe(true);
    expect(isEmotion('joy')).toBe(true);
    expect(point('Sad', 'BLUE')).toEqual({ e: 4, c: 4 });
    expect(names(point('Joy', 'yellow'))).toEqual({ emotion: 'joy', color: 'yellow' });
  });
});

describe('torus: resonance', () => {
  it('is 1 for identical points and 0 for doubly opposite points', () => {
    const p = point('joy', 'yellow');
    expect(resonance(p, p)).toBe(1);
    expect(resonance(p, point('sad', 'blue'))).toBe(0);
    expect(torusDistance(p, point('trust', 'lime'))).toBe(2);
  });
});

describe('interaction: one step toward the reader', () => {
  it('moves the object one step on each ring and reports relations', () => {
    const reader = point('joy', 'yellow');
    const object = point('sad', 'blue');
    const r = stepInteraction(reader, object);
    expect(names(r.next)).toEqual({ emotion: 'disgust', color: 'pink' }); // clockwise tie-break
    expect(r.emotionRelation).toBe('opposite');
    expect(r.colorRelation).toBe('opposite');
  });

  it('is a fixed point when reader and object agree', () => {
    const p = point('trust', 'lime');
    expect(stepInteraction(p, p).next).toEqual(p);
  });

  it('exhaustively stays on the torus for all 64x64 pairs', () => {
    for (let re = 0; re < 8; re++) for (let rc = 0; rc < 8; rc++)
      for (let oe = 0; oe < 8; oe++) for (let oc = 0; oc < 8; oc++) {
        const { next } = stepInteraction({ e: re, c: rc }, { e: oe, c: oc });
        expect(next.e).toBeGreaterThanOrEqual(0); expect(next.e).toBeLessThan(8);
        expect(next.c).toBeGreaterThanOrEqual(0); expect(next.c).toBeLessThan(8);
        expect(d8(next.e, oe)).toBeLessThanOrEqual(1);
        expect(d8(next.c, oc)).toBeLessThanOrEqual(1);
      }
  });

  it('exports eight emotions and eight colors in wheel order', () => {
    expect(EMOTIONS).toHaveLength(8);
    expect(COLORS).toHaveLength(8);
    expect(EMOTIONS[0]).toBe('joy');
    expect(EMOTIONS[4]).toBe('sad');
  });
});
