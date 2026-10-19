/**
 * Wall Service
 *
 * The public side of the exhibit. Reads cards, and sends the audience's two
 * verbs, trigger and brace, to the database function that applies the ring
 * step and the memory fold where the data lives. Publishing is not available
 * from a browser: Hermes publishes with the service role on the server.
 */

import { supabase } from '../supabase/client.js';
import { parseRpcError } from '../rpc/errors.js';

export const KIND = Object.freeze({ TRIGGER: 'trigger', BRACE: 'brace' });

export async function listCards({ limit = 30, before = null } = {}) {
  try {
    let q = supabase
      .from('wall_cards')
      .select('id, pseudonyms, initial_emotion, initial_color, emotion, color, paraphrase, image_url, reactions, braces, created_at')
      .is('withdrawn_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q;
    if (error) throw error;
    return { cards: data || [], error: null };
  } catch (err) {
    return { cards: [], error: parseRpcError(err) };
  }
}

/**
 * @param {{cardId:string, kind:'trigger'|'brace', emotion:string, color:string, apiKey?:string}} input
 */
export async function react({ cardId, kind, emotion, color, apiKey }) {
  try {
    const { data, error } = await supabase.rpc('wall_react', {
      p_card_id: cardId, p_kind: kind, p_emotion: emotion, p_color: color, p_api_key: apiKey || null
    });
    if (error) throw error;
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: parseRpcError(err) };
  }
}
