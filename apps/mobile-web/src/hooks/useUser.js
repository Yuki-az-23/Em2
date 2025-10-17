/**
 * useUser Hook (Stub)
 *
 * User profile hook for fetching and updating user data.
 * TODO: Implement with Supabase
 */

import { useState, useEffect } from 'react';

export const useUser = (userId) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // TODO: Fetch user from Supabase
    setLoading(false);
  }, [userId]);

  const updateProfile = async (data) => {
    // TODO: Update user profile
    console.log('Update profile:', data);
  };

  return {
    user,
    loading,
    error,
    updateProfile,
  };
};
