/**
 * The pipeline: from a closed exchange to a card on the wall.
 * Fails closed at every step. Every refusal is recorded on the exchange.
 */
import { exchangeToAssigned, exchangeToWallCard } from '@hermes/core';

/**
 * @param {object} bundle   the result of close_exchange / exchange_bundle
 * @param {{db:any, ai:any, log?:Function, now?:()=>string, imageBase?:string}} deps
 * @returns {Promise<{ok:true, postId:string}|{ok:false, code:string, detail?:string}>}
 */
export async function runPipeline(bundle, deps) {
  const { db, ai, log = () => {} } = deps;
  const fail = async (code, detail) => {
    try { await db.rpc('mark_exchange_failed', { p_exchange: bundle.id, p_code: code }); } catch (e) { log('mark_failed_error', e.code || e.message); }
    log('pipeline_failed', bundle.id, code, detail || '');
    return { ok: false, code, detail };
  };

  if (!bundle || !Array.isArray(bundle.participants) || bundle.participants.length !== 2) return fail('INVALID_EXCHANGE');
  if (!Array.isArray(bundle.messages) || bundle.messages.length === 0) return fail('EMPTY_EXCHANGE');

  // 1. the amplifier decides a state, without reading the words
  let assigned;
  try { assigned = exchangeToAssigned(bundle.participants, bundle.messages); }
  catch (e) { return fail('INVALID_STATE', e.message); }

  // 2. the card, through redaction and paraphrase; fails closed inside the core
  const exchange = {
    id: bundle.id,
    participants: bundle.participants.map((p) => ({ id: p.id, name: p.name, pseudonym: p.pseudonym, consent: p.consent })),
    messages: bundle.messages.map((m) => ({ from: m.from, text: m.text, at: m.at })),
    assigned,
    seed: seedFor(assigned, bundle),
    at: bundle.at
  };
  // Run each model once, then hand the core constant functions: the core stays
  // pure and its leak check still runs on the real outputs.
  let card;
  try {
    const raw = exchange.messages.map((m) => m.text).join('\n');
    const red = await ai.redact(raw, { names: exchange.participants.map((p) => p.name).filter(Boolean) });
    const para = red && red.confirmed ? await ai.paraphrase(red.text) : '';
    const r = exchangeToWallCard(exchange, { redact: () => red, paraphrase: () => para, now: deps.now });
    if (!r.ok) return fail(r.error.code, r.error.detail);
    card = { ...r.card, provenance: { ...r.card.provenance, model: ai.textModel || 'unknown' } };
  } catch (e) { return fail('PIPELINE_ERROR', e.message); }

  // 3. publish first, draw after: a card without a picture is still a card
  let postId;
  try { postId = await db.rpc('publish_post', { p_card: card }); }
  catch (e) { return fail(e.code || 'PUBLISH_FAILED', e.message); }

  try {
    const style = bundle.participants[0]?.style || 'watercolor';
    const png = await ai.render(card.seed, style);
    if (png && deps.images) {
      const url = await deps.images.put(`${postId}.png`, png);
      if (url) await db.rpc('set_post_image', { p_post: postId, p_url: url });
    }
  } catch (e) { log('render_failed', postId, e.message); }

  log('published', bundle.id, postId);
  return { ok: true, postId };
}

function seedFor(assigned, bundle) {
  const n = bundle.messages.length;
  return `two figures, ${assigned.emotion}, ${assigned.color} light, ${n > 6 ? 'long conversation' : 'short exchange'}`;
}

/** R2-backed image store; returns a public URL only when PUBLIC_IMAGE_BASE is set. */
export function makeImageStore(env) {
  if (!env.IMAGES) return null;
  const base = String(env.PUBLIC_IMAGE_BASE || '').replace(/\/$/, '');
  return {
    async put(key, bytes) {
      await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });
      return base ? `${base}/${key}` : null;
    }
  };
}
