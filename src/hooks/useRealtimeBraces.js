/**
 * useRealtimeBraces Hook
 *
 * Real-time subscription for brace (like) updates using Supabase Realtime.
 * Listens for INSERT and DELETE events on the braces table for a specific post.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase/client';

/**
 * Hook to subscribe to real-time brace updates for a post
 *
 * @param {Object} options - Configuration options
 * @param {string} options.postId - Post ID to subscribe to
 * @param {number} options.initialCount - Initial brace count
 * @param {boolean} options.initialIsBraced - Whether user has braced
 * @param {string} options.userId - Current user ID
 * @param {boolean} options.enabled - Whether to enable real-time (default: true)
 * @param {Function} options.onBrace - Callback when brace is added
 * @param {Function} options.onUnbrace - Callback when brace is removed
 * @returns {Object} - { braceCount, isBraced, isSubscribed, error }
 */
export const useRealtimeBraces = ({
  postId,
  initialCount = 0,
  initialIsBraced = false,
  userId,
  enabled = true,
  onBrace,
  onUnbrace,
} = {}) => {
  const [braceCount, setBraceCount] = useState(initialCount);
  const [isBraced, setIsBraced] = useState(initialIsBraced);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Update when initial values change
    setBraceCount(initialCount);
    setIsBraced(initialIsBraced);
  }, [initialCount, initialIsBraced]);

  useEffect(() => {
    if (!enabled || !postId) {
      return;
    }

    let subscription = null;

    const setupSubscription = async () => {
      try {
        // Subscribe to braces table changes for this post
        subscription = supabase
          .channel(`braces-${postId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'braces',
              filter: `post_id=eq.${postId}`,
            },
            (payload) => {
              console.log('Brace added:', payload);

              const newBrace = payload.new;

              // Increment count
              setBraceCount((prevCount) => prevCount + 1);

              // Update isBraced if it's from current user
              if (userId && newBrace.user_id === userId) {
                setIsBraced(true);
              }

              // Call callback
              if (onBrace) {
                onBrace(newBrace);
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'braces',
              filter: `post_id=eq.${postId}`,
            },
            (payload) => {
              console.log('Brace removed:', payload);

              const deletedBrace = payload.old;

              // Decrement count (don't go below 0)
              setBraceCount((prevCount) => Math.max(0, prevCount - 1));

              // Update isBraced if it's from current user
              if (userId && deletedBrace.user_id === userId) {
                setIsBraced(false);
              }

              // Call callback
              if (onUnbrace) {
                onUnbrace(deletedBrace);
              }
            }
          )
          .subscribe((status) => {
            console.log('Braces subscription status:', status);

            if (status === 'SUBSCRIBED') {
              setIsSubscribed(true);
              setError(null);
            } else if (status === 'CHANNEL_ERROR') {
              setIsSubscribed(false);
              setError(new Error('Failed to subscribe to braces channel'));
            } else if (status === 'TIMED_OUT') {
              setIsSubscribed(false);
              setError(new Error('Braces subscription timed out'));
            } else if (status === 'CLOSED') {
              setIsSubscribed(false);
            }
          });
      } catch (err) {
        console.error('Error setting up braces subscription:', err);
        setError(err);
        setIsSubscribed(false);
      }
    };

    setupSubscription();

    // Cleanup subscription on unmount
    return () => {
      if (subscription) {
        console.log('Unsubscribing from braces channel');
        supabase.removeChannel(subscription);
        setIsSubscribed(false);
      }
    };
  }, [postId, userId, enabled, onBrace, onUnbrace]);

  return {
    braceCount,
    isBraced,
    isSubscribed,
    error,
  };
};
