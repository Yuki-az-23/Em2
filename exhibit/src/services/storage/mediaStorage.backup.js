/**
 * Media Storage Service
 * Handles image and video uploads to Supabase Storage for EditorJS
 * Based on the working avatar upload pattern
 */

import { supabase } from '../supabase/client';

/**
 * Upload an image to Supabase Storage (post-images bucket)
 * @param {File} file - Image file to upload
 * @param {string} userId - User ID for organizing files
 * @returns {Promise<{success: number, file: {url: string}, error?: string}>}
 */
export const uploadPostImage = async (file, userId) => {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image');
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('Image size must be less than 5MB');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `post-images/${fileName}`;

    // Upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(filePath);

    return {
      success: 1,
      file: {
        url: publicUrl,
      }
    };

  } catch (error) {
    console.error('Upload post image error:', error);
    return {
      success: 0,
      error: error.message || 'Failed to upload image'
    };
  }
};

/**
 * Upload a video to Supabase Storage (post-videos bucket)
 * @param {File} file - Video file to upload
 * @param {string} userId - User ID for organizing files
 * @returns {Promise<{success: number, file: {url: string}, error?: string}>}
 */
export const uploadPostVideo = async (file, userId) => {
  try {
    // Validate file type
    if (!file.type.startsWith('video/')) {
      throw new Error('File must be a video');
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('Video size must be less than 50MB');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `post-videos/${fileName}`;

    // Upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('post-videos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('post-videos')
      .getPublicUrl(filePath);

    return {
      success: 1,
      file: {
        url: publicUrl,
      }
    };

  } catch (error) {
    console.error('Upload post video error:', error);
    return {
      success: 0,
      error: error.message || 'Failed to upload video'
    };
  }
};

/**
 * Delete an image from Supabase Storage
 * @param {string} url - Public URL of the image
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const deletePostImage = async (url) => {
  try {
    // Extract file path from public URL
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/post-images/');
    if (pathParts.length < 2) {
      throw new Error('Invalid image URL');
    }
    const filePath = `post-images/${pathParts[1]}`;

    const { error } = await supabase.storage
      .from('post-images')
      .remove([filePath]);

    if (error) throw error;

    return { success: true };

  } catch (error) {
    console.error('Delete post image error:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete image'
    };
  }
};

/**
 * Delete a video from Supabase Storage
 * @param {string} url - Public URL of the video
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const deletePostVideo = async (url) => {
  try {
    // Extract file path from public URL
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/post-videos/');
    if (pathParts.length < 2) {
      throw new Error('Invalid video URL');
    }
    const filePath = `post-videos/${pathParts[1]}`;

    const { error } = await supabase.storage
      .from('post-videos')
      .remove([filePath]);

    if (error) throw error;

    return { success: true };

  } catch (error) {
    console.error('Delete post video error:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete video'
    };
  }
};

/**
 * Validate image URL (for uploadByUrl)
 * @param {string} url - Image URL to validate
 * @returns {Promise<{success: number, file: {url: string}, error?: string}>}
 */
export const validateImageUrl = async (url) => {
  try {
    // Validate URL format
    new URL(url);

    // Check if it's an image URL (basic check)
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const urlLower = url.toLowerCase();
    const hasImageExt = imageExtensions.some(ext => urlLower.includes(ext));

    if (!hasImageExt && !url.includes('unsplash') && !url.includes('imgur')) {
      // Try to fetch headers to check content-type
      const response = await fetch(url, { method: 'HEAD' });
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error('URL does not point to an image');
      }
    }

    return {
      success: 1,
      file: {
        url: url,
      }
    };
  } catch (error) {
    console.error('Invalid image URL:', error);
    return {
      success: 0,
      error: error.message || 'Invalid URL format',
    };
  }
};
