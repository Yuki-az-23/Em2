import { describe, it, expect } from 'vitest';
import { exchangeToAssigned } from '../src/exchangeToAssigned.js';

const A = { id: 'a', emotion: 'joy', color: 'yellow' };
const B = { id: 'b', emotion: 'sad', color: 'blue' };

describe('exchangeToAssigned', () => {
  it('puts the exchange at the midpoint between the two expressed states', () => {
    const r = exchangeToAssigned([A, B], [{ from: 'a', text: 'x' }, { from: 'b', text: 'y' }]);
    // joy(0) -> sad(4): distance 4, two steps clockwise = feared(2); yellow(0) -> blue(4): green(2)
    expect(r.emotion).toBe('feared');
    expect(r.color).toBe('green');
    expect(r.confidence).toBe(0);           // maximal disagreement
    expect(r.intensity).toBe(0.8);          // 0.6 + 0.1 * 2
    expect(r.metadata.balance).toBe(0.5);
  });

  it('agreement is a fixed point with full confidence', () => {
    const r = exchangeToAssigned([A, { ...A, id: 'b' }], []);
    expect(r.emotion).toBe('joy'); expect(r.color).toBe('yellow'); expect(r.confidence).toBe(1);
  });

  it('never reads the words', () => {
    const r1 = exchangeToAssigned([A, B], [{ from: 'a', text: 'שמחה גדולה' }]);
    const r2 = exchangeToAssigned([A, B], [{ from: 'a', text: 'עצב עמוק' }]);
    expect(r1.emotion).toBe(r2.emotion); expect(r1.color).toBe(r2.color);
  });

  it('refuses anything but two participants or a state off the ring', () => {
    expect(() => exchangeToAssigned([A], [])).toThrow(/INVALID_EXCHANGE/);
    expect(() => exchangeToAssigned([A, { id: 'b', emotion: 'calm', color: 'blue' }], [])).toThrow(/INVALID_STATE/);
  });
});
