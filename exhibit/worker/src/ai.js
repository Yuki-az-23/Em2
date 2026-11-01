/**
 * Workers AI adapters. Each returns exactly the shape the core expects, and
 * nothing here is trusted: a model that returns malformed JSON yields
 * confirmed:false, which the core turns into "no card".
 */

const REDACT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['text', 'removed'],
  properties: { text: { type: 'string' }, removed: { type: 'array', items: { type: 'string' } } }
};

import { makeFakeAi } from './fakeAi.js';

export function makeAi(env) {
  if (env.AI_MODE === 'fake') return makeFakeAi();
  const ai = env.AI;
  const textModel = env.AI_TEXT_MODEL || '@cf/openai/gpt-oss-120b';
  const imageModel = env.AI_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';

  /** @returns {Promise<{text:string, removed:string[], confirmed:boolean}>} */
  async function redact(text) { // the fake also takes {names}; the model finds names itself
    if (!ai) return { text: '', removed: [], confirmed: false };
    const r = await ai.run(textModel, {
      messages: [
        { role: 'system', content: 'אתה מסיר מזהים מטקסט בעברית. החלף כל שם פרטי, שם משפחה, שם מקום, שם עסק, מספר טלפון, כתובת, אימייל, ושם של אדם שלישי ב-[מושחר]. אל תשנה שום דבר אחר. החזר JSON בלבד.' },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_schema', json_schema: REDACT_SCHEMA }
    });
    const parsed = pickJson(r);
    if (!parsed || typeof parsed.text !== 'string' || !Array.isArray(parsed.removed)) return { text: '', removed: [], confirmed: false };
    return { text: parsed.text, removed: parsed.removed.map(String), confirmed: true };
  }

  /** @returns {Promise<string>} */
  async function paraphrase(redactedText) {
    if (!ai) throw new Error('AI_UNAVAILABLE');
    const r = await ai.run(textModel, {
      messages: [
        { role: 'system', content: 'אתה המערכת. תאר בשניים או שלושה משפטים בעברית, בגוף שלישי, מה קרה בין שני אנשים בשיחה הזאת. בלי ציטוטים, בלי שמות, בלי פרטים מזהים. קול של מכונה שמסכמת.' },
        { role: 'user', content: redactedText }
      ]
    });
    const out = typeof r === 'string' ? r : (r && (r.response || r.output_text || (r.choices && r.choices[0]?.message?.content))) || '';
    return String(out).trim();
  }

  /** @returns {Promise<ArrayBuffer|null>} PNG bytes or null */
  async function render(seed, style) {
    if (!ai) return null;
    const prompt = `${style || 'watercolor'} illustration, ${seed || 'two figures, distance, quiet'}, no faces, no text, silhouettes or back view, abstract, soft light`;
    const r = await ai.run(imageModel, { prompt, num_steps: 4 });
    if (r instanceof ArrayBuffer) return r;
    if (r && r.image && typeof r.image === 'string') return Uint8Array.from(atob(r.image), (c) => c.charCodeAt(0)).buffer;
    if (r && typeof r.arrayBuffer === 'function') return r.arrayBuffer();
    return null;
  }

  return { redact, paraphrase, render, textModel, imageModel };
}

function pickJson(r) {
  if (!r) return null;
  if (typeof r === 'object' && !('response' in r) && !('choices' in r)) return r;
  const s = typeof r === 'string' ? r : (r.response || r.output_text || (r.choices && r.choices[0]?.message?.content));
  if (typeof s !== 'string') return null;
  try { return JSON.parse(s); } catch { const m = /\{[\s\S]*\}/.exec(s); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }
}
