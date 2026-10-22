/**
 * Core ring math for the Emotion-Color Bridge.
 *
 * Pure functions, no I/O, no tables of special cases. Two rings of eight
 * points: Plutchik's emotions in wheel order, and hues in wheel order.
 * Every relationship the old engine encoded in 13,000 lines of if-statements
 * is a function of circular distance on these rings.
 *
 * All inputs are case-insensitive. The database stores lowercase; the old
 * engine expected capitalized names; this module accepts both and always
 * returns lowercase.
 */

export const EMOTIONS = Object.freeze([
  'joy', 'trust', 'feared', 'surprised', 'sad', 'disgust', 'angry', 'anticipated'
]);

export const COLORS = Object.freeze([
  'yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange'
]);

export const RING_SIZE = 8;
export const MAX_DISTANCE = 4;          // half the ring
export const MAX_TORUS_DISTANCE = 8;    // two rings

/** Index of a name on a ring, or -1. Case-insensitive. */
export function indexOf(ring, name) {
  if (typeof name !== 'string') return -1;
  return ring.indexOf(name.toLowerCase());
}

export const emotionIndex = (name) => indexOf(EMOTIONS, name);
export const colorIndex = (name) => indexOf(COLORS, name);

export const isEmotion = (name) => emotionIndex(name) !== -1;
export const isColor = (name) => colorIndex(name) !== -1;

/** Shortest arc between two indices on a ring of eight. */
export function d8(a, b) {
  const x = Math.abs(a - b) % RING_SIZE;
  return Math.min(x, RING_SIZE - x);
}

/**
 * Direction of the shortest arc from a to b: +1, -1, or 0.
 * At distance 4 both arcs are equal; we break the tie clockwise (+1)
 * rather than freezing, so the most opposed input still moves the state.
 */
export function dir8(a, b) {
  if (a === b) return 0;
  return ((b - a + RING_SIZE) % RING_SIZE) <= MAX_DISTANCE ? 1 : -1;
}

/** Move index a toward index b by n single steps (default 1). */
export function stepToward(a, b, n = 1) {
  let cur = a;
  for (let i = 0; i < n; i++) {
    if (cur === b) break;
    cur = (cur + dir8(cur, b) + RING_SIZE) % RING_SIZE;
  }
  return cur;
}

/**
 * Relationship class between two points on the same ring.
 * This replaces both EMOTION_RELATIONSHIPS and COLOR_HARMONY lookup tables.
 */
export function relation(a, b) {
  const d = d8(a, b);
  if (d === 0) return 'same';
  if (d === 1) return 'adjacent';
  if (d === MAX_DISTANCE) return 'opposite';
  return 'neutral';
}

/** A point on the torus: { e, c } as indices. */
export function point(emotion, color) {
  const e = emotionIndex(emotion);
  const c = colorIndex(color);
  if (e === -1 || c === -1) return null;
  return { e, c };
}

export function torusDistance(p, q) {
  return d8(p.e, q.e) + d8(p.c, q.c);
}

/** Resonance in [0, 1]: 1 = identical, 0 = opposite on both rings. */
export function resonance(p, q) {
  return 1 - torusDistance(p, q) / MAX_TORUS_DISTANCE;
}

/** Names back from a point. */
export function names(p) {
  return { emotion: EMOTIONS[p.e], color: COLORS[p.c] };
}

/**
 * One interaction: a reader at `reader` touches an object at `object`.
 * The object moves one step toward the reader on each ring.
 * Returns the proposed next point and the relationship classes, nothing more.
 * Memory, thresholds and authority live elsewhere.
 */
export function stepInteraction(reader, object) {
  return {
    next: { e: stepToward(object.e, reader.e), c: stepToward(object.c, reader.c) },
    emotionRelation: relation(reader.e, object.e),
    colorRelation: relation(reader.c, object.c)
  };
}
