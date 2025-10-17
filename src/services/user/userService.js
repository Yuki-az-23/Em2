import { supabase } from '../supabase/client.js';

/**
 * User Service
 * Handles user profile operations, following, and ECBridge updates
 */

/**
 * Get user by ID with stats
 *
 * @param {string} userId - User ID
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export const getUserById = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users_with_stats')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    return { user: data, error: null };

  } catch (error) {
    console.error('Get user error:', error);
    return {
      user: null,
      error: {
        message: error.message || 'Failed to get user',
        code: error.code
      }
    };
  }
};

/**
 * Update user profile
 *
 * @param {string} userId - User ID
 * @param {Object} updates - Fields to update
 * @param {string} [updates.name] - Display name
 * @param {string} [updates.bio] - User bio
 * @param {string} [updates.emotion] - Current emotion
 * @param {string} [updates.color] - Current color
 * @param {string} [updates.avatar_url] - Avatar URL
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export const updateUserProfile = async (userId, updates) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    return { user: data, error: null };

  } catch (error) {
    console.error('Update user error:', error);
    return {
      user: null,
      error: {
        message: error.message || 'Failed to update user',
        code: error.code
      }
    };
  }
};

/**
 * Update user emotion and color (ECBridge state)
 *
 * @param {string} userId - User ID
 * @param {string} emotion - New emotion
 * @param {string} color - New color
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export const updateUserECBridge = async (userId, emotion, color) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        emotion,
        color,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    return { user: data, error: null };

  } catch (error) {
    console.error('Update ECBridge error:', error);
    return {
      user: null,
      error: {
        message: error.message || 'Failed to update ECBridge',
        code: error.code
      }
    };
  }
};

/**
 * Upload user avatar
 *
 * @param {string} userId - User ID
 * @param {File} file - Image file
 * @returns {Promise<{url: string|null, error: Error|null}>}
 */
export const uploadAvatar = async (userId, file) => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    // Upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // Update user profile with new avatar URL
    await updateUserProfile(userId, { avatar_url: publicUrl });

    return { url: publicUrl, error: null };

  } catch (error) {
    console.error('Upload avatar error:', error);
    return {
      url: null,
      error: {
        message: error.message || 'Failed to upload avatar',
        code: error.code
      }
    };
  }
};

/**
 * Follow a user
 *
 * @param {string} followerId - ID of user doing the following
 * @param {string} followingId - ID of user being followed
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const followUser = async (followerId, followingId) => {
  try {
    // Use database function for toggle
    const { data, error } = await supabase
      .rpc('toggle_follow', {
        p_follower_id: followerId,
        p_following_id: followingId
      });

    if (error) throw error;

    return { success: data, error: null };

  } catch (error) {
    console.error('Follow user error:', error);
    return {
      success: false,
      error: {
        message: error.message || 'Failed to follow user',
        code: error.code
      }
    };
  }
};

/**
 * Unfollow a user
 * (Same as followUser - it's a toggle function)
 *
 * @param {string} followerId - ID of user doing the unfollowing
 * @param {string} followingId - ID of user being unfollowed
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const unfollowUser = async (followerId, followingId) => {
  return await followUser(followerId, followingId);
};

/**
 * Get user's followers
 *
 * @param {string} userId - User ID
 * @param {number} [limit=20] - Number of results
 * @param {number} [offset=0] - Pagination offset
 * @returns {Promise<{followers: Array, error: Error|null}>}
 */
export const getFollowers = async (userId, limit = 20, offset = 0) => {
  try {
    const { data, error } = await supabase
      .from('follows')
      .select(`
        follower_id,
        follower:users!follows_follower_id_fkey (
          id,
          name,
          emotion,
          color,
          avatar_url
        )
      `)
      .eq('following_id', userId)
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const followers = data.map(item => item.follower);

    return { followers, error: null };

  } catch (error) {
    console.error('Get followers error:', error);
    return {
      followers: [],
      error: {
        message: error.message || 'Failed to get followers',
        code: error.code
      }
    };
  }
};

/**
 * Get users that a user is following
 *
 * @param {string} userId - User ID
 * @param {number} [limit=20] - Number of results
 * @param {number} [offset=0] - Pagination offset
 * @returns {Promise<{following: Array, error: Error|null}>}
 */
export const getFollowing = async (userId, limit = 20, offset = 0) => {
  try {
    const { data, error } = await supabase
      .from('follows')
      .select(`
        following_id,
        following:users!follows_following_id_fkey (
          id,
          name,
          emotion,
          color,
          avatar_url
        )
      `)
      .eq('follower_id', userId)
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const following = data.map(item => item.following);

    return { following, error: null };

  } catch (error) {
    console.error('Get following error:', error);
    return {
      following: [],
      error: {
        message: error.message || 'Failed to get following',
        code: error.code
      }
    };
  }
};

/**
 * Check if user A follows user B
 *
 * @param {string} followerId - User A ID
 * @param {string} followingId - User B ID
 * @returns {Promise<{isFollowing: boolean, error: Error|null}>}
 */
export const checkIfFollowing = async (followerId, followingId) => {
  try {
    const { data, error } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .maybeSingle();

    if (error) throw error;

    return { isFollowing: !!data, error: null };

  } catch (error) {
    console.error('Check following error:', error);
    return {
      isFollowing: false,
      error: {
        message: error.message || 'Failed to check following status',
        code: error.code
      }
    };
  }
};

/**
 * Search users by name
 *
 * @param {string} query - Search query
 * @param {number} [limit=10] - Number of results
 * @returns {Promise<{users: Array, error: Error|null}>}
 */
export const searchUsers = async (query, limit = 10) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, emotion, color, avatar_url')
      .ilike('name', `%${query}%`)
      .limit(limit);

    if (error) throw error;

    return { users: data, error: null };

  } catch (error) {
    console.error('Search users error:', error);
    return {
      users: [],
      error: {
        message: error.message || 'Failed to search users',
        code: error.code
      }
    };
  }
};

/**
 * Get user's statistics
 *
 * @param {string} userId - User ID
 * @returns {Promise<{stats: Object|null, error: Error|null}>}
 */
export const getUserStats = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users_with_stats')
      .select('post_count, follower_count, following_count')
      .eq('id', userId)
      .single();

    if (error) throw error;

    return { stats: data, error: null };

  } catch (error) {
    console.error('Get user stats error:', error);
    return {
      stats: null,
      error: {
        message: error.message || 'Failed to get user stats',
        code: error.code
      }
    };
  }
};

/**
 * Delete user account
 * (Note: This will cascade delete all posts, comments, etc.)
 *
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const deleteUser = async (userId) => {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;

    return { success: true, error: null };

  } catch (error) {
    console.error('Delete user error:', error);
    return {
      success: false,
      error: {
        message: error.message || 'Failed to delete user',
        code: error.code
      }
    };
  }
};
