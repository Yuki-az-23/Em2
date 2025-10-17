/**
 * useRealtimeComments Hook
 *
 * Real-time subscription for comment updates using Supabase Realtime.
 * Listens for INSERT, UPDATE, and DELETE events on the comments table
 * for a specific post.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase/client';

/**
 * Hook to subscribe to real-time comment updates for a post
 *
 * @param {Object} options - Configuration options
 * @param {string} options.postId - Post ID to subscribe to
 * @param {Array} options.initialComments - Initial comments array
 * @param {boolean} options.enabled - Whether to enable real-time (default: true)
 * @param {Function} options.onInsert - Callback when comment is inserted
 * @param {Function} options.onUpdate - Callback when comment is updated
 * @param {Function} options.onDelete - Callback when comment is deleted
 * @returns {Object} - { comments, commentCount, isSubscribed, error }
 */
export const useRealtimeComments = ({
  postId,
  initialComments = [],
  enabled = true,
  onInsert,
  onUpdate,
  onDelete,
} = {}) => {
  const [comments, setComments] = useState(initialComments);
  const [commentCount, setCommentCount] = useState(initialComments.length);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Update comments when initialComments changes
    setComments(initialComments);
    setCommentCount(initialComments.length);
  }, [initialComments]);

  useEffect(() => {
    if (!enabled || !postId) {
      return;
    }

    let subscription = null;

    const setupSubscription = async () => {
      try {
        // Subscribe to comments table changes for this post
        subscription = supabase
          .channel(`comments-${postId}`)
          .on(
            'postgres_changes',
            {
              event: '*', // Listen to all events
              schema: 'public',
              table: 'comments',
              filter: `post_id=eq.${postId}`,
            },
            async (payload) => {
              console.log('Comment change received:', payload);

              // Handle INSERT
              if (payload.eventType === 'INSERT') {
                const newComment = payload.new;

                // Fetch full comment with author info
                const { data: fullComment, error: fetchError } = await supabase
                  .from('comments')
                  .select(`
                    *,
                    author:user_id (
                      id,
                      name,
                      photo,
                      emotion,
                      color
                    )
                  `)
                  .eq('id', newComment.id)
                  .single();

                if (fetchError) {
                  console.error('Error fetching new comment:', fetchError);
                  return;
                }

                // Add to end of comments array (chronological order)
                setComments((prevComments) => [...prevComments, fullComment]);
                setCommentCount((prevCount) => prevCount + 1);

                // Call callback
                if (onInsert) {
                  onInsert(fullComment);
                }
              }

              // Handle UPDATE
              if (payload.eventType === 'UPDATE') {
                const updatedComment = payload.new;

                // Fetch full comment
                const { data: fullComment, error: fetchError } = await supabase
                  .from('comments')
                  .select(`
                    *,
                    author:user_id (
                      id,
                      name,
                      photo,
                      emotion,
                      color
                    )
                  `)
                  .eq('id', updatedComment.id)
                  .single();

                if (fetchError) {
                  console.error('Error fetching updated comment:', fetchError);
                  return;
                }

                // Update in comments array
                setComments((prevComments) =>
                  prevComments.map((comment) =>
                    comment.id === fullComment.id ? fullComment : comment
                  )
                );

                // Call callback
                if (onUpdate) {
                  onUpdate(fullComment);
                }
              }

              // Handle DELETE
              if (payload.eventType === 'DELETE') {
                const deletedComment = payload.old;

                // Remove from comments array
                setComments((prevComments) =>
                  prevComments.filter((comment) => comment.id !== deletedComment.id)
                );
                setCommentCount((prevCount) => prevCount - 1);

                // Call callback
                if (onDelete) {
                  onDelete(deletedComment);
                }
              }
            }
          )
          .subscribe((status) => {
            console.log('Comments subscription status:', status);

            if (status === 'SUBSCRIBED') {
              setIsSubscribed(true);
              setError(null);
            } else if (status === 'CHANNEL_ERROR') {
              setIsSubscribed(false);
              setError(new Error('Failed to subscribe to comments channel'));
            } else if (status === 'TIMED_OUT') {
              setIsSubscribed(false);
              setError(new Error('Comments subscription timed out'));
            } else if (status === 'CLOSED') {
              setIsSubscribed(false);
            }
          });
      } catch (err) {
        console.error('Error setting up comments subscription:', err);
        setError(err);
        setIsSubscribed(false);
      }
    };

    setupSubscription();

    // Cleanup subscription on unmount
    return () => {
      if (subscription) {
        console.log('Unsubscribing from comments channel');
        supabase.removeChannel(subscription);
        setIsSubscribed(false);
      }
    };
  }, [postId, enabled, onInsert, onUpdate, onDelete]);

  return {
    comments,
    commentCount,
    isSubscribed,
    error,
  };
};
