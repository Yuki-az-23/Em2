/** Hebrew names for the eight emotions and colors, shared by wall pages. */
const EMOTION_HE = { joy: 'שמחה', trust: 'אמון', feared: 'פחד', surprised: 'הפתעה', sad: 'עצב', disgust: 'גועל', angry: 'כעס', anticipated: 'ציפייה' };
const COLOR_HE = { yellow: 'צהוב', lime: 'ליים', green: 'ירוק', aqua: 'תכלת', blue: 'כחול', pink: 'ורוד', red: 'אדום', orange: 'כתום' };
export const he = { emotion: (e) => EMOTION_HE[e] || e, color: (c) => COLOR_HE[c] || c };
