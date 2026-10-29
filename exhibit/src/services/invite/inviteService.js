/**
 * The door. create_invite in the database generates the code, the handle and the
 * Telegram deep link, and enforces the rate limit (3, then 1, 2, 4). A refusal
 * is a refusal: no local link is produced on RATE_LIMITED. When storage is
 * unreachable the caller is told and nothing is invented.
 */
import { supabase } from '../supabase/client.js';
import { parseRpcError } from '../rpc/errors.js';

export const ANSWERS = Object.freeze({ TRUST: 'trust_signal', SHAPED: 'amplifier_shapes' });
export const ROLES = Object.freeze({ PARTICIPANT: 'participant', INVESTOR: 'investor' });

/**
 * @returns {Promise<{code:string|null, handle:string|null, telegramLink:string|null, expiresAt:string|null, error:null|{code:string,message:string,retryAfter:number|null}}>}
 */
export async function createInvite({ displayName, role = ROLES.PARTICIPANT, answer }) {
  const name = (displayName || '').trim();
  const none = { code: null, handle: null, telegramLink: null, expiresAt: null };
  if (name.length < 1 || name.length > 50) return { ...none, error: { code: 'INVALID_NAME', message: 'name must be 1 to 50 characters', retryAfter: null } };
  if (role !== ROLES.PARTICIPANT && role !== ROLES.INVESTOR) return { ...none, error: { code: 'INVALID_ROLE', message: 'bad role', retryAfter: null } };
  if (answer !== ANSWERS.TRUST && answer !== ANSWERS.SHAPED) return { ...none, error: { code: 'INVALID_ANSWER', message: 'bad answer', retryAfter: null } };
  try {
    const { data, error } = await supabase.rpc('create_invite', { p_display_name: name, p_role: role, p_answer: answer });
    if (error) throw error;
    return { code: data.code, handle: data.handle, telegramLink: data.telegram_link, expiresAt: data.expires_at, error: null };
  } catch (err) {
    return { ...none, error: parseRpcError(err) };
  }
}

/** What /join may show about an invite: the inviter's handle. Null when expired, claimed or unknown. */
export async function peekInvite(code) {
  if (typeof code !== 'string' || code.length !== 22) return null;
  try {
    const { data, error } = await supabase.rpc('peek_invite', { p_code: code });
    if (error || !data) return null;
    return { fromHandle: data.from_handle, role: data.role, expiresAt: data.expires_at };
  } catch {
    return null;
  }
}

export function joinUrl(code) {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${origin}/join/${code}`;
}
