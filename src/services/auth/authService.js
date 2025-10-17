import { supabase } from '../supabase/client.js';

/**
 * Authentication Service
 * Handles user authentication, session management, and profile creation
 */

/**
 * Sign up a new user with email and password
 * Also creates a user profile with default emotion/color
 *
 * @param {Object} data - Sign up data
 * @param {string} data.email - User email
 * @param {string} data.password - User password
 * @param {string} data.name - User display name
 * @param {string} [data.emotion='Joy'] - Initial emotion (default: Joy)
 * @param {string} [data.color='yellow'] - Initial color (default: yellow)
 * @returns {Promise<{user: Object, error: Error|null}>}
 */
export const signUp = async ({ email, password, name, emotion = 'Joy', color = 'yellow' }) => {
  try {
    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          emotion,
          color
        }
      }
    });

    if (authError) throw authError;

    // 2. Create user profile in users table
    // This is handled by the database trigger on_auth_user_created
    // but we'll verify it was created
    if (authData.user) {
      // Wait a bit for the trigger to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify profile exists
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // Profile will be created on first login if trigger failed
      }

      return {
        user: {
          ...authData.user,
          profile
        },
        error: null
      };
    }

    return { user: authData.user, error: null };

  } catch (error) {
    console.error('Sign up error:', error);
    return {
      user: null,
      error: {
        message: error.message || 'Failed to sign up',
        code: error.code
      }
    };
  }
};

/**
 * Sign in an existing user
 *
 * @param {Object} data - Sign in data
 * @param {string} data.email - User email
 * @param {string} data.password - User password
 * @returns {Promise<{user: Object, session: Object, error: Error|null}>}
 */
export const signIn = async ({ email, password }) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // Fetch user profile
    if (data.user) {
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.error('Profile fetch error:', profileError);
      }

      return {
        user: {
          ...data.user,
          profile
        },
        session: data.session,
        error: null
      };
    }

    return { user: data.user, session: data.session, error: null };

  } catch (error) {
    console.error('Sign in error:', error);
    return {
      user: null,
      session: null,
      error: {
        message: error.message || 'Failed to sign in',
        code: error.code
      }
    };
  }
};

/**
 * Sign out the current user
 *
 * @returns {Promise<{error: Error|null}>}
 */
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    return { error: null };

  } catch (error) {
    console.error('Sign out error:', error);
    return {
      error: {
        message: error.message || 'Failed to sign out',
        code: error.code
      }
    };
  }
};

/**
 * Get the current session
 *
 * @returns {Promise<{session: Object|null, error: Error|null}>}
 */
export const getSession = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    return { session: data.session, error: null };

  } catch (error) {
    console.error('Get session error:', error);
    return {
      session: null,
      error: {
        message: error.message || 'Failed to get session',
        code: error.code
      }
    };
  }
};

/**
 * Get the current authenticated user
 *
 * @returns {Promise<{user: Object|null, profile: Object|null, error: Error|null}>}
 */
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) return { user: null, profile: null, error: null };

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
    }

    return {
      user,
      profile,
      error: null
    };

  } catch (error) {
    console.error('Get current user error:', error);
    return {
      user: null,
      profile: null,
      error: {
        message: error.message || 'Failed to get current user',
        code: error.code
      }
    };
  }
};

/**
 * Update user password
 *
 * @param {string} newPassword - New password
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export const updatePassword = async (newPassword) => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;

    return { user: data.user, error: null };

  } catch (error) {
    console.error('Update password error:', error);
    return {
      user: null,
      error: {
        message: error.message || 'Failed to update password',
        code: error.code
      }
    };
  }
};

/**
 * Send password reset email
 *
 * @param {string} email - User email
 * @returns {Promise<{error: Error|null}>}
 */
export const resetPassword = async (email) => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) throw error;

    return { error: null };

  } catch (error) {
    console.error('Reset password error:', error);
    return {
      error: {
        message: error.message || 'Failed to send reset email',
        code: error.code
      }
    };
  }
};

/**
 * Listen to auth state changes
 *
 * @param {Function} callback - Callback function (event, session) => {}
 * @returns {Object} Subscription object with unsubscribe method
 */
export const onAuthStateChange = (callback) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return subscription;
};

/**
 * Verify if user is authenticated
 *
 * @returns {Promise<boolean>}
 */
export const isAuthenticated = async () => {
  const { session } = await getSession();
  return !!session;
};
