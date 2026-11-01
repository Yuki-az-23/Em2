/**
 * Pseudonyms the system assigns.
 *
 * The visitor types a name. The system answers with a different one.
 * That is the first thing the amplifier does to the signal, and it is why
 * the pseudonym is never derived from the name: nothing about the person
 * survives into it. Two Hebrew words, chosen at random.
 */

const FIRST = Object.freeze([
  'נמל', 'בוסתן', 'שביל', 'חלון', 'מגדלור', 'גשר', 'מזח', 'חורשה',
  'מרפסת', 'באר', 'סמטה', 'כרם', 'חוף', 'מעיין', 'צריף', 'גן'
]);

const SECOND = Object.freeze([
  'שקט', 'מאוחר', 'ראשון', 'אפור', 'רחוק', 'פתוח', 'צהוב', 'קר',
  'נסתר', 'ישן', 'כחול', 'חם', 'זר', 'סגור', 'ריק', 'מלא'
]);

/** Uniform integer in [0, n) from crypto when available, Math.random otherwise. */
function pick(n, random) {
  if (typeof random === 'function') return Math.floor(random() * n) % n;
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

/** @param {() => number} [random] injectable for tests */
export function makePseudonym(random) {
  return `${FIRST[pick(FIRST.length, random)]}-${SECOND[pick(SECOND.length, random)]}`;
}

/** URL-safe invite code, 16 bytes. */
export function makeCode(random) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 22; i++) out += alphabet[pick(alphabet.length, random)];
  return out;
}

export const PSEUDONYM_WORDS = Object.freeze({ FIRST, SECOND });
