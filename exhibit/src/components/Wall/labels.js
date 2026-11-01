/** Hebrew names for the eight emotions and colors, shared by wall pages. The names live in the core. */
import { EMOTION_HE, COLOR_HE } from '@hermes/core/hebrew';

export const he = { emotion: (e) => EMOTION_HE[e] || e, color: (c) => COLOR_HE[c] || c };
