/**
 * Camera Service
 *
 * Native camera integration using Capacitor Camera plugin.
 * Supports photo capture, gallery selection, and image processing.
 */

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

/**
 * Check if camera is available on this platform
 */
export const isCameraAvailable = () => {
  return Capacitor.isNativePlatform();
};

/**
 * Take a photo using the device camera
 *
 * @param {Object} options - Camera options
 * @param {number} options.quality - Image quality (0-100, default: 80)
 * @param {number} options.width - Max width in pixels (default: 1024)
 * @param {number} options.height - Max height in pixels (default: 1024)
 * @param {boolean} options.allowEditing - Allow cropping/editing (default: true)
 * @returns {Promise<Object>} - { dataUrl, format, path }
 */
export const takePhoto = async ({
  quality = 80,
  width = 1024,
  height = 1024,
  allowEditing = true,
} = {}) => {
  try {
    // Check permissions first
    const permission = await Camera.checkPermissions();

    if (permission.camera === 'denied') {
      const request = await Camera.requestPermissions({
        permissions: ['camera'],
      });

      if (request.camera === 'denied') {
        throw new Error('Camera permission denied');
      }
    }

    // Take photo
    const photo = await Camera.getPhoto({
      quality,
      width,
      height,
      allowEditing,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      saveToGallery: false,
      correctOrientation: true,
    });

    return {
      dataUrl: photo.dataUrl,
      format: photo.format,
      path: photo.path,
    };
  } catch (error) {
    console.error('Error taking photo:', error);
    throw error;
  }
};

/**
 * Select a photo from the device gallery
 *
 * @param {Object} options - Gallery options
 * @param {number} options.quality - Image quality (0-100, default: 80)
 * @param {number} options.width - Max width in pixels (default: 1024)
 * @param {number} options.height - Max height in pixels (default: 1024)
 * @param {boolean} options.allowEditing - Allow cropping/editing (default: true)
 * @returns {Promise<Object>} - { dataUrl, format, path }
 */
export const selectPhoto = async ({
  quality = 80,
  width = 1024,
  height = 1024,
  allowEditing = true,
} = {}) => {
  try {
    // Check permissions first
    const permission = await Camera.checkPermissions();

    if (permission.photos === 'denied') {
      const request = await Camera.requestPermissions({
        permissions: ['photos'],
      });

      if (request.photos === 'denied') {
        throw new Error('Photo gallery permission denied');
      }
    }

    // Select photo
    const photo = await Camera.getPhoto({
      quality,
      width,
      height,
      allowEditing,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
      correctOrientation: true,
    });

    return {
      dataUrl: photo.dataUrl,
      format: photo.format,
      path: photo.path,
    };
  } catch (error) {
    console.error('Error selecting photo:', error);
    throw error;
  }
};

/**
 * Show photo source action sheet (Camera or Gallery)
 *
 * @param {Object} options - Photo options
 * @param {number} options.quality - Image quality (0-100, default: 80)
 * @param {number} options.width - Max width in pixels (default: 1024)
 * @param {number} options.height - Max height in pixels (default: 1024)
 * @param {boolean} options.allowEditing - Allow cropping/editing (default: true)
 * @returns {Promise<Object>} - { dataUrl, format, path }
 */
export const selectPhotoSource = async ({
  quality = 80,
  width = 1024,
  height = 1024,
  allowEditing = true,
} = {}) => {
  try {
    // Check permissions
    const permission = await Camera.checkPermissions();

    if (permission.camera === 'denied' || permission.photos === 'denied') {
      const request = await Camera.requestPermissions({
        permissions: ['camera', 'photos'],
      });

      if (request.camera === 'denied' && request.photos === 'denied') {
        throw new Error('Camera and photo gallery permissions denied');
      }
    }

    // Show prompt (native action sheet on mobile)
    const photo = await Camera.getPhoto({
      quality,
      width,
      height,
      allowEditing,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt, // Shows action sheet
      correctOrientation: true,
      promptLabelHeader: 'Select Photo Source',
      promptLabelCancel: 'Cancel',
      promptLabelPhoto: 'Choose from Gallery',
      promptLabelPicture: 'Take Photo',
    });

    return {
      dataUrl: photo.dataUrl,
      format: photo.format,
      path: photo.path,
    };
  } catch (error) {
    console.error('Error selecting photo source:', error);
    throw error;
  }
};

/**
 * Check camera permissions
 *
 * @returns {Promise<Object>} - { camera, photos }
 */
export const checkPermissions = async () => {
  try {
    const permission = await Camera.checkPermissions();
    return {
      camera: permission.camera,
      photos: permission.photos,
    };
  } catch (error) {
    console.error('Error checking permissions:', error);
    return {
      camera: 'prompt',
      photos: 'prompt',
    };
  }
};

/**
 * Request camera permissions
 *
 * @param {Array<string>} permissions - ['camera', 'photos']
 * @returns {Promise<Object>} - { camera, photos }
 */
export const requestPermissions = async (permissions = ['camera', 'photos']) => {
  try {
    const result = await Camera.requestPermissions({
      permissions,
    });
    return {
      camera: result.camera,
      photos: result.photos,
    };
  } catch (error) {
    console.error('Error requesting permissions:', error);
    throw error;
  }
};

/**
 * Convert data URL to Blob
 *
 * @param {string} dataUrl - Data URL string
 * @returns {Blob} - Blob object
 */
export const dataUrlToBlob = (dataUrl) => {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
};

/**
 * Convert data URL to File
 *
 * @param {string} dataUrl - Data URL string
 * @param {string} filename - File name (default: 'photo.jpg')
 * @returns {File} - File object
 */
export const dataUrlToFile = (dataUrl, filename = 'photo.jpg') => {
  const blob = dataUrlToBlob(dataUrl);
  return new File([blob], filename, { type: blob.type });
};

/**
 * Resize image data URL
 *
 * @param {string} dataUrl - Data URL string
 * @param {number} maxWidth - Max width in pixels
 * @param {number} maxHeight - Max height in pixels
 * @param {number} quality - Image quality (0-1, default: 0.8)
 * @returns {Promise<string>} - Resized data URL
 */
export const resizeImage = (dataUrl, maxWidth, maxHeight, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = reject;
    img.src = dataUrl;
  });
};
