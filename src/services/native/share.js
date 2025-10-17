/**
 * Share Service
 *
 * Native share functionality using Capacitor Share plugin.
 * Supports sharing text, URLs, and files.
 */

import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

/**
 * Check if share is available on this platform
 */
export const isShareAvailable = async () => {
  try {
    const result = await Share.canShare();
    return result.value;
  } catch (error) {
    return false;
  }
};

/**
 * Share text content
 *
 * @param {Object} options - Share options
 * @param {string} options.title - Share title
 * @param {string} options.text - Share text
 * @param {string} options.url - Optional URL
 * @param {string} options.dialogTitle - Dialog title (Android only)
 * @returns {Promise<Object>} - { activityType }
 */
export const shareText = async ({ title, text, url, dialogTitle = 'Share via' }) => {
  try {
    const result = await Share.share({
      title,
      text,
      url,
      dialogTitle,
    });

    return {
      activityType: result.activityType,
    };
  } catch (error) {
    console.error('Error sharing text:', error);
    throw error;
  }
};

/**
 * Share a post
 *
 * @param {Object} post - Post object
 * @param {string} post.title - Post title
 * @param {string} post.emotion - Post emotion
 * @param {string} post.id - Post ID
 * @returns {Promise<Object>} - { activityType }
 */
export const sharePost = async (post) => {
  const url = `${window.location.origin}/post/${post.id}`;
  const text = `Check out this ${post.emotion} post: "${post.title}" on EM2!`;

  return shareText({
    title: post.title,
    text,
    url,
    dialogTitle: 'Share Post',
  });
};

/**
 * Share a profile
 *
 * @param {Object} user - User object
 * @param {string} user.name - User name
 * @param {string} user.emotion - User emotion
 * @param {string} user.id - User ID
 * @returns {Promise<Object>} - { activityType }
 */
export const shareProfile = async (user) => {
  const url = `${window.location.origin}/profile/${user.id}`;
  const text = `Check out ${user.name}'s profile on EM2! Currently feeling ${user.emotion}.`;

  return shareText({
    title: `${user.name} on EM2`,
    text,
    url,
    dialogTitle: 'Share Profile',
  });
};

/**
 * Share the app
 *
 * @returns {Promise<Object>} - { activityType }
 */
export const shareApp = async () => {
  const url = window.location.origin;
  const text = 'Check out EM2 - Express yourself through emotions and colors!';

  return shareText({
    title: 'EM2 - Emotion Manager',
    text,
    url,
    dialogTitle: 'Share EM2',
  });
};
