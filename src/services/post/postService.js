import { supabase } from '../supabase/client.js';

/**
 * Post Service
 * Handles post CRUD operations, braces (likes), and comments
 */

/**
 * Create a new post
 *
 * @param {Object} postData - Post data
 * @param {string} postData.user_id - Author ID
 * @param {string} postData.title - Post title
 * @param {Object} postData.content - EditorJS content (JSON)
 * @param {string} postData.emotion - Post emotion
 * @param {string} postData.color - Post color
 * @param {number} [postData.intensity=1.0] - Emotional intensity
 * @returns {Promise<{post: Object|null, error: Error|null}>}
 */
export const createPost = async (postData) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: postData.user_id,
        title: postData.title,
        content: postData.content,
        emotion: postData.emotion,
        color: postData.color,
        initial_emotion: postData.emotion, // Store initial state
        initial_color: postData.color,
        intensity: postData.intensity || 1.0
      })
      .select(`
        *,
        author:users (
          id,
          name,
          emotion,
          color,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;

    return { post: data, error: null };

  } catch (error) {
    console.error('Create post error:', error);
    return {
      post: null,
      error: {
        message: error.message || 'Failed to create post',
        code: error.code
      }
    };
  }
};

/**
 * Get post by ID with full details
 *
 * @param {string} postId - Post ID
 * @returns {Promise<{post: Object|null, error: Error|null}>}
 */
export const getPostById = async (postId) => {
  try {
    const { data, error} = await supabase
      .from('posts_with_stats')
      .select(`
        *,
        author:users (
          id,
          name,
          emotion,
          color,
          avatar_url
        )
      `)
      .eq('id', postId)
      .single();

    if (error) throw error;

    return { post: data, error: null };

  } catch (error) {
    console.error('Get post error:', error);
    return {
      post: null,
      error: {
        message: error.message || 'Failed to get post',
        code: error.code
      }
    };
  }
};

/**
 * Update a post
 *
 * @param {string} postId - Post ID
 * @param {Object} updates - Fields to update
 * @param {string} [updates.title] - Post title
 * @param {Object} [updates.content] - EditorJS content
 * @param {string} [updates.emotion] - Current emotion
 * @param {string} [updates.color] - Current color
 * @param {number} [updates.intensity] - Intensity
 * @returns {Promise<{post: Object|null, error: Error|null}>}
 */
export const updatePost = async (postId, updates) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', postId)
      .select(`
        *,
        author:users (
          id,
          name,
          emotion,
          color,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;

    return { post: data, error: null };

  } catch (error) {
    console.error('Update post error:', error);
    return {
      post: null,
      error: {
        message: error.message || 'Failed to update post',
        code: error.code
      }
    };
  }
};

/**
 * Delete a post
 *
 * @param {string} postId - Post ID
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const deletePost = async (postId) => {
  try {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) throw error;

    return { success: true, error: null };

  } catch (error) {
    console.error('Delete post error:', error);
    return {
      success: false,
      error: {
        message: error.message || 'Failed to delete post',
        code: error.code
      }
    };
  }
};

/**
 * Get posts by user ID
 *
 * @param {string} userId - User ID
 * @param {number} [limit=20] - Number of results
 * @param {number} [offset=0] - Pagination offset
 * @returns {Promise<{posts: Array, error: Error|null}>}
 */
export const getPostsByUser = async (userId, limit = 20, offset = 0) => {
  try {
    const { data, error } = await supabase
      .from('posts_with_stats')
      .select(`
        *,
        author:users (
          id,
          name,
          emotion,
          color,
          avatar_url
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return { posts: data, error: null };

  } catch (error) {
    console.error('Get posts by user error:', error);
    return {
      posts: [],
      error: {
        message: error.message || 'Failed to get posts',
        code: error.code
      }
    };
  }
};

/**
 * Get enhanced feed using ECBridge algorithm
 *
 * @param {string} userId - Current user ID
 * @param {number} [limit=20] - Number of results
 * @param {number} [offset=0] - Pagination offset
 * @returns {Promise<{posts: Array, error: Error|null}>}
 */
export const getEnhancedFeed = async (userId, limit = 20, offset = 0) => {
  try {
    const { data, error } = await supabase
      .rpc('get_enhanced_feed', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset
      });

    if (error) throw error;

    return { posts: data, error: null };

  } catch (error) {
    console.error('Get enhanced feed error:', error);
    return {
      posts: [],
      error: {
        message: error.message || 'Failed to get feed',
        code: error.code
      }
    };
  }
};

/**
 * Search posts
 *
 * @param {Object} searchParams - Search parameters
 * @param {string} [searchParams.query] - Text search query
 * @param {string} [searchParams.emotion] - Filter by emotion
 * @param {string} [searchParams.color] - Filter by color
 * @param {string} [searchParams.userId] - Filter by user
 * @param {number} [searchParams.limit=20] - Number of results
 * @returns {Promise<{posts: Array, error: Error|null}>}
 */
export const searchPosts = async (searchParams) => {
  try {
    const { data, error } = await supabase
      .rpc('search_posts', {
        p_query: searchParams.query || null,
        p_emotion: searchParams.emotion || null,
        p_color: searchParams.color || null,
        p_user_id: searchParams.userId || null,
        p_limit: searchParams.limit || 20
      });

    if (error) throw error;

    return { posts: data, error: null };

  } catch (error) {
    console.error('Search posts error:', error);
    return {
      posts: [],
      error: {
        message: error.message || 'Failed to search posts',
        code: error.code
      }
    };
  }
};

/**
 * Toggle brace (like) on a post
 *
 * @param {string} userId - User ID
 * @param {string} postId - Post ID
 * @returns {Promise<{braced: boolean, error: Error|null}>}
 */
export const toggleBrace = async (userId, postId) => {
  try {
    const { data, error } = await supabase
      .rpc('toggle_brace', {
        p_user_id: userId,
        p_post_id: postId
      });

    if (error) throw error;

    return { braced: data, error: null };

  } catch (error) {
    console.error('Toggle brace error:', error);
    return {
      braced: false,
      error: {
        message: error.message || 'Failed to toggle brace',
        code: error.code
      }
    };
  }
};

/**
 * Check if user has braced a post
 *
 * @param {string} userId - User ID
 * @param {string} postId - Post ID
 * @returns {Promise<{braced: boolean, error: Error|null}>}
 */
export const checkIfBraced = async (userId, postId) => {
  try {
    const { data, error } = await supabase
      .from('braces')
      .select('user_id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle();

    if (error) throw error;

    return { braced: !!data, error: null };

  } catch (error) {
    console.error('Check brace error:', error);
    return {
      braced: false,
      error: {
        message: error.message || 'Failed to check brace',
        code: error.code
      }
    };
  }
};

/**
 * Get users who braced a post
 *
 * @param {string} postId - Post ID
 * @param {number} [limit=20] - Number of results
 * @param {number} [offset=0] - Pagination offset
 * @returns {Promise<{users: Array, error: Error|null}>}
 */
export const getPostBraces = async (postId, limit = 20, offset = 0) => {
  try {
    const { data, error } = await supabase
      .from('braces')
      .select(`
        user_id,
        created_at,
        user:users (
          id,
          name,
          emotion,
          color,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const users = data.map(item => ({
      ...item.user,
      braced_at: item.created_at
    }));

    return { users, error: null };

  } catch (error) {
    console.error('Get post braces error:', error);
    return {
      users: [],
      error: {
        message: error.message || 'Failed to get braces',
        code: error.code
      }
    };
  }
};

/**
 * Get post comments with nested replies
 *
 * @param {string} postId - Post ID
 * @param {number} [limit=20] - Number of results
 * @param {number} [offset=0] - Pagination offset
 * @returns {Promise<{comments: Array, error: Error|null}>}
 */
export const getPostComments = async (postId, limit = 20, offset = 0) => {
  try {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        author:users (
          id,
          name,
          emotion,
          color,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .is('parent_comment_id', null) // Get top-level comments only
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return { comments: data, error: null };

  } catch (error) {
    console.error('Get post comments error:', error);
    return {
      comments: [],
      error: {
        message: error.message || 'Failed to get comments',
        code: error.code
      }
    };
  }
};

/**
 * Create a comment on a post
 *
 * @param {Object} commentData - Comment data
 * @param {string} commentData.post_id - Post ID
 * @param {string} commentData.user_id - Author ID
 * @param {string} commentData.text - Comment text
 * @param {string} [commentData.parent_comment_id] - Parent comment ID (for replies)
 * @param {string} commentData.emotion - Comment emotion (from ECBridge)
 * @param {string} commentData.color - Comment color (from ECBridge)
 * @returns {Promise<{comment: Object|null, error: Error|null}>}
 */
export const createComment = async (commentData) => {
  try {
    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: commentData.post_id,
        user_id: commentData.user_id,
        text: commentData.text,
        parent_comment_id: commentData.parent_comment_id || null,
        emotion: commentData.emotion,
        color: commentData.color
      })
      .select(`
        *,
        author:users (
          id,
          name,
          emotion,
          color,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;

    return { comment: data, error: null };

  } catch (error) {
    console.error('Create comment error:', error);
    return {
      comment: null,
      error: {
        message: error.message || 'Failed to create comment',
        code: error.code
      }
    };
  }
};

/**
 * Get replies to a comment
 *
 * @param {string} commentId - Parent comment ID
 * @param {number} [limit=10] - Number of results
 * @returns {Promise<{replies: Array, error: Error|null}>}
 */
export const getCommentReplies = async (commentId, limit = 10) => {
  try {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        author:users (
          id,
          name,
          emotion,
          color,
          avatar_url
        )
      `)
      .eq('parent_comment_id', commentId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    return { replies: data, error: null };

  } catch (error) {
    console.error('Get comment replies error:', error);
    return {
      replies: [],
      error: {
        message: error.message || 'Failed to get replies',
        code: error.code
      }
    };
  }
};

/**
 * Delete a comment
 *
 * @param {string} commentId - Comment ID
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const deleteComment = async (commentId) => {
  try {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) throw error;

    return { success: true, error: null };

  } catch (error) {
    console.error('Delete comment error:', error);
    return {
      success: false,
      error: {
        message: error.message || 'Failed to delete comment',
        code: error.code
      }
    };
  }
};
