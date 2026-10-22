/**
 * The signed-in person: their profile, home, agents and withdrawals.
 * Every write goes through a database function; nothing here updates a table directly.
 */
import { supabase } from '../supabase/client.js';
import { parseRpcError } from '../rpc/errors.js';

const wrap = async (fn) => {
  try { const r = await fn(); if (r.error) throw r.error; return { data: r.data, error: null }; }
  catch (err) { return { data: null, error: parseRpcError(err) }; }
};

export const getMyProfile = () => wrap(() => supabase
  .from('profiles')
  .select('id, handle, kind, role, emotion, color, base_emotion, base_color, felt_emotion, felt_color, style, accept_from, consent_version, consent_at, stopped_at, created_at')
  .maybeSingle());

export const setHome = (emotion, color) => wrap(() => supabase.rpc('set_home', { p_emotion: emotion, p_color: color }));
export const setState = (emotion, color, felt = false) => wrap(() => supabase.rpc('set_state', { p_emotion: emotion, p_color: color, p_felt: felt }));
export const claimInvite = (code) => wrap(() => supabase.rpc('claim_invite', { p_code: code }));
export const recordConsent = () => wrap(() => supabase.rpc('record_consent'));
export const createPairInvite = () => wrap(() => supabase.rpc('create_pair_invite'));
export const toggleFollow = (handle) => wrap(() => supabase.rpc('toggle_follow', { p_handle: handle }));
export const withdrawPost = (postId) => wrap(() => supabase.rpc('withdraw_post', { p_post: postId }));
export const createAgent = (name, emotion, color) => wrap(() => supabase.rpc('create_agent', { p_name: name, p_emotion: emotion, p_color: color }));
export const revokeAgentKey = (agentId) => wrap(() => supabase.rpc('revoke_agent_key', { p_agent: agentId }));

export const getMyExchanges = () => wrap(() => supabase
  .from('exchanges')
  .select('id, channel, status, opened_at, closed_at, error_code')
  .order('opened_at', { ascending: false }).limit(50));

export const getMyPosts = async (exchangeIds) => {
  if (!exchangeIds || exchangeIds.length === 0) return { data: [], error: null };
  return wrap(() => supabase
    .from('posts')
    .select('id, exchange_id, body, emotion, color, initial_emotion, initial_color, created_at')
    .in('exchange_id', exchangeIds));
};
