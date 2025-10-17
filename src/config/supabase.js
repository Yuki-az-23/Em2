/**
 * Supabase Client Configuration
 *
 * Initializes the Supabase client for authentication, database, and realtime features.
 */

import { createClient } from '@supabase/supabase-js';

// Get Supabase URL and anon key from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment variables'
  );
}

/**
 * Supabase client instance
 *
 * Configured with:
 * - Persistent auth sessions (localStorage)
 * - Auto-refresh tokens
 * - Realtime enabled
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    enabled: true,
  },
});

/**
 * Helper to get the current user session
 * @returns {Promise<{session: object, error: object}>}
 */
export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  return { session: data?.session, error };
};

/**
 * Helper to get the current user
 * @returns {Promise<{user: object, error: object}>}
 */
export const getUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  return { user: data?.user, error };
};

export default supabase;
