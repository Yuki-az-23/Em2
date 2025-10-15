-- EM2 Row Level Security Policies
-- Migration 002: Enable RLS and define access policies
-- Run this after migration 001

-- =============================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE braces ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecbridge_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- USERS TABLE POLICIES
-- =============================================

-- Allow users to read all profiles
CREATE POLICY "Users can view all profiles"
  ON users FOR SELECT
  USING (true);

-- Allow users to update only their own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Allow users to insert their own profile (during signup)
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Prevent users from deleting profiles (use soft delete via is_active)
-- No DELETE policy = no one can delete

-- =============================================
-- POSTS TABLE POLICIES
-- =============================================

-- Allow everyone to read non-deleted posts
CREATE POLICY "Anyone can view posts"
  ON posts FOR SELECT
  USING (deleted_at IS NULL);

-- Allow authenticated users to create posts
CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND auth.role() = 'authenticated'
  );

-- Allow users to update only their own posts
CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete (soft delete) only their own posts
CREATE POLICY "Users can delete own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND deleted_at IS NOT NULL
  );

-- =============================================
-- COMMENTS TABLE POLICIES
-- =============================================

-- Allow everyone to read non-deleted comments
CREATE POLICY "Anyone can view comments"
  ON comments FOR SELECT
  USING (deleted_at IS NULL);

-- Allow authenticated users to create comments
CREATE POLICY "Authenticated users can create comments"
  ON comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND auth.role() = 'authenticated'
  );

-- Allow users to update only their own comments
CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete (soft delete) only their own comments
CREATE POLICY "Users can delete own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND deleted_at IS NOT NULL
  );

-- =============================================
-- BRACES TABLE POLICIES
-- =============================================

-- Allow everyone to read braces
CREATE POLICY "Anyone can view braces"
  ON braces FOR SELECT
  USING (true);

-- Allow authenticated users to add braces
CREATE POLICY "Authenticated users can add braces"
  ON braces FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND auth.role() = 'authenticated'
  );

-- Allow users to remove only their own braces
CREATE POLICY "Users can remove own braces"
  ON braces FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- FOLLOWS TABLE POLICIES
-- =============================================

-- Allow everyone to read follows
CREATE POLICY "Anyone can view follows"
  ON follows FOR SELECT
  USING (true);

-- Allow authenticated users to follow others
CREATE POLICY "Authenticated users can follow"
  ON follows FOR INSERT
  WITH CHECK (
    auth.uid() = follower_id
    AND auth.role() = 'authenticated'
    AND follower_id != following_id -- Can't follow yourself
  );

-- Allow users to unfollow
CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE
  USING (auth.uid() = follower_id);

-- =============================================
-- ECBRIDGE LOGS POLICIES
-- =============================================

-- Only allow reading logs (for analytics)
CREATE POLICY "Authenticated users can view logs"
  ON ecbridge_logs FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only system/service can insert logs
CREATE POLICY "Service role can insert logs"
  ON ecbridge_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- HELPER FUNCTIONS FOR POLICIES
-- =============================================

-- Function: Check if user is post author
CREATE OR REPLACE FUNCTION is_post_author(post_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM posts
    WHERE id = post_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check if user is comment author
CREATE OR REPLACE FUNCTION is_comment_author(comment_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM comments
    WHERE id = comment_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check if user follows another user
CREATE OR REPLACE FUNCTION is_following(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM follows
    WHERE follower_id = auth.uid()
    AND following_id = target_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check if user has braced a post
CREATE OR REPLACE FUNCTION has_braced(post_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM braces
    WHERE post_id = post_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- REALTIME CONFIGURATION
-- =============================================

-- Enable realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE braces;
ALTER PUBLICATION supabase_realtime ADD TABLE follows;

-- =============================================
-- STORAGE POLICIES (for user uploads)
-- =============================================

-- Note: These are for Supabase Storage, not database tables
-- You'll need to create these buckets in Supabase Dashboard:
-- 1. avatars (for user profile pictures)
-- 2. post-images (for post images)

-- Create storage buckets (run in Supabase SQL Editor or Dashboard)
/*
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('post-images', 'post-images', true);

-- Avatar upload policy
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Avatar update policy
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Avatar read policy (public)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Post images upload policy
CREATE POLICY "Authenticated users can upload post images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'post-images'
  AND auth.role() = 'authenticated'
);

-- Post images read policy (public)
CREATE POLICY "Anyone can view post images"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-images');
*/

-- =============================================
-- SECURITY AUDIT
-- =============================================

-- View to check policy coverage
CREATE VIEW rls_policy_audit AS
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- =============================================
-- SUCCESS MESSAGE
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Row Level Security Policies Created Successfully!';
  RAISE NOTICE '🔒 All tables now have RLS enabled';
  RAISE NOTICE '👥 User policies: view all, update own';
  RAISE NOTICE '📝 Post policies: view all, CRUD own';
  RAISE NOTICE '💬 Comment policies: view all, CRUD own';
  RAISE NOTICE '❤️  Brace policies: view all, add/remove own';
  RAISE NOTICE '👥 Follow policies: view all, follow/unfollow';
  RAISE NOTICE '📊 ECBridge logs: read-only for users';
  RAISE NOTICE '⚡ Realtime enabled for posts, comments, braces, follows';
  RAISE NOTICE '🔒 Next Step: Run migration 003 for ECBridge database functions';
END $$;
