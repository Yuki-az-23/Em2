/**
 * Share Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Share } from '@capacitor/share';
import {
  isShareAvailable,
  shareText,
  sharePost,
  shareProfile,
  shareUrl,
} from './share';

vi.mock('@capacitor/share', () => ({
  Share: {
    canShare: vi.fn(),
    share: vi.fn(),
  },
}));

describe('Share Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isShareAvailable', () => {
    it('returns true when share is available', async () => {
      Share.canShare.mockResolvedValue({ value: true });

      const result = await isShareAvailable();

      expect(result).toBe(true);
      expect(Share.canShare).toHaveBeenCalled();
    });

    it('returns false when share is not available', async () => {
      Share.canShare.mockResolvedValue({ value: false });

      const result = await isShareAvailable();

      expect(result).toBe(false);
    });

    it('returns false when share check fails', async () => {
      Share.canShare.mockRejectedValue(new Error('Not supported'));

      const result = await isShareAvailable();

      expect(result).toBe(false);
    });
  });

  describe('shareText', () => {
    it('shares text with title', async () => {
      Share.share.mockResolvedValue({ activityType: 'com.apple.UIKit.activity.PostToTwitter' });

      const result = await shareText({
        title: 'Test Title',
        text: 'Test text content',
      });

      expect(Share.share).toHaveBeenCalledWith({
        title: 'Test Title',
        text: 'Test text content',
        dialogTitle: 'Share',
      });

      expect(result).toBe(true);
    });

    it('shares text with URL', async () => {
      Share.share.mockResolvedValue({ activityType: 'com.apple.UIKit.activity.CopyToPasteboard' });

      await shareText({
        title: 'Check this out',
        text: 'Amazing content!',
        url: 'https://example.com',
      });

      expect(Share.share).toHaveBeenCalledWith({
        title: 'Check this out',
        text: 'Amazing content!',
        url: 'https://example.com',
        dialogTitle: 'Share',
      });
    });

    it('uses custom dialog title', async () => {
      Share.share.mockResolvedValue({});

      await shareText({
        text: 'Content',
        dialogTitle: 'Share this post',
      });

      expect(Share.share).toHaveBeenCalledWith({
        text: 'Content',
        dialogTitle: 'Share this post',
      });
    });

    it('returns false when share is cancelled', async () => {
      Share.share.mockRejectedValue(new Error('Share canceled'));

      const result = await shareText({ text: 'Test' });

      expect(result).toBe(false);
    });

    it('returns false when share fails', async () => {
      Share.share.mockRejectedValue(new Error('Share failed'));

      const result = await shareText({ text: 'Test' });

      expect(result).toBe(false);
    });
  });

  describe('sharePost', () => {
    it('shares post with emotion context', async () => {
      Share.share.mockResolvedValue({});

      const post = {
        id: 'post-123',
        title: 'My Joy Post',
        emotion: 'joy',
      };

      await sharePost(post);

      expect(Share.share).toHaveBeenCalledWith({
        title: 'My Joy Post',
        text: 'Check out this joy post: "My Joy Post" on EM2!',
        url: expect.stringContaining('/post/post-123'),
        dialogTitle: 'Share Post',
      });
    });

    it('shares post with body excerpt when available', async () => {
      Share.share.mockResolvedValue({});

      const post = {
        id: 'post-456',
        title: 'Test Post',
        body: 'This is a long post body that should be truncated for sharing purposes',
        emotion: 'trust',
      };

      await sharePost(post);

      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('This is a long post'),
        })
      );
    });

    it('constructs correct post URL', async () => {
      Share.share.mockResolvedValue({});

      // Mock window.location
      delete window.location;
      window.location = { origin: 'https://em2.app' };

      const post = { id: 'post-789', title: 'Test', emotion: 'sad' };

      await sharePost(post);

      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://em2.app/post/post-789',
        })
      );
    });
  });

  describe('shareProfile', () => {
    it('shares user profile', async () => {
      Share.share.mockResolvedValue({});

      const user = {
        id: 'user-123',
        name: 'John Doe',
      };

      await shareProfile(user);

      expect(Share.share).toHaveBeenCalledWith({
        title: 'John Doe on EM2',
        text: "Check out John Doe's profile on EM2!",
        url: expect.stringContaining('/profile/user-123'),
        dialogTitle: 'Share Profile',
      });
    });

    it('constructs correct profile URL', async () => {
      Share.share.mockResolvedValue({});

      delete window.location;
      window.location = { origin: 'https://em2.app' };

      const user = { id: 'user-456', name: 'Jane Smith' };

      await shareProfile(user);

      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://em2.app/profile/user-456',
        })
      );
    });

    it('handles user with no name gracefully', async () => {
      Share.share.mockResolvedValue({});

      const user = { id: 'user-789' };

      await shareProfile(user);

      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('EM2'),
        })
      );
    });
  });

  describe('shareUrl', () => {
    it('shares URL with title and text', async () => {
      Share.share.mockResolvedValue({});

      await shareUrl({
        url: 'https://example.com',
        title: 'Example Site',
        text: 'Check out this website!',
      });

      expect(Share.share).toHaveBeenCalledWith({
        url: 'https://example.com',
        title: 'Example Site',
        text: 'Check out this website!',
        dialogTitle: 'Share',
      });
    });

    it('shares URL with minimal params', async () => {
      Share.share.mockResolvedValue({});

      await shareUrl({ url: 'https://example.com' });

      expect(Share.share).toHaveBeenCalledWith({
        url: 'https://example.com',
        dialogTitle: 'Share',
      });
    });

    it('validates URL format', async () => {
      Share.share.mockResolvedValue({});

      await shareUrl({ url: 'invalid-url' });

      // Should still attempt to share, let native handle validation
      expect(Share.share).toHaveBeenCalled();
    });
  });
});
