/** Where every live post sits on the 8x8 matrix, now and at publication. */
import { supabase } from '../supabase/client.js';
import { parseRpcError } from '../rpc/errors.js';

export async function getPositions() {
  try {
    const { data, error } = await supabase.from('posts').select('id, emotion, color, initial_emotion, initial_color').limit(2000);
    if (error) throw error;
    return { posts: data || [], error: null };
  } catch (err) {
    return { posts: [], error: parseRpcError(err) };
  }
}
