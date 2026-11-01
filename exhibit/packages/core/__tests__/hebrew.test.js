import { describe, it, expect } from 'vitest';
import { parseEmotion, parseColor, EMOTION_HE, COLOR_HE, EMOTIONS, COLORS, stateKeyboard, REMOVE_KEYBOARD } from '../src/index.js';

describe('Hebrew names and the bot keyboards', () => {
  it('has a Hebrew name for every emotion and color, all distinct', () => {
    expect(EMOTIONS.every((e) => EMOTION_HE[e])).toBe(true);
    expect(COLORS.every((c) => COLOR_HE[c])).toBe(true);
    const all = [...Object.values(EMOTION_HE), ...Object.values(COLOR_HE)];
    expect(new Set(all).size).toBe(16);
  });

  it('reads Hebrew and English answers, trimmed and case-insensitive', () => {
    expect(parseEmotion(' אמון ')).toBe('trust');
    expect(parseEmotion('Trust')).toBe('trust');
    expect(parseColor('ליים')).toBe('lime');
    expect(parseColor('BLUE')).toBe('blue');
  });

  it('rejects anything else, and does not confuse an emotion with a color', () => {
    expect(parseEmotion('רגוע')).toBeNull();
    expect(parseEmotion('')).toBeNull();
    expect(parseEmotion(undefined)).toBeNull();
    expect(parseEmotion('כחול')).toBeNull();
    expect(parseColor('שמחה')).toBeNull();
    expect(parseColor('אני מרגיש כחול')).toBeNull();
  });

  it('builds two rows of four buttons that parse back to the ring', () => {
    const e = stateKeyboard('emotion');
    expect(e.keyboard).toHaveLength(2);
    expect(e.keyboard.every((row) => row.length === 4)).toBe(true);
    expect(e.keyboard.flat().map((b) => parseEmotion(b.text))).toEqual([...EMOTIONS]);
    expect(stateKeyboard('color').keyboard.flat().map((b) => parseColor(b.text))).toEqual([...COLORS]);
    expect(REMOVE_KEYBOARD).toEqual({ remove_keyboard: true });
  });
});
