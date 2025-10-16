/**
 * useRealtimeFollows Hook
 *
 * Real-time subscription for follow updates using Supabase Realtime.
 * Listens for INSERT and DELETE events on the follows table for a specific user.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase/client';

/**
 * Hook to subscribe to real-time follow updates for a user
 *
 * @param {Object} options - Configuration options
 * @param {string} options.userId - User ID to subscribe to
 * @param {number} options.initialFollowersCount - Initial followers count
 * @param {number} options.initialFollowingCount - Initial following count
 * @param {boolean} options.initialIsFollowing - Whether current user is following
 * @param {string} options.currentUserId - Current logged-in user ID
 * @param {boolean} options.enabled - Whether to enable real-time (default: true)
 * @param {Function} options.onFollow - Callback when follow is added
 * @param {Function} options.onUnfollow - Callback when follow is removed
 * @returns {Object} - { followersCount, followingCount, isFollowing, isSubscribed, error }
 */
export const useRealtimeFollows = ({
  userId,
  initialFollowersCount = 0,
  initialFollowingCount = 0,
  initialIsFollowing = false,
  currentUserId,
  enabled = true,
  onFollow,
  onUnfollow,
} = {}) => {
  const [followersCount, setFollowersCount] = useState(initialFollowersCount);
  const [followingCount, setFollowingCount] = useState(initialFollowingCount);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Update when initial values change
    setFollowersCount(initialFollowersCount);
    setFollowingCount(initialFollowingCount);
    setIsFollowing(initialIsFollowing);
  }, [initialFollowersCount, initialFollowingCount, initialIsFollowing]);

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }

    let followersSubscription = null;
    let followingSubscription = null;

    const setupSubscriptions = async () => {
      try {
        // Subscribe to followers (users following this user)
        followersSubscription = supabase
          .channel(`followers-${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'follows',
              filter: `following_id=eq.${userId}`,
            },
            (payload) => {
              console.log('New follower:', payload);

              const newFollow = payload.new;

              // Increment followers count
              setFollowersCount((prevCount) => prevCount + 1);

              // Update isFollowing if current user started following
              if (currentUserId && newFollow.follower_id === currentUserId) {
                setIsFollowing(true);
              }

              // Call callback
              if (onFollow) {
                onFollow(newFollow);
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'follows',
              filter: `following_id=eq.${userId}`,
            },
            (payload) => {
              console.log('Follower removed:', payload);

              const deletedFollow = payload.old;

              // Decrement followers count (don't go below 0)
              setFollowersCount((prevCount) => Math.max(0, prevCount - 1));

              // Update isFollowing if current user unfollowed
              if (currentUserId && deletedFollow.follower_id === currentUserId) {
                setIsFollowing(false);
              }

              // Call callback
              if (onUnfollow) {
                onUnfollow(deletedFollow);
              }
            }
          )
          .subscribe((status) => {
            console.log('Followers subscription status:', status);

            if (status === 'SUBSCRIBED') {
              setIsSubscribed(true);
              setError(null);
            } else if (status === 'CHANNEL_ERROR') {
              setIsSubscribed(false);
              setError(new Error('Failed to subscribe to followers channel'));
            } else if (status === 'TIMED_OUT') {
              setIsSubscribed(false);
              setError(new Error('Followers subscription timed out'));
            } else if (status === 'CLOSED') {
              setIsSubscribed(false);
            }
          });

        // Subscribe to following (users this user is following)
        followingSubscription = supabase
          .channel(`following-${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'follows',
              filter: `follower_id=eq.${userId}`,
            },
            (payload) => {
              console.log('New following:', payload);

              // Increment following count
              setFollowingCount((prevCount) => prevCount + 1);
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'follows',
              filter: `follower_id=eq.${userId}`,
            },
            (payload) => {
              console.log('Following removed:', payload);

              // Decrement following count (don't go below 0)
              setFollowingCount((prevCount) => Math.max(0, prevCount - 1));
            }
          )
          .subscribe((status) => {
            console.log('Following subscription status:', status);
          });
      } catch (err) {
        console.error('Error setting up follows subscriptions:', err);
        setError(err);
        setIsSubscribed(false);
      }
    };

    setupSubscriptions();

    // Cleanup subscriptions on unmount
    return () => {
      if (followersSubscription) {
        console.log('Unsubscribing from followers channel');
        supabase.removeChannel(followersSubscription);
      }
      if (followingSubscription) {
        console.log('Unsubscribing from following channel');
        supabase.removeChannel(followingSubscription);
      }
      setIsSubscribed(false);
    };
  }, [userId, currentUserId, enabled, onFollow, onUnfollow]);

  return {
    followersCount,
    followingCount,
    isFollowing,
    isSubscribed,
    error,
  };
};
