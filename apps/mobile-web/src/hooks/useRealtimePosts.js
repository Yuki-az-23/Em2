/**
 * useRealtimePosts Hook
 *
 * Real-time subscription for post updates using Supabase Realtime.
 * Listens for INSERT, UPDATE, and DELETE events on the posts table
 * and updates the local state accordingly.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase/client';

/**
 * Hook to subscribe to real-time post updates
 *
 * @param {Object} options - Configuration options
 * @param {Array} options.initialPosts - Initial posts array
 * @param {boolean} options.enabled - Whether to enable real-time (default: true)
 * @param {Function} options.onInsert - Callback when post is inserted
 * @param {Function} options.onUpdate - Callback when post is updated
 * @param {Function} options.onDelete - Callback when post is deleted
 * @returns {Object} - { posts, isSubscribed, error }
 */
export const useRealtimePosts = ({
  initialPosts = [],
  enabled = true,
  onInsert,
  onUpdate,
  onDelete,
} = {}) => {
  const [posts, setPosts] = useState(initialPosts);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Update posts when initialPosts changes
    setPosts(initialPosts);
  }, [initialPosts]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let subscription = null;

    const setupSubscription = async () => {
      try {
        // Subscribe to posts table changes
        subscription = supabase
          .channel('posts-channel')
          .on(
            'postgres_changes',
            {
              event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
              schema: 'public',
              table: 'posts',
            },
            async (payload) => {
              console.log('Post change received:', payload);

              // Handle INSERT
              if (payload.eventType === 'INSERT') {
                const newPost = payload.new;

                // Fetch full post with author info and stats
                const { data: fullPost, error: fetchError } = await supabase
                  .from('posts_with_stats')
                  .select('*')
                  .eq('id', newPost.id)
                  .single();

                if (fetchError) {
                  console.error('Error fetching new post:', fetchError);
                  return;
                }

                // Add to beginning of posts array
                setPosts((prevPosts) => [fullPost, ...prevPosts]);

                // Call callback
                if (onInsert) {
                  onInsert(fullPost);
                }
              }

              // Handle UPDATE
              if (payload.eventType === 'UPDATE') {
                const updatedPost = payload.new;

                // Fetch full post with latest stats
                const { data: fullPost, error: fetchError } = await supabase
                  .from('posts_with_stats')
                  .select('*')
                  .eq('id', updatedPost.id)
                  .single();

                if (fetchError) {
                  console.error('Error fetching updated post:', fetchError);
                  return;
                }

                // Update in posts array
                setPosts((prevPosts) =>
                  prevPosts.map((post) =>
                    post.id === fullPost.id ? fullPost : post
                  )
                );

                // Call callback
                if (onUpdate) {
                  onUpdate(fullPost);
                }
              }

              // Handle DELETE
              if (payload.eventType === 'DELETE') {
                const deletedPost = payload.old;

                // Remove from posts array
                setPosts((prevPosts) =>
                  prevPosts.filter((post) => post.id !== deletedPost.id)
                );

                // Call callback
                if (onDelete) {
                  onDelete(deletedPost);
                }
              }
            }
          )
          .subscribe((status) => {
            console.log('Posts subscription status:', status);

            if (status === 'SUBSCRIBED') {
              setIsSubscribed(true);
              setError(null);
            } else if (status === 'CHANNEL_ERROR') {
              setIsSubscribed(false);
              setError(new Error('Failed to subscribe to posts channel'));
            } else if (status === 'TIMED_OUT') {
              setIsSubscribed(false);
              setError(new Error('Posts subscription timed out'));
            } else if (status === 'CLOSED') {
              setIsSubscribed(false);
            }
          });
      } catch (err) {
        console.error('Error setting up posts subscription:', err);
        setError(err);
        setIsSubscribed(false);
      }
    };

    setupSubscription();

    // Cleanup subscription on unmount
    return () => {
      if (subscription) {
        console.log('Unsubscribing from posts channel');
        supabase.removeChannel(subscription);
        setIsSubscribed(false);
      }
    };
  }, [enabled, onInsert, onUpdate, onDelete]);

  return {
    posts,
    isSubscribed,
    error,
  };
};
