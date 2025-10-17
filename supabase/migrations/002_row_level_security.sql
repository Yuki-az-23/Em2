-- EM2 Row Level Security Policies
-- Ensures users can only access/modify their own data

-- =====================================================
-- ENABLE RLS
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE braces ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecbridge_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USERS POLICIES
-- =====================================================

-- Anyone can view user profiles
CREATE POLICY "Users are viewable by everyone"
  ON users FOR SELECT
  USING (true);

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can delete their own profile
CREATE POLICY "Users can delete their own profile"
  ON users FOR DELETE
  USING (auth.uid() = id);

-- =====================================================
-- POSTS POLICIES
-- =====================================================

-- Anyone can view posts
CREATE POLICY "Posts are viewable by everyone"
  ON posts FOR SELECT
  USING (true);

-- Authenticated users can create posts
CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Authors can update their own posts
CREATE POLICY "Authors can update their own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Authors can delete their own posts
CREATE POLICY "Authors can delete their own posts"
  ON posts FOR DELETE
  USING (auth.uid() = author_id);

-- =====================================================
-- COMMENTS POLICIES
-- =====================================================

-- Anyone can view comments
CREATE POLICY "Comments are viewable by everyone"
  ON comments FOR SELECT
  USING (true);

-- Authenticated users can create comments
CREATE POLICY "Authenticated users can create comments"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Authors can delete their own comments
CREATE POLICY "Authors can delete their own comments"
  ON comments FOR DELETE
  USING (auth.uid() = author_id);

-- =====================================================
-- BRACES POLICIES
-- =====================================================

-- Anyone can view braces
CREATE POLICY "Braces are viewable by everyone"
  ON braces FOR SELECT
  USING (true);

-- Authenticated users can brace posts
CREATE POLICY "Authenticated users can brace posts"
  ON braces FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can unbrace their own braces
CREATE POLICY "Users can unbrace their own braces"
  ON braces FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- FOLLOWS POLICIES
-- =====================================================

-- Anyone can view follows
CREATE POLICY "Follows are viewable by everyone"
  ON follows FOR SELECT
  USING (true);

-- Authenticated users can follow others
CREATE POLICY "Authenticated users can follow others"
  ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- Users can unfollow
CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE
  USING (auth.uid() = follower_id);

-- =====================================================
-- ECBRIDGE LOGS POLICIES
-- =====================================================

-- Users can view their own logs
CREATE POLICY "Users can view their own ECBridge logs"
  ON ecbridge_logs FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert logs (via service role)
CREATE POLICY "System can insert ECBridge logs"
  ON ecbridge_logs FOR INSERT
  WITH CHECK (true);
