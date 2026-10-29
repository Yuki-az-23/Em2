/**
 * The wall. Reads posts through get_feed, sends the audience's two verbs through
 * react_to_post, and subscribes to realtime changes. Publishing is not possible
 * from a browser: Hermes publishes with the service role.
 */
import { supabase } from '../supabase/client.js';
import { parseRpcError } from '../rpc/errors.js';
import { isDemo } from '../demo/simService.js';

export const KIND = Object.freeze({ TRIGGER: 'trigger', BRACE: 'brace' });

/** @param {{emotion:string,color:string,limit?:number,before?:string}} p */
export async function getFeed({ emotion, color, limit = 30, before = null }) {
  try {
    const { data, error } = await supabase.rpc('get_feed', { p_emotion: emotion, p_color: color, p_limit: limit, p_before: before });
    if (error) throw error;
    return { posts: data || [], error: null };
  } catch (err) {
    return { posts: [], error: parseRpcError(err) };
  }
}

export async function getPost(id) {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id, pseudonyms, title, body, image_url, emotion, color, initial_emotion, initial_color, intensity, confidence, reactions, braces, created_at, provenance')
      .eq('id', id).maybeSingle();
    if (error) throw error;
    return { post: data, error: null };
  } catch (err) {
    return { post: null, error: parseRpcError(err) };
  }
}

/** Who moved the post where: the comments as a trail. */
export async function getTrail(postId, limit = 50) {
  try {
    const { data, error } = await supabase
      .from('post_trail')
      .select('id, actor_emotion, actor_color, text, before_emotion, before_color, after_emotion, after_color, created_at')
      .eq('post_id', postId).order('id', { ascending: true }).limit(limit);
    if (error) throw error;
    return { trail: data || [], error: null };
  } catch (err) {
    return { trail: [], error: parseRpcError(err) };
  }
}

/** @param {{postId:string, kind:'trigger'|'brace', emotion:string, color:string, text?:string, apiKey?:string}} p */
export async function react({ postId, kind, emotion, color, text = null, apiKey = null }) {
  try {
    const { data, error } = await supabase.rpc('react_to_post', {
      p_post: postId, p_kind: kind, p_emotion: emotion, p_color: color, p_text: text, p_api_key: apiKey
    });
    if (error) throw error;
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: parseRpcError(err) };
  }
}

/**
 * Realtime: calls onChange({type, post}) for inserts and updates on posts, and
 * onStatus('live' | 'down') when the channel connects or fails. Returns an
 * unsubscribe function. Silent when realtime is unavailable.
 */
export function subscribePosts(onChange, onStatus = () => {}) {
  if (isDemo()) { onStatus('down'); return () => {}; } // the light demo has no realtime
  let channel;
  try {
    channel = supabase
      .channel('wall-posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
        onChange({ type: payload.eventType, post: payload.new || null, old: payload.old || null });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus('down');
      });
  } catch {
    onStatus('down');
    return () => {};
  }
  return () => { try { supabase.removeChannel(channel); } catch { /* already gone */ } };
}
