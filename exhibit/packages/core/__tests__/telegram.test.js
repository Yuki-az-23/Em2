import { describe, it, expect } from 'vitest';
import { deepLink, parseUpdate, secretMatches, consentText, isConsent } from '../src/telegram.js';

describe('telegram helpers', () => {
  it('builds a deep link and refuses bad codes', () => {
    expect(deepLink('HermesBot', 'abc_DEF-123')).toBe('https://t.me/HermesBot?start=abc_DEF-123');
    expect(() => deepLink('HermesBot', 'has space')).toThrow(/INVALID_CODE/);
  });
  it('parses /start with and without a code', () => {
    const u = { message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 9 }, text: '/start k7m2p' } };
    expect(parseUpdate(u)).toMatchObject({ kind: 'start', code: 'k7m2p', chatId: 5, userId: 9, isPrivate: true });
    u.message.text = '/start';
    expect(parseUpdate(u)).toMatchObject({ kind: 'start', code: null });
  });
  it('parses commands with bot suffix and plain text', () => {
    const base = { message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 9 } } };
    expect(parseUpdate({ message: { ...base.message, text: '/END@HermesBot now' } })).toMatchObject({ kind: 'command', name: 'end', arg: 'now' });
    expect(parseUpdate({ message: { ...base.message, text: '  שלום  ' } })).toMatchObject({ kind: 'text', text: 'שלום' });
    expect(parseUpdate({})).toEqual({ kind: 'other' });
  });
  it('compares secrets without short-circuit on length', () => {
    expect(secretMatches('abc', 'abc')).toBe(true);
    expect(secretMatches('abc', 'abd')).toBe(false);
    expect(secretMatches('ab', 'abc')).toBe(false);
    expect(secretMatches(undefined, 'abc')).toBe(false);
  });
  it('consent text names the handle and version; consent words are recognized', () => {
    const t = consentText('נמל-שקט', 'exhibit-consent-1');
    expect(t).toContain('נמל-שקט'); expect(t).toContain('exhibit-consent-1'); expect(t).toContain('/withdraw');
    expect(isConsent(' מסכים ')).toBe(true); expect(isConsent('לא')).toBe(false);
  });
});
