/**
 * The provider with the key.
 *
 * This is the one function that turns a private exchange on Hermes into a
 * card on the public wall. It is the subject of the exhibit: a service that
 * reads everything two people say to each other and publishes what it
 * decided about them.
 *
 * Design rules, each enforced here and tested:
 *   - The card never carries the words. It carries the system's paraphrase.
 *   - The card never carries names. It carries pseudonyms the system assigned.
 *   - Nothing is published without recorded consent from every participant.
 *   - Nothing is published unless the redaction step confirmed it ran.
 *   - If any step fails, the function fails closed: no card, an error code.
 *
 * The function is pure. Redaction and paraphrase are injected so that the
 * core can be tested without a model, and so that a failing model cannot
 * leak by accident: an absent or throwing dependency produces no card.
 */

import { point, names, isEmotion, isColor } from './ring.js';

export const CONSENT_VERSION = 'exhibit-consent-1';

export const ERR = Object.freeze({
  INVALID_EXCHANGE: 'INVALID_EXCHANGE',
  CONSENT_MISSING: 'CONSENT_MISSING',
  CONSENT_STALE: 'CONSENT_STALE',
  INVALID_STATE: 'INVALID_STATE',
  REDACTION_UNCONFIRMED: 'REDACTION_UNCONFIRMED',
  REDACTION_FAILED: 'REDACTION_FAILED',
  PARAPHRASE_FAILED: 'PARAPHRASE_FAILED',
  LEAK_DETECTED: 'LEAK_DETECTED'
});

const fail = (code, detail) => ({ ok: false, error: { code, detail } });

/**
 * @typedef {Object} Exchange
 * @property {string} id
 * @property {{id:string, name?:string, pseudonym:string, consent?:{version:string, acceptedAt:string}}[]} participants
 * @property {{from:string, text:string, at:string}[]} messages
 * @property {{emotion:string, color:string, intensity?:number, confidence?:number}} assigned  state the engine assigned
 * @property {string} [seed]  short prompt for the rendered image, written by the system
 * @property {string} at
 */

/**
 * @param {Exchange} exchange
 * @param {{redact:(text:string)=>{text:string, removed:string[], confirmed:boolean}, paraphrase:(text:string)=>string, now?:()=>string}} deps
 */
export function exchangeToWallCard(exchange, deps) {
  // 1. Shape
  if (!exchange || typeof exchange.id !== 'string' || !Array.isArray(exchange.participants)
      || exchange.participants.length < 2 || !Array.isArray(exchange.messages) || exchange.messages.length === 0) {
    return fail(ERR.INVALID_EXCHANGE, 'exchange must have id, >=2 participants and >=1 message');
  }
  if (!deps || typeof deps.redact !== 'function' || typeof deps.paraphrase !== 'function') {
    return fail(ERR.REDACTION_FAILED, 'redact and paraphrase dependencies are required');
  }

  // 2. Consent, every participant, current version
  for (const p of exchange.participants) {
    if (!p.consent || !p.consent.acceptedAt) return fail(ERR.CONSENT_MISSING, p.pseudonym || p.id);
    if (p.consent.version !== CONSENT_VERSION) return fail(ERR.CONSENT_STALE, p.pseudonym || p.id);
    if (typeof p.pseudonym !== 'string' || p.pseudonym.length === 0) return fail(ERR.INVALID_EXCHANGE, 'participant without pseudonym');
  }

  // 3. Assigned state must be on the torus
  const a = exchange.assigned || {};
  if (!isEmotion(a.emotion) || !isColor(a.color)) return fail(ERR.INVALID_STATE, `${a.emotion}/${a.color}`);
  const pt = point(a.emotion, a.color);

  // 4. Redaction, fail closed
  const raw = exchange.messages.map(m => m.text).join('\n');
  let red;
  try { red = deps.redact(raw); } catch (e) { return fail(ERR.REDACTION_FAILED, String(e && e.message)); }
  if (!red || red.confirmed !== true || typeof red.text !== 'string') return fail(ERR.REDACTION_UNCONFIRMED);

  // 5. Paraphrase in the system's voice, fail closed
  let para;
  try { para = deps.paraphrase(red.text); } catch (e) { return fail(ERR.PARAPHRASE_FAILED, String(e && e.message)); }
  if (typeof para !== 'string' || para.trim().length === 0) return fail(ERR.PARAPHRASE_FAILED, 'empty paraphrase');

  const card = {
    id: `card_${exchange.id}`,
    pseudonyms: exchange.participants.map(p => p.pseudonym),
    ...names(pt),
    intensity: typeof a.intensity === 'number' ? a.intensity : 1.0,
    confidence: typeof a.confidence === 'number' ? a.confidence : 1.0,
    paraphrase: para,
    seed: typeof exchange.seed === 'string' ? exchange.seed : null,
    createdAt: (deps.now || (() => new Date().toISOString()))(),
    provenance: {
      exchangeId: exchange.id,
      consentVersion: CONSENT_VERSION,
      redactionRemoved: Array.isArray(red.removed) ? red.removed.length : 0,
      messageCount: exchange.messages.length
    }
  };

  // 6. Leak check: no raw message and no real name may appear on the card
  const leak = findLeak(card, exchange);
  if (leak) return fail(ERR.LEAK_DETECTED, leak);

  return { ok: true, card };
}

/**
 * Returns a description of the first leak found, or null.
 * A leak is a participant's real name, id, or a whole raw message line
 * appearing anywhere in the serialized card.
 */
export function findLeak(card, exchange) {
  const hay = JSON.stringify(card).toLowerCase();
  for (const p of exchange.participants) {
    for (const field of ['name', 'id']) {
      const v = p[field];
      if (typeof v === 'string' && v.length >= 3 && hay.includes(v.toLowerCase())) {
        return `participant ${field} present on card`;
      }
    }
  }
  for (const m of exchange.messages) {
    const line = (m.text || '').trim().toLowerCase();
    if (line.length >= 12 && hay.includes(line)) return 'raw message text present on card';
  }
  return null;
}
