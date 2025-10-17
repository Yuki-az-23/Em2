/**
 * useAuth Hook
 *
 * Authentication hook for user login/logout/signup with Supabase.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  // Initialize auth state on mount
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * Sign up a new user
   * @param {object} params - User signup data
   * @param {string} params.email - User email
   * @param {string} params.password - User password
   * @param {object} params.metadata - Additional user metadata
   * @returns {Promise<{user: object, error: object}>}
   */
  const signup = async ({ email, password, metadata = {} }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      });

      if (error) throw error;
      return { user: data.user, error: null };
    } catch (error) {
      console.error('Signup error:', error);
      return { user: null, error };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign in an existing user
   * @param {object} params - Login credentials
   * @param {string} params.email - User email
   * @param {string} params.password - User password
   * @returns {Promise<{user: object, session: object, error: object}>}
   */
  const login = async ({ email, password }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      setSession(data.session);
      setUser(data.user);

      return { user: data.user, session: data.session, error: null };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign out the current user
   * @returns {Promise<{error: object}>}
   */
  const logout = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);
      setSession(null);
      localStorage.removeItem('jwt'); // Clean up old JWT if exists

      return { error: null };
    } catch (error) {
      console.error('Logout error:', error);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update user metadata
   * @param {object} updates - User metadata to update
   * @returns {Promise<{user: object, error: object}>}
   */
  const updateUser = async (updates) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: updates,
      });

      if (error) throw error;

      setUser(data.user);
      return { user: data.user, error: null };
    } catch (error) {
      console.error('Update user error:', error);
      return { user: null, error };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Send password reset email
   * @param {string} email - User email
   * @returns {Promise<{error: object}>}
   */
  const resetPassword = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Reset password error:', error);
      return { error };
    }
  };

  return {
    user,
    session,
    loading,
    signup,
    login,
    logout,
    updateUser,
    resetPassword,
    isAuthenticated: !!user,
  };
};
