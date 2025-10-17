-- EM2 Database Schema
-- PostgreSQL + Supabase
-- Created: 2025-01-17

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLES
-- =====================================================

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  emotion TEXT NOT NULL CHECK (emotion IN ('joy', 'trust', 'fear', 'surprise', 'sad', 'disgust', 'angry', 'anticipation')),
  color TEXT NOT NULL CHECK (color IN ('yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange')),
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts table
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL CHECK (LENGTH(title) >= 3 AND LENGTH(title) <= 100),
  body TEXT NOT NULL CHECK (LENGTH(body) >= 10 AND LENGTH(body) <= 10000),
  blocks JSONB, -- EditorJS content
  emotion TEXT NOT NULL CHECK (emotion IN ('joy', 'trust', 'fear', 'surprise', 'sad', 'disgust', 'angry', 'anticipation')),
  color TEXT NOT NULL CHECK (color IN ('yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange')),
  initial_emotion TEXT NOT NULL,
  initial_color TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments table
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text TEXT NOT NULL CHECK (LENGTH(text) >= 1 AND LENGTH(text) <= 1000),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emotion TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Braces (likes) table
CREATE TABLE braces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Follows table
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- ECBridge logs table (analytics)
CREATE TABLE ecbridge_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('comment', 'view', 'brace')),
  user_emotion TEXT NOT NULL,
  user_color TEXT NOT NULL,
  post_emotion TEXT NOT NULL,
  post_color TEXT NOT NULL,
  result_emotion TEXT,
  result_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_emotion_color ON users(emotion, color);

-- Posts
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_emotion_color ON posts(emotion, color);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_blocks ON posts USING GIN (blocks);

-- Comments
CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_created ON comments(created_at DESC);

-- Braces
CREATE INDEX idx_braces_post ON braces(post_id);
CREATE INDEX idx_braces_user ON braces(user_id);

-- Follows
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- ECBridge logs
CREATE INDEX idx_ecbridge_logs_user ON ecbridge_logs(user_id);
CREATE INDEX idx_ecbridge_logs_post ON ecbridge_logs(post_id);
CREATE INDEX idx_ecbridge_logs_created ON ecbridge_logs(created_at DESC);

-- =====================================================
-- VIEWS
-- =====================================================

-- Posts with stats
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
LEFT JOIN users u ON p.author_id = u.id
LEFT JOIN braces b ON p.id = b.post_id
LEFT JOIN comments c ON p.id = c.post_id
GROUP BY p.id, u.id;

-- Users with stats
CREATE VIEW users_with_stats AS
SELECT
  u.*,
  COUNT(DISTINCT p.id) as post_count,
  COUNT(DISTINCT f1.id) as follower_count,
  COUNT(DISTINCT f2.id) as following_count
FROM users u
LEFT JOIN posts p ON u.id = p.author_id
LEFT JOIN follows f1 ON u.id = f1.following_id
LEFT JOIN follows f2 ON u.id = f2.follower_id
GROUP BY u.id;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- ENABLE REALTIME
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE braces;
ALTER PUBLICATION supabase_realtime ADD TABLE follows;
