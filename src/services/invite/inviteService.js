/**
 * Invite Service
 *
 * Creates the first record the system keeps about a person: the name they
 * typed, the pseudonym the system gave back, and their answer to the
 * question on the door. Stored in Supabase when available; otherwise the
 * link is produced locally and the caller is told it was not saved.
 */

import { supabase } from '../supabase/client.js';
import { makePseudonym, makeCode } from '../../core/pseudonym.js';

export const INVITE_TTL_DAYS = 7;

export const ANSWERS = Object.freeze({
  TRUST: 'trust_signal',      // "אני בוטח באות שלי"
  SHAPED: 'amplifier_shapes'  // "המגביר מעצב אותי"
});

/**
 * @param {{displayName:string, answer:'trust_signal'|'amplifier_shapes'}} input
 * @returns {Promise<{code:string, pseudonym:string, expiresAt:string, saved:boolean, error:null|{code:string,message:string}}>}
 */
export async function createInvite({ displayName, answer }) {
  const name = (displayName || '').trim();
  if (name.length < 1 || name.length > 50) {
    return { code: null, pseudonym: null, expiresAt: null, saved: false,
      error: { code: 'INVALID_NAME', message: 'name must be 1 to 50 characters' } };
  }
  if (answer !== ANSWERS.TRUST && answer !== ANSWERS.SHAPED) {
    return { code: null, pseudonym: null, expiresAt: null, saved: false,
      error: { code: 'INVALID_ANSWER', message: 'answer must be one of the two' } };
  }

  const code = makeCode();
  const pseudonym = makePseudonym();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000).toISOString();

  try {
    const { error } = await supabase
      .from('invites')
      .insert({ code, display_name: name, pseudonym, answer, expires_at: expiresAt });
    if (error) throw error;
    return { code, pseudonym, expiresAt, saved: true, error: null };
  } catch (err) {
    return { code, pseudonym, expiresAt, saved: false,
      error: { code: err?.code || 'STORAGE_UNAVAILABLE', message: err?.message || 'invite was not saved' } };
  }
}

/** Fetch an invite by code for the /join page. Returns null when missing or expired. */
export async function getInvite(code) {
  if (typeof code !== 'string' || code.length !== 22) return null;
  try {
    const { data, error } = await supabase
      .from('invites')
      .select('code, pseudonym, answer, created_at, expires_at, claimed_at')
      .eq('code', code)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function inviteUrl(code) {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${origin}/join/${code}`;
}
