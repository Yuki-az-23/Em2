/**
 * useComments Hook (Stub)
 *
 * Comments hook for managing post comments.
 * TODO: Implement with Supabase
 */

import { useState, useEffect } from 'react';

export const useComments = (postId) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch comments
    setLoading(false);
  }, [postId]);

  const addComment = async (postId, text) => {
    // TODO: Add comment
    console.log('Add comment:', postId, text);
  };

  return {
    comments,
    loading,
    addComment,
  };
};
