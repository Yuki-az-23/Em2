-- =====================================================
-- Migration 005: Create Storage Buckets for Post Media
-- =====================================================
-- Creates Supabase Storage buckets for post images and videos
-- Includes public access policies for uploaded media
-- Date: 2025-11-04

-- =====================================================
-- 1. CREATE STORAGE BUCKETS
-- =====================================================

-- Post Images Bucket
-- For images uploaded via EditorJS in posts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-images',
  'post-images',
  true, -- Public access for viewing
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Post Videos Bucket
-- For videos uploaded via EditorJS in posts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-videos',
  'post-videos',
  true, -- Public access for viewing
  52428800, -- 50MB limit
  ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 2. STORAGE POLICIES FOR POST-IMAGES
-- =====================================================

-- Allow authenticated users to upload images
CREATE POLICY "Users can upload post images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'post-images' AND
  (storage.foldername(name))[1] = auth.uid()::text -- User can only upload to their own folder
);

-- Allow public read access to all post images
CREATE POLICY "Public read access to post images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'post-images');

-- Allow users to update their own images
CREATE POLICY "Users can update their own post images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'post-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own images
CREATE POLICY "Users can delete their own post images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'post-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- =====================================================
-- 3. STORAGE POLICIES FOR POST-VIDEOS
-- =====================================================

-- Allow authenticated users to upload videos
CREATE POLICY "Users can upload post videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'post-videos' AND
  (storage.foldername(name))[1] = auth.uid()::text -- User can only upload to their own folder
);

-- Allow public read access to all post videos
CREATE POLICY "Public read access to post videos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'post-videos');

-- Allow users to update their own videos
CREATE POLICY "Users can update their own post videos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'post-videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own videos
CREATE POLICY "Users can delete their own post videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'post-videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- =====================================================
-- 4. VERIFICATION
-- =====================================================

-- Verify buckets were created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'post-images') THEN
    RAISE NOTICE '✅ post-images bucket created successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to create post-images bucket';
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'post-videos') THEN
    RAISE NOTICE '✅ post-videos bucket created successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to create post-videos bucket';
  END IF;
END $$;

-- =====================================================
-- NOTES
-- =====================================================
--
-- Storage Structure:
-- post-images/
--   └── {user_id}/
--       └── {timestamp}-{random}.{ext}
--
-- post-videos/
--   └── {user_id}/
--       └── {timestamp}-{random}.{ext}
--
-- File Size Limits:
-- - Images: 5MB
-- - Videos: 50MB
--
-- Allowed Formats:
-- - Images: JPEG, PNG, GIF, WebP, SVG
-- - Videos: MP4, WebM, OGG, QuickTime
--
-- Security:
-- - Users can only upload to folders matching their user ID
-- - All uploads require authentication
-- - Public read access for viewing media in posts
-- - Users can update/delete only their own media
--
-- =====================================================
