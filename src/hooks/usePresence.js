/**
 * usePresence Hook
 *
 * Real-time presence system using Supabase Realtime.
 * Tracks online users and their activity status.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase/client';

/**
 * Hook to manage user presence and track online users
 *
 * @param {Object} options - Configuration options
 * @param {string} options.userId - Current user ID
 * @param {string} options.userName - Current user name
 * @param {Object} options.metadata - Additional user metadata (emotion, color, photo)
 * @param {boolean} options.enabled - Whether to enable presence (default: true)
 * @param {Function} options.onJoin - Callback when user joins
 * @param {Function} options.onLeave - Callback when user leaves
 * @returns {Object} - { onlineUsers, isOnline, isSubscribed, error }
 */
export const usePresence = ({
  userId,
  userName,
  metadata = {},
  enabled = true,
  onJoin,
  onLeave,
} = {}) => {
  const [onlineUsers, setOnlineUsers] = useState({});
  const [isOnline, setIsOnline] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !userId || !userName) {
      return;
    }

    let channel = null;

    const setupPresence = async () => {
      try {
        // Create presence channel
        channel = supabase.channel('online-users', {
          config: {
            presence: {
              key: userId,
            },
          },
        });

        // Track presence state
        channel
          .on('presence', { event: 'sync' }, () => {
            console.log('Presence sync');

            // Get all online users
            const presenceState = channel.presenceState();
            console.log('Current presence state:', presenceState);

            // Convert to friendly format
            const users = {};
            Object.keys(presenceState).forEach((presenceKey) => {
              const presences = presenceState[presenceKey];
              presences.forEach((presence) => {
                users[presence.user_id] = {
                  id: presence.user_id,
                  name: presence.user_name,
                  emotion: presence.emotion,
                  color: presence.color,
                  photo: presence.photo,
                  joinedAt: presence.joined_at,
                };
              });
            });

            setOnlineUsers(users);
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('User joined:', newPresences);

            newPresences.forEach((presence) => {
              setOnlineUsers((prev) => ({
                ...prev,
                [presence.user_id]: {
                  id: presence.user_id,
                  name: presence.user_name,
                  emotion: presence.emotion,
                  color: presence.color,
                  photo: presence.photo,
                  joinedAt: presence.joined_at,
                },
              }));

              // Call callback
              if (onJoin) {
                onJoin(presence);
              }
            });
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('User left:', leftPresences);

            leftPresences.forEach((presence) => {
              setOnlineUsers((prev) => {
                const newUsers = { ...prev };
                delete newUsers[presence.user_id];
                return newUsers;
              });

              // Call callback
              if (onLeave) {
                onLeave(presence);
              }
            });
          })
          .subscribe(async (status) => {
            console.log('Presence subscription status:', status);

            if (status === 'SUBSCRIBED') {
              setIsSubscribed(true);
              setError(null);

              // Track current user's presence
              const presenceStatus = await channel.track({
                user_id: userId,
                user_name: userName,
                emotion: metadata.emotion || null,
                color: metadata.color || null,
                photo: metadata.photo || null,
                joined_at: new Date().toISOString(),
              });

              console.log('Presence tracking status:', presenceStatus);

              if (presenceStatus === 'ok') {
                setIsOnline(true);
              }
            } else if (status === 'CHANNEL_ERROR') {
              setIsSubscribed(false);
              setIsOnline(false);
              setError(new Error('Failed to subscribe to presence channel'));
            } else if (status === 'TIMED_OUT') {
              setIsSubscribed(false);
              setIsOnline(false);
              setError(new Error('Presence subscription timed out'));
            } else if (status === 'CLOSED') {
              setIsSubscribed(false);
              setIsOnline(false);
            }
          });
      } catch (err) {
        console.error('Error setting up presence:', err);
        setError(err);
        setIsSubscribed(false);
        setIsOnline(false);
      }
    };

    setupPresence();

    // Cleanup on unmount
    return () => {
      if (channel) {
        console.log('Unsubscribing from presence channel');
        channel.untrack();
        supabase.removeChannel(channel);
        setIsSubscribed(false);
        setIsOnline(false);
      }
    };
  }, [userId, userName, metadata.emotion, metadata.color, metadata.photo, enabled, onJoin, onLeave]);

  // Helper to check if specific user is online
  const isUserOnline = (checkUserId) => {
    return !!onlineUsers[checkUserId];
  };

  // Helper to get online count
  const onlineCount = Object.keys(onlineUsers).length;

  return {
    onlineUsers,
    onlineCount,
    isOnline,
    isSubscribed,
    isUserOnline,
    error,
  };
};
