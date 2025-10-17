/**
 * Camera Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  isCameraAvailable,
  takePhoto,
  selectFromGallery,
  selectPhotoSource,
  dataUrlToBlob,
  dataUrlToFile,
} from './camera';

vi.mock('@capacitor/camera', () => ({
  Camera: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    getPhoto: vi.fn(),
  },
  CameraResultType: {
    DataUrl: 'dataUrl',
    Uri: 'uri',
    Base64: 'base64',
  },
  CameraSource: {
    Camera: 'camera',
    Photos: 'photos',
    Prompt: 'prompt',
  },
}));

describe('Camera Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isCameraAvailable', () => {
    it('returns true on native platforms', () => {
      vi.mock('@capacitor/core', () => ({
        Capacitor: {
          isNativePlatform: vi.fn(() => true),
        },
      }));

      expect(isCameraAvailable()).toBe(true);
    });

    it('returns false on web platform', () => {
      expect(isCameraAvailable()).toBe(false);
    });
  });

  describe('takePhoto', () => {
    it('requests camera permission if denied', async () => {
      Camera.checkPermissions.mockResolvedValue({ camera: 'denied' });
      Camera.requestPermissions.mockResolvedValue({ camera: 'granted' });
      Camera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,ABC123',
        format: 'jpeg',
        path: '/path/to/photo.jpg',
      });

      await takePhoto();

      expect(Camera.checkPermissions).toHaveBeenCalled();
      expect(Camera.requestPermissions).toHaveBeenCalledWith({
        permissions: ['camera'],
      });
      expect(Camera.getPhoto).toHaveBeenCalled();
    });

    it('throws error if permission permanently denied', async () => {
      Camera.checkPermissions.mockResolvedValue({ camera: 'denied' });
      Camera.requestPermissions.mockResolvedValue({ camera: 'denied' });

      await expect(takePhoto()).rejects.toThrow('Camera permission denied');
    });

    it('takes photo with default options', async () => {
      Camera.checkPermissions.mockResolvedValue({ camera: 'granted' });
      Camera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,ABC123',
        format: 'jpeg',
        path: '/path/to/photo.jpg',
      });

      const result = await takePhoto();

      expect(Camera.getPhoto).toHaveBeenCalledWith({
        quality: 80,
        width: 1024,
        height: 1024,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
        correctOrientation: true,
      });

      expect(result).toEqual({
        dataUrl: 'data:image/jpeg;base64,ABC123',
        format: 'jpeg',
        path: '/path/to/photo.jpg',
      });
    });

    it('takes photo with custom options', async () => {
      Camera.checkPermissions.mockResolvedValue({ camera: 'granted' });
      Camera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/png;base64,XYZ789',
        format: 'png',
      });

      await takePhoto({
        quality: 90,
        width: 2048,
        height: 2048,
        allowEditing: false,
      });

      expect(Camera.getPhoto).toHaveBeenCalledWith({
        quality: 90,
        width: 2048,
        height: 2048,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
        correctOrientation: true,
      });
    });
  });

  describe('selectFromGallery', () => {
    it('selects photo from gallery', async () => {
      Camera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,GALLERY123',
        format: 'jpeg',
        path: '/gallery/photo.jpg',
      });

      const result = await selectFromGallery();

      expect(Camera.getPhoto).toHaveBeenCalledWith({
        quality: 80,
        width: 1024,
        height: 1024,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
        saveToGallery: false,
        correctOrientation: true,
      });

      expect(result).toEqual({
        dataUrl: 'data:image/jpeg;base64,GALLERY123',
        format: 'jpeg',
        path: '/gallery/photo.jpg',
      });
    });

    it('applies custom options when selecting from gallery', async () => {
      Camera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/png;base64,CUSTOM',
        format: 'png',
      });

      await selectFromGallery({ quality: 100, allowEditing: false });

      expect(Camera.getPhoto).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: 100,
          allowEditing: false,
          source: CameraSource.Photos,
        })
      );
    });
  });

  describe('selectPhotoSource', () => {
    it('shows action sheet to select photo source', async () => {
      Camera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,PROMPT123',
        format: 'jpeg',
      });

      const result = await selectPhotoSource();

      expect(Camera.getPhoto).toHaveBeenCalledWith({
        quality: 80,
        width: 1024,
        height: 1024,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        saveToGallery: false,
        correctOrientation: true,
        promptLabelHeader: 'Select Photo Source',
        promptLabelCancel: 'Cancel',
        promptLabelPhoto: 'From Gallery',
        promptLabelPicture: 'Take Photo',
      });

      expect(result).toEqual({
        dataUrl: 'data:image/jpeg;base64,PROMPT123',
        format: 'jpeg',
      });
    });

    it('accepts custom prompt labels', async () => {
      Camera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,CUSTOM',
        format: 'jpeg',
      });

      await selectPhotoSource({
        promptLabelHeader: 'Choose Source',
        promptLabelPhoto: 'Gallery',
        promptLabelPicture: 'Camera',
      });

      expect(Camera.getPhoto).toHaveBeenCalledWith(
        expect.objectContaining({
          promptLabelHeader: 'Choose Source',
          promptLabelPhoto: 'Gallery',
          promptLabelPicture: 'Camera',
        })
      );
    });
  });

  describe('dataUrlToBlob', () => {
    it('converts data URL to Blob', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      const blob = dataUrlToBlob(dataUrl);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/jpeg');
    });

    it('handles PNG data URLs', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGg==';
      const blob = dataUrlToBlob(dataUrl);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
    });

    it('throws error for invalid data URL', () => {
      expect(() => dataUrlToBlob('invalid-url')).toThrow();
    });
  });

  describe('dataUrlToFile', () => {
    it('converts data URL to File with default filename', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      const file = dataUrlToFile(dataUrl);

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('photo.jpg');
      expect(file.type).toBe('image/jpeg');
    });

    it('converts data URL to File with custom filename', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGg==';
      const file = dataUrlToFile(dataUrl, 'custom-image.png');

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('custom-image.png');
      expect(file.type).toBe('image/png');
    });
  });
});
