import { useState, useEffect, createContext, useContext } from 'react';
import {
  signUp as authSignUp,
  signIn as authSignIn,
  signOut as authSignOut,
  getCurrentUser,
  onAuthStateChange,
  updatePassword as authUpdatePassword,
  resetPassword as authResetPassword
} from './authService.js';

/**
 * Auth Context
 */
const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  signUp: async () => {},
  signIn: async () => {},
  signOut: async () => {},
  updatePassword: async () => {},
  resetPassword: async () => {}
});

/**
 * Auth Provider Component
 * Wrap your app with this to provide auth context
 *
 * @example
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load initial user
  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      try {
        const { user: currentUser, profile: currentProfile } = await getCurrentUser();

        if (mounted) {
          setUser(currentUser);
          setProfile(currentProfile);
          setLoading(false);
        }
      } catch (error) {
        console.error('Load user error:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadUser();

    return () => {
      mounted = false;
    };
  }, []);

  // Listen to auth changes
  useEffect(() => {
    const subscription = onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);

      if (session?.user) {
        const { user: currentUser, profile: currentProfile } = await getCurrentUser();
        setUser(currentUser);
        setProfile(currentProfile);
      } else {
        setUser(null);
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Sign up handler
  const signUp = async (data) => {
    const result = await authSignUp(data);

    if (result.user) {
      setUser(result.user);
      setProfile(result.user.profile);
    }

    return result;
  };

  // Sign in handler
  const signIn = async (data) => {
    const result = await authSignIn(data);

    if (result.user) {
      setUser(result.user);
      setProfile(result.user.profile);
    }

    return result;
  };

  // Sign out handler
  const signOut = async () => {
    const result = await authSignOut();

    if (!result.error) {
      setUser(null);
      setProfile(null);
    }

    return result;
  };

  // Update password handler
  const updatePassword = async (newPassword) => {
    return await authUpdatePassword(newPassword);
  };

  // Reset password handler
  const resetPassword = async (email) => {
    return await authResetPassword(email);
  };

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    updatePassword,
    resetPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * useAuth Hook
 * Access authentication state and methods
 *
 * @returns {Object} Auth context
 * @returns {Object|null} user - Current user
 * @returns {Object|null} profile - User profile
 * @returns {boolean} loading - Loading state
 * @returns {Function} signUp - Sign up function
 * @returns {Function} signIn - Sign in function
 * @returns {Function} signOut - Sign out function
 * @returns {Function} updatePassword - Update password function
 * @returns {Function} resetPassword - Reset password function
 *
 * @example
 * const { user, profile, signIn, signOut } = useAuth();
 *
 * if (!user) {
 *   return <SignInForm onSubmit={signIn} />;
 * }
 *
 * return (
 *   <div>
 *     <h1>Welcome {profile?.name}</h1>
 *     <button onClick={signOut}>Sign Out</button>
 *   </div>
 * );
 */
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

/**
 * Require Authentication Hook
 * Redirects to sign in if not authenticated
 *
 * @param {string} [redirectTo='/signin'] - Where to redirect if not authenticated
 * @returns {Object} Auth context
 *
 * @example
 * const ProtectedPage = () => {
 *   const { user, profile } = useRequireAuth();
 *
 *   return <div>Welcome {profile?.name}</div>;
 * };
 */
export const useRequireAuth = (redirectTo = '/signin') => {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      window.location.href = redirectTo;
    }
  }, [auth.loading, auth.user, redirectTo]);

  return auth;
};
