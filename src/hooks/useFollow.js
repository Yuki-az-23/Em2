/**
 * useFollow Hook (Stub)
 *
 * Follow hook for managing user follows.
 * TODO: Implement with Supabase
 */

import { useState } from 'react';

export const useFollow = () => {
  const [following, setFollowing] = useState({});

  const toggleFollow = async (userId) => {
    // TODO: Toggle follow
    console.log('Toggle follow:', userId);
  };

  const isFollowing = (userId) => {
    return following[userId] || false;
  };

  const followers = [];
  const followingList = [];

  return {
    toggleFollow,
    isFollowing,
    followers,
    following: followingList,
  };
};
