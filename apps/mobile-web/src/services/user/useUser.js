import { useState, useEffect } from 'react';
import {
  getUserById,
  updateUserProfile,
  updateUserECBridge,
  uploadAvatar,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  checkIfFollowing,
  searchUsers,
  getUserStats
} from './userService.js';

/**
 * Hook to fetch and manage a user's profile
 *
 * @param {string} userId - User ID to fetch
 * @returns {Object} User state and methods
 *
 * @example
 * const { user, loading, error, refresh } = useUser(userId);
 */
export const useUser = (userId) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadUser = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await getUserById(userId);

    if (result.error) {
      setError(result.error);
    } else {
      setUser(result.user);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadUser();
  }, [userId]);

  return {
    user,
    loading,
    error,
    refresh: loadUser
  };
};

/**
 * Hook to manage user profile updates
 *
 * @param {string} userId - User ID
 * @returns {Object} Update methods and state
 *
 * @example
 * const { update, updateECBridge, uploading, error } = useUserUpdate(userId);
 *
 * await update({ name: 'New Name', bio: 'New bio' });
 * await updateECBridge('Joy', 'yellow');
 */
export const useUserUpdate = (userId) => {
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const update = async (updates) => {
    setUpdating(true);
    setError(null);

    const result = await updateUserProfile(userId, updates);

    if (result.error) {
      setError(result.error);
    }

    setUpdating(false);
    return result;
  };

  const updateECBridgeState = async (emotion, color) => {
    setUpdating(true);
    setError(null);

    const result = await updateUserECBridge(userId, emotion, color);

    if (result.error) {
      setError(result.error);
    }

    setUpdating(false);
    return result;
  };

  const uploadUserAvatar = async (file) => {
    setUploading(true);
    setError(null);

    const result = await uploadAvatar(userId, file);

    if (result.error) {
      setError(result.error);
    }

    setUploading(false);
    return result;
  };

  return {
    update,
    updateECBridge: updateECBridgeState,
    uploadAvatar: uploadUserAvatar,
    updating,
    uploading,
    error
  };
};

/**
 * Hook to manage following/followers
 *
 * @param {string} userId - Current user ID
 * @param {string} targetUserId - Target user ID (for checking follow status)
 * @returns {Object} Follow methods and state
 *
 * @example
 * const { isFollowing, follow, unfollow, loading } = useFollow(myId, theirId);
 *
 * if (!isFollowing) {
 *   <button onClick={follow}>Follow</button>
 * }
 */
export const useFollow = (userId, targetUserId) => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkFollowStatus = async () => {
    if (!userId || !targetUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await checkIfFollowing(userId, targetUserId);

    if (result.error) {
      setError(result.error);
    } else {
      setIsFollowing(result.isFollowing);
    }

    setLoading(false);
  };

  useEffect(() => {
    checkFollowStatus();
  }, [userId, targetUserId]);

  const follow = async () => {
    const result = await followUser(userId, targetUserId);

    if (!result.error) {
      setIsFollowing(true);
    } else {
      setError(result.error);
    }

    return result;
  };

  const unfollow = async () => {
    const result = await unfollowUser(userId, targetUserId);

    if (!result.error) {
      setIsFollowing(false);
    } else {
      setError(result.error);
    }

    return result;
  };

  return {
    isFollowing,
    follow,
    unfollow,
    loading,
    error,
    refresh: checkFollowStatus
  };
};

/**
 * Hook to fetch followers
 *
 * @param {string} userId - User ID
 * @param {number} [limit=20] - Results per page
 * @returns {Object} Followers state and methods
 *
 * @example
 * const { followers, loading, loadMore, hasMore } = useFollowers(userId);
 */
export const useFollowers = (userId, limit = 20) => {
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadFollowers = async (newOffset = 0) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await getFollowers(userId, limit, newOffset);

    if (result.error) {
      setError(result.error);
    } else {
      if (newOffset === 0) {
        setFollowers(result.followers);
      } else {
        setFollowers(prev => [...prev, ...result.followers]);
      }

      setHasMore(result.followers.length === limit);
      setOffset(newOffset);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadFollowers(0);
  }, [userId]);

  const loadMore = () => {
    if (!loading && hasMore) {
      loadFollowers(offset + limit);
    }
  };

  return {
    followers,
    loading,
    error,
    loadMore,
    hasMore,
    refresh: () => loadFollowers(0)
  };
};

/**
 * Hook to fetch following
 *
 * @param {string} userId - User ID
 * @param {number} [limit=20] - Results per page
 * @returns {Object} Following state and methods
 *
 * @example
 * const { following, loading, loadMore, hasMore } = useFollowing(userId);
 */
export const useFollowing = (userId, limit = 20) => {
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadFollowing = async (newOffset = 0) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await getFollowing(userId, limit, newOffset);

    if (result.error) {
      setError(result.error);
    } else {
      if (newOffset === 0) {
        setFollowing(result.following);
      } else {
        setFollowing(prev => [...prev, ...result.following]);
      }

      setHasMore(result.following.length === limit);
      setOffset(newOffset);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadFollowing(0);
  }, [userId]);

  const loadMore = () => {
    if (!loading && hasMore) {
      loadFollowing(offset + limit);
    }
  };

  return {
    following,
    loading,
    error,
    loadMore,
    hasMore,
    refresh: () => loadFollowing(0)
  };
};

/**
 * Hook to search users
 *
 * @param {string} query - Search query
 * @param {number} [limit=10] - Max results
 * @returns {Object} Search state and results
 *
 * @example
 * const { users, loading, search } = useUserSearch();
 *
 * useEffect(() => {
 *   if (searchQuery) {
 *     search(searchQuery);
 *   }
 * }, [searchQuery]);
 */
export const useUserSearch = (limit = 10) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = async (query) => {
    if (!query || query.trim().length === 0) {
      setUsers([]);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await searchUsers(query, limit);

    if (result.error) {
      setError(result.error);
    } else {
      setUsers(result.users);
    }

    setLoading(false);
  };

  return {
    users,
    loading,
    error,
    search
  };
};

/**
 * Hook to fetch user statistics
 *
 * @param {string} userId - User ID
 * @returns {Object} Stats state
 *
 * @example
 * const { stats, loading } = useUserStats(userId);
 *
 * <div>
 *   <p>Posts: {stats?.post_count}</p>
 *   <p>Followers: {stats?.follower_count}</p>
 *   <p>Following: {stats?.following_count}</p>
 * </div>
 */
export const useUserStats = (userId) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await getUserStats(userId);

    if (result.error) {
      setError(result.error);
    } else {
      setStats(result.stats);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadStats();
  }, [userId]);

  return {
    stats,
    loading,
    error,
    refresh: loadStats
  };
};
