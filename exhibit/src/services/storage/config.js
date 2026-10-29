/**
 * Storage Configuration
 * Central configuration for media uploads (images, videos)
 */

export const STORAGE_CONFIG = {
  IMAGE: {
    MAX_SIZE: 5 * 1024 * 1024,      // 5MB in bytes
    MAX_SIZE_MB: 5,
    ALLOWED_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    MIME_PREFIX: 'image/',
    BUCKET: 'post-images',
    CACHE_CONTROL: '3600',           // 1 hour cache
  },
  VIDEO: {
    MAX_SIZE: 50 * 1024 * 1024,     // 50MB in bytes
    MAX_SIZE_MB: 50,
    ALLOWED_TYPES: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
    MIME_PREFIX: 'video/',
    BUCKET: 'post-videos',
    CACHE_CONTROL: '3600',           // 1 hour cache
  },
  FILENAME: {
    RANDOM_LENGTH: 7,
    SEPARATOR: '-',
  },
  URL_VALIDATION: {
    TIMEOUT: 5000,                   // 5 seconds
    WHITELISTED_DOMAINS: [
      'unsplash.com',
      'images.unsplash.com',
      'imgur.com',
      'i.imgur.com',
      'cloudinary.com',
    ],
  },
};

/**
 * MIME type to file extension mapping
 */
export const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogg',
  'video/quicktime': 'mov',
};

/**
 * Error messages with interpolation support
 */
export const ERROR_MESSAGES = {
  // Authentication
  NOT_AUTHENTICATED: 'You must be logged in to upload files',

  // Type validation
  INVALID_IMAGE_TYPE: 'File must be an image (JPEG, PNG, GIF, WebP, or SVG)',
  INVALID_VIDEO_TYPE: 'File must be a video (MP4, WebM, OGG, or QuickTime)',
  INVALID_MEDIA_TYPE: 'Invalid file type',

  // Size validation
  IMAGE_TOO_LARGE: `Image size must be less than ${STORAGE_CONFIG.IMAGE.MAX_SIZE_MB}MB`,
  VIDEO_TOO_LARGE: `Video size must be less than ${STORAGE_CONFIG.VIDEO.MAX_SIZE_MB}MB`,
  FILE_TOO_LARGE: 'File is too large',

  // Upload
  UPLOAD_FAILED: 'Upload failed. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',

  // URL validation
  INVALID_URL: 'Invalid URL format',
  URL_NOT_IMAGE: 'URL does not point to an image',
  URL_TIMEOUT: 'URL validation timed out',

  // Delete
  DELETE_FAILED: 'Failed to delete file',
  INVALID_DELETE_URL: 'Invalid file URL',
};

/**
 * Error codes for programmatic error handling
 */
export const ERROR_CODES = {
  NOT_AUTHENTICATED: 'AUTH_REQUIRED',
  INVALID_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_SIZE_EXCEEDED',
  UPLOAD_ERROR: 'UPLOAD_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_URL: 'INVALID_URL',
  DELETE_ERROR: 'DELETE_FAILED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
};
