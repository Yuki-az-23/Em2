-- EM2 Initial Database Schema
-- Migration 001: Core tables and relationships
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,

  -- ECBridge State
  emotion TEXT NOT NULL DEFAULT 'Joy' CHECK (
    emotion IN ('Joy', 'Trust', 'Feared', 'Surprised', 'Sad', 'Disgust', 'Angry', 'Anticipated')
  ),
  color TEXT NOT NULL DEFAULT 'yellow' CHECK (
    color IN ('yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange')
  ),

  -- Profile
  avatar_url TEXT,
  bio TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_emotion ON users(emotion);
CREATE INDEX idx_users_color ON users(color);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- =============================================
-- POSTS TABLE
-- =============================================
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Content
  title TEXT NOT NULL,
  content JSONB, -- EditorJS content
  image_url TEXT,

  -- Current ECBridge State (evolves with interactions)
  emotion TEXT NOT NULL CHECK (
    emotion IN ('Joy', 'Trust', 'Feared', 'Surprised', 'Sad', 'Disgust', 'Angry', 'Anticipated')
  ),
  color TEXT NOT NULL CHECK (
    color IN ('yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange')
  ),

  -- Initial ECBridge State (immutable - original post state)
  initial_emotion TEXT NOT NULL CHECK (
    initial_emotion IN ('Joy', 'Trust', 'Feared', 'Surprised', 'Sad', 'Disgust', 'Angry', 'Anticipated')
  ),
  initial_color TEXT NOT NULL CHECK (
    initial_color IN ('yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange')
  ),

  -- Metadata
  intensity NUMERIC(3, 2) DEFAULT 1.0 CHECK (intensity >= 0 AND intensity <= 2.0),
  version TEXT DEFAULT '2.31.0', -- EditorJS version

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMPTZ
);

-- Indexes for posts
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_emotion ON posts(emotion);
CREATE INDEX idx_posts_color ON posts(color);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_deleted_at ON posts(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_posts_content_gin ON posts USING GIN (content); -- For JSONB queries

-- =============================================
-- COMMENTS TABLE
-- =============================================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Content
  text TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMPTZ
);

-- Indexes for comments
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);
CREATE INDEX idx_comments_deleted_at ON comments(deleted_at) WHERE deleted_at IS NULL;

-- =============================================
-- BRACES TABLE (Likes/Reactions)
-- =============================================
CREATE TABLE braces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure user can only brace a post once
  UNIQUE(post_id, user_id)
);

-- Indexes for braces
CREATE INDEX idx_braces_post_id ON braces(post_id);
CREATE INDEX idx_braces_user_id ON braces(user_id);
CREATE INDEX idx_braces_created_at ON braces(created_at DESC);

-- =============================================
-- FOLLOWS TABLE
-- =============================================
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure user can't follow themselves and can only follow once
  CHECK (follower_id != following_id),
  UNIQUE(follower_id, following_id)
);

-- Indexes for follows
CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_following_id ON follows(following_id);
CREATE INDEX idx_follows_created_at ON follows(created_at DESC);

-- =============================================
-- ECBRIDGE LOGS TABLE (Optional - for analytics)
-- =============================================
CREATE TABLE ecbridge_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Input
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  user_emotion TEXT NOT NULL,
  user_color TEXT NOT NULL,
  post_emotion TEXT NOT NULL,
  post_color TEXT NOT NULL,

  -- Output
  result_emotion TEXT NOT NULL,
  result_color TEXT NOT NULL,
  intensity NUMERIC(3, 2),
  confidence NUMERIC(3, 2),

  -- Metadata
  emotion_relation TEXT,
  color_harmony TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ecbridge_logs (for analytics queries)
CREATE INDEX idx_ecbridge_logs_user_id ON ecbridge_logs(user_id);
CREATE INDEX idx_ecbridge_logs_post_id ON ecbridge_logs(post_id);
CREATE INDEX idx_ecbridge_logs_created_at ON ecbridge_logs(created_at DESC);

-- =============================================
-- COMPUTED COLUMNS / VIEWS
-- =============================================

-- View: Posts with computed stats
CREATE VIEW posts_with_stats AS
SELECT
  p.*,
  u.name as author_name,
  u.avatar_url as author_avatar,
  u.emotion as author_emotion,
  u.color as author_color,
  COUNT(DISTINCT b.id) as brace_count,
  COUNT(DISTINCT c.id) as comment_count
FROM posts p
LEFT JOIN users u ON p.user_id = u.id
LEFT JOIN braces b ON p.id = b.post_id
LEFT JOIN comments c ON p.id = c.post_id AND c.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, u.name, u.avatar_url, u.emotion, u.color;

-- View: Users with computed stats
CREATE VIEW users_with_stats AS
SELECT
  u.*,
  COUNT(DISTINCT p.id) as post_count,
  COUNT(DISTINCT followers.id) as follower_count,
  COUNT(DISTINCT following.id) as following_count
FROM users u
LEFT JOIN posts p ON u.id = p.user_id AND p.deleted_at IS NULL
LEFT JOIN follows followers ON u.id = followers.following_id
LEFT JOIN follows following ON u.id = following.follower_id
WHERE u.is_active = true
GROUP BY u.id;

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Get personalized feed for user
CREATE OR REPLACE FUNCTION get_personalized_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  post_id UUID,
  title TEXT,
  content JSONB,
  emotion TEXT,
  color TEXT,
  author_name TEXT,
  author_avatar TEXT,
  brace_count BIGINT,
  comment_count BIGINT,
  created_at TIMESTAMPTZ,
  affinity_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH user_state AS (
    SELECT emotion, color FROM users WHERE id = p_user_id
  )
  SELECT
    p.id as post_id,
    p.title,
    p.content,
    p.emotion,
    p.color,
    u.name as author_name,
    u.avatar_url as author_avatar,
    COUNT(DISTINCT b.id) as brace_count,
    COUNT(DISTINCT c.id) as comment_count,
    p.created_at,
    -- Simple affinity score (can be enhanced with ECBridge logic)
    CASE
      WHEN p.emotion = (SELECT emotion FROM user_state) THEN 1.5
      WHEN p.color = (SELECT color FROM user_state) THEN 1.3
      ELSE 1.0
    END as affinity_score
  FROM posts p
  LEFT JOIN users u ON p.user_id = u.id
  LEFT JOIN braces b ON p.id = b.post_id
  LEFT JOIN comments c ON p.id = c.post_id AND c.deleted_at IS NULL
  WHERE p.deleted_at IS NULL
  GROUP BY p.id, u.name, u.avatar_url, p.created_at
  ORDER BY affinity_score DESC, p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SEED DATA (Optional - for testing)
-- =============================================

-- Note: This is commented out. Uncomment if you want sample data
/*
-- Insert sample user
INSERT INTO users (id, email, name, emotion, color, bio)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'test@em2.app', 'Test User', 'Joy', 'yellow', 'Testing EM2!');

-- Insert sample post
INSERT INTO posts (user_id, title, content, emotion, color, initial_emotion, initial_color)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Welcome to EM2!',
   '{"time": 1234567890, "blocks": [{"type": "paragraph", "data": {"text": "This is the new EM2!"}}], "version": "2.31.0"}',
   'Joy', 'yellow', 'Joy', 'yellow');
*/

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE users IS 'User accounts with ECBridge emotional state';
COMMENT ON TABLE posts IS 'User posts with evolving emotional state based on interactions';
COMMENT ON TABLE comments IS 'Comments on posts';
COMMENT ON TABLE braces IS 'Post reactions/likes (called braces in EM2)';
COMMENT ON TABLE follows IS 'User follow relationships';
COMMENT ON TABLE ecbridge_logs IS 'Analytics log of ECBridge calculations';

COMMENT ON COLUMN posts.emotion IS 'Current emotion - changes based on user interactions via ECBridge';
COMMENT ON COLUMN posts.initial_emotion IS 'Original emotion when post was created - immutable';
COMMENT ON COLUMN posts.intensity IS 'Emotional intensity from 0.0 to 2.0';

-- =============================================
-- SUCCESS MESSAGE
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '✅ EM2 Database Schema Created Successfully!';
  RAISE NOTICE '📊 Tables: users, posts, comments, braces, follows, ecbridge_logs';
  RAISE NOTICE '👁️  Views: posts_with_stats, users_with_stats';
  RAISE NOTICE '⚡ Functions: get_personalized_feed, update_updated_at_column';
  RAISE NOTICE '🔒 Next Step: Run migration 002 for Row Level Security policies';
END $$;
