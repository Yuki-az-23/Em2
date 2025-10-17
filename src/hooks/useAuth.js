/**
 * useAuth Hook (Stub)
 *
 * Authentication hook for user login/logout.
 * TODO: Implement with Supabase auth
 */

import { useState } from 'react';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);
    try {
      // TODO: Implement Supabase auth
      console.log('Login:', email, password);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('jwt');
  };

  return {
    user,
    loading,
    login,
    logout,
  };
};
