/**
 * Feed score, the JS mirror of get_feed in supabase/schema.sql.
 * sigma = alpha * rho(viewer, initial) + (1 - alpha) * rho(viewer, current) + gamma * ln(1 + braces)
 * A post is shown when rho(viewer, initial) >= epsilon, or with probability pi.
 */

import { point, resonance } from './ring.js';

export const FEED_DEFAULTS = Object.freeze({ alpha: 0.6, gamma: 0.1, epsilon: 0.5, pi: 0.05 });

export function feedScore(viewer, post, opts = {}) {
  const { alpha, gamma } = { ...FEED_DEFAULTS, ...opts };
  const v = point(viewer.emotion, viewer.color);
  const s0 = point(post.initial_emotion ?? post.initialEmotion, post.initial_color ?? post.initialColor);
  const sn = point(post.emotion, post.color);
  if (!v || !s0 || !sn) return null;
  const braces = Number(post.braces) || 0;
  return alpha * resonance(v, s0) + (1 - alpha) * resonance(v, sn) + gamma * Math.log(1 + braces);
}

/** @param {() => number} random injectable for tests */
export function isShown(viewer, post, opts = {}, random = Math.random) {
  const { epsilon, pi } = { ...FEED_DEFAULTS, ...opts };
  const v = point(viewer.emotion, viewer.color);
  const s0 = point(post.initial_emotion ?? post.initialEmotion, post.initial_color ?? post.initialColor);
  if (!v || !s0) return false;
  return resonance(v, s0) >= epsilon || random() < pi;
}

export function rankFeed(viewer, posts, opts = {}, random = Math.random) {
  return posts
    .filter(p => isShown(viewer, p, opts, random))
    .map(p => ({ post: p, score: feedScore(viewer, p, opts) }))
    .sort((x, y) => y.score - x.score || String(y.post.created_at).localeCompare(String(x.post.created_at)));
}
