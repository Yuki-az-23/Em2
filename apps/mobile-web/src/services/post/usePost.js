import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client.js';
import {
  getPostById,
  getPostsByUser,
  getEnhancedFeed,
  searchPosts,
  createPost as createPostService,
  updatePost as updatePostService,
  deletePost as deletePostService,
  toggleBrace,
  checkIfBraced,
  getPostBraces,
  getPostComments,
  createComment as createCommentService,
  getCommentReplies,
  deleteComment as deleteCommentService
} from './postService.js';

/**
 * Hook to fetch a single post
 *
 * @param {string} postId - Post ID
 * @returns {Object} Post state and methods
 *
 * @example
 * const { post, loading, error, refresh } = usePost(postId);
 */
export const usePost = (postId) => {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPost = async () => {
    if (!postId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await getPostById(postId);

    if (result.error) {
      setError(result.error);
    } else {
      setPost(result.post);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadPost();
  }, [postId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!postId) return;

    const subscription = supabase
      .channel(`post:${postId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'posts',
        filter: `id=eq.${postId}`
      }, (payload) => {
        console.log('Post updated:', payload);
        loadPost(); // Reload post on any change
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [postId]);

  return {
    post,
    loading,
    error,
    refresh: loadPost
  };
};

/**
 * Hook to fetch posts by user
 *
 * @param {string} userId - User ID
 * @param {number} [limit=20] - Results per page
 * @returns {Object} Posts state and methods
 *
 * @example
 * const { posts, loading, loadMore, hasMore } = useUserPosts(userId);
 */
export const useUserPosts = (userId, limit = 20) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadPosts = async (newOffset = 0) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await getPostsByUser(userId, limit, newOffset);

    if (result.error) {
      setError(result.error);
    } else {
      if (newOffset === 0) {
        setPosts(result.posts);
      } else {
        setPosts(prev => [...prev, ...result.posts]);
      }

      setHasMore(result.posts.length === limit);
      setOffset(newOffset);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadPosts(0);
  }, [userId]);

  const loadMore = () => {
    if (!loading && hasMore) {
      loadPosts(offset + limit);
    }
  };

  return {
    posts,
    loading,
    error,
    loadMore,
    hasMore,
    refresh: () => loadPosts(0)
  };
};

/**
 * Hook to fetch personalized feed with ECBridge
 *
 * @param {string} userId - Current user ID
 * @param {number} [limit=20] - Results per page
 * @returns {Object} Feed state and methods
 *
 * @example
 * const { posts, loading, loadMore, hasMore } = useFeed(userId);
 */
export const useFeed = (userId, limit = 20) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadFeed = async (newOffset = 0) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await getEnhancedFeed(userId, limit, newOffset);

    if (result.error) {
      setError(result.error);
    } else {
      if (newOffset === 0) {
        setPosts(result.posts);
      } else {
        setPosts(prev => [...prev, ...result.posts]);
      }

      setHasMore(result.posts.length === limit);
      setOffset(newOffset);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadFeed(0);
  }, [userId]);

  // Subscribe to new posts in feed
  useEffect(() => {
    if (!userId) return;

    const subscription = supabase
      .channel('feed-posts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts'
      }, () => {
        loadFeed(0); // Reload feed when new posts are created
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId]);

  const loadMore = () => {
    if (!loading && hasMore) {
      loadFeed(offset + limit);
    }
  };

  return {
    posts,
    loading,
    error,
    loadMore,
    hasMore,
    refresh: () => loadFeed(0)
  };
};

/**
 * Hook to create/update/delete posts
 *
 * @returns {Object} Post mutation methods and state
 *
 * @example
 * const { createPost, updatePost, deletePost, loading, error } = usePostMutations();
 */
export const usePostMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createPost = async (postData) => {
    setLoading(true);
    setError(null);

    const result = await createPostService(postData);

    if (result.error) {
      setError(result.error);
    }

    setLoading(false);
    return result;
  };

  const updatePost = async (postId, updates) => {
    setLoading(true);
    setError(null);

    const result = await updatePostService(postId, updates);

    if (result.error) {
      setError(result.error);
    }

    setLoading(false);
    return result;
  };

  const deletePost = async (postId) => {
    setLoading(true);
    setError(null);

    const result = await deletePostService(postId);

    if (result.error) {
      setError(result.error);
    }

    setLoading(false);
    return result;
  };

  return {
    createPost,
    updatePost,
    deletePost,
    loading,
    error
  };
};

/**
 * Hook to manage post braces (likes)
 *
 * @param {string} userId - Current user ID
 * @param {string} postId - Post ID
 * @returns {Object} Brace state and methods
 *
 * @example
 * const { braced, toggle, loading } = useBrace(userId, postId);
 */
export const useBrace = (userId, postId) => {
  const [braced, setBraced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkBraceStatus = async () => {
    if (!userId || !postId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await checkIfBraced(userId, postId);

    if (result.error) {
      setError(result.error);
    } else {
      setBraced(result.braced);
    }

    setLoading(false);
  };

  useEffect(() => {
    checkBraceStatus();
  }, [userId, postId]);

  const toggle = async () => {
    const result = await toggleBrace(userId, postId);

    if (!result.error) {
      setBraced(result.braced);
    } else {
      setError(result.error);
    }

    return result;
  };

  return {
    braced,
    toggle,
    loading,
    error,
    refresh: checkBraceStatus
  };
};

/**
 * Hook to fetch post comments with real-time updates
 *
 * @param {string} postId - Post ID
 * @param {number} [limit=20] - Results per page
 * @returns {Object} Comments state and methods
 *
 * @example
 * const { comments, loading, loadMore, hasMore, refresh } = usePostComments(postId);
 */
export const usePostComments = (postId, limit = 20) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadComments = async (newOffset = 0) => {
    if (!postId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await getPostComments(postId, limit, newOffset);

    if (result.error) {
      setError(result.error);
    } else {
      if (newOffset === 0) {
        setComments(result.comments);
      } else {
        setComments(prev => [...prev, ...result.comments]);
      }

      setHasMore(result.comments.length === limit);
      setOffset(newOffset);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadComments(0);
  }, [postId]);

  // Subscribe to new comments
  useEffect(() => {
    if (!postId) return;

    const subscription = supabase
      .channel(`comments:${postId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${postId}`
      }, () => {
        loadComments(0); // Reload comments when new ones are added
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [postId]);

  const loadMore = () => {
    if (!loading && hasMore) {
      loadComments(offset + limit);
    }
  };

  return {
    comments,
    loading,
    error,
    loadMore,
    hasMore,
    refresh: () => loadComments(0)
  };
};

/**
 * Hook to create/delete comments
 *
 * @returns {Object} Comment mutation methods and state
 *
 * @example
 * const { createComment, deleteComment, loading, error } = useCommentMutations();
 */
export const useCommentMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createComment = async (commentData) => {
    setLoading(true);
    setError(null);

    const result = await createCommentService(commentData);

    if (result.error) {
      setError(result.error);
    }

    setLoading(false);
    return result;
  };

  const deleteComment = async (commentId) => {
    setLoading(true);
    setError(null);

    const result = await deleteCommentService(commentId);

    if (result.error) {
      setError(result.error);
    }

    setLoading(false);
    return result;
  };

  return {
    createComment,
    deleteComment,
    loading,
    error
  };
};

/**
 * Hook to search posts
 *
 * @returns {Object} Search state and methods
 *
 * @example
 * const { posts, loading, search } = usePostSearch();
 *
 * await search({ query: 'hello', emotion: 'Joy' });
 */
export const usePostSearch = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = async (searchParams) => {
    setLoading(true);
    setError(null);

    const result = await searchPosts(searchParams);

    if (result.error) {
      setError(result.error);
    } else {
      setPosts(result.posts);
    }

    setLoading(false);
    return result;
  };

  return {
    posts,
    loading,
    error,
    search
  };
};
