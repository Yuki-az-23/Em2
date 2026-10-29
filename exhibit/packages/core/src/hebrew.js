/**
 * Hebrew names for the eight emotions and eight colors, and the parsers the bot
 * uses to read a participant's answer. One source for the site and the Worker.
 */
import { EMOTIONS, COLORS } from './ring.js';

export const EMOTION_HE = Object.freeze({
  joy: 'שמחה', trust: 'אמון', feared: 'פחד', surprised: 'הפתעה',
  sad: 'עצב', disgust: 'גועל', angry: 'כעס', anticipated: 'ציפייה'
});

export const COLOR_HE = Object.freeze({
  yellow: 'צהוב', lime: 'ליים', green: 'ירוק', aqua: 'תכלת',
  blue: 'כחול', pink: 'ורוד', red: 'אדום', orange: 'כתום'
});

function parser(names, he) {
  const byKey = new Map();
  for (const n of names) { byKey.set(n, n); byKey.set(he[n], n); }
  return (text) => {
    const t = String(text ?? '').trim().toLowerCase();
    return t ? byKey.get(t) ?? null : null;
  };
}

/** 'אמון' or 'Trust' -> 'trust'; anything else -> null. */
export const parseEmotion = parser(EMOTIONS, EMOTION_HE);
/** 'ליים' or 'Lime' -> 'lime'; anything else -> null. */
export const parseColor = parser(COLORS, COLOR_HE);
