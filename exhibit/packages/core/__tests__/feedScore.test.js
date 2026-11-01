import { describe, it, expect } from 'vitest';
import { feedScore, isShown, rankFeed } from '../src/feedScore.js';

const sadPost = { id: 'p1', initial_emotion: 'sad', initial_color: 'blue', emotion: 'sad', color: 'blue', braces: 0, created_at: '2026-10-20' };
const joyPost = { id: 'p2', initial_emotion: 'joy', initial_color: 'yellow', emotion: 'joy', color: 'yellow', braces: 3, created_at: '2026-10-19' };

describe('feedScore', () => {
  it('scores identical state as 1 and doubly opposite as 0', () => {
    expect(feedScore({ emotion: 'sad', color: 'blue' }, sadPost)).toBeCloseTo(1, 5);
    expect(feedScore({ emotion: 'joy', color: 'yellow' }, sadPost)).toBeCloseTo(0, 5);
  });
  it('hides below epsilon unless the crack opens', () => {
    expect(isShown({ emotion: 'joy', color: 'yellow' }, sadPost, { pi: 0 })).toBe(false);
    expect(isShown({ emotion: 'joy', color: 'yellow' }, sadPost, { pi: 1 })).toBe(true);
    expect(isShown({ emotion: 'sad', color: 'blue' }, sadPost, { pi: 0 })).toBe(true);
  });
  it('ranks by score with braces as a small bonus', () => {
    const ranked = rankFeed({ emotion: 'joy', color: 'yellow' }, [sadPost, joyPost], { pi: 0 });
    expect(ranked.map(r => r.post.id)).toEqual(['p2']);
    expect(ranked[0].score).toBeGreaterThan(1);
  });
});
