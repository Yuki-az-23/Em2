-- EM2 ECBridge Database Functions
-- Migration 003: Advanced functions for ECBridge integration
-- Run this after migrations 001 and 002

-- =============================================
-- ECBRIDGE CALCULATION HELPER
-- =============================================

-- Function: Log ECBridge calculation
CREATE OR REPLACE FUNCTION log_ecbridge_calculation(
  p_user_id UUID,
  p_post_id UUID,
  p_user_emotion TEXT,
  p_user_color TEXT,
  p_post_emotion TEXT,
  p_post_color TEXT,
  p_result_emotion TEXT,
  p_result_color TEXT,
  p_intensity NUMERIC,
  p_confidence NUMERIC,
  p_emotion_relation TEXT DEFAULT NULL,
  p_color_harmony TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO ecbridge_logs (
    user_id,
    post_id,
    user_emotion,
    user_color,
    post_emotion,
    post_color,
    result_emotion,
    result_color,
    intensity,
    confidence,
    emotion_relation,
    color_harmony
  ) VALUES (
    p_user_id,
    p_post_id,
    p_user_emotion,
    p_user_color,
    p_post_emotion,
    p_post_color,
    p_result_emotion,
    p_result_color,
    p_intensity,
    p_confidence,
    p_emotion_relation,
    p_color_harmony
  ) RETURNING id INTO log_id;

  RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- POST INTERACTION FUNCTIONS
-- =============================================

-- Function: Add comment and update post emotion
CREATE OR REPLACE FUNCTION add_comment_with_ecbridge(
  p_post_id UUID,
  p_user_id UUID,
  p_comment_text TEXT,
  p_new_emotion TEXT,
  p_new_color TEXT,
  p_intensity NUMERIC DEFAULT 1.0
)
RETURNS UUID AS $$
DECLARE
  comment_id UUID;
BEGIN
  -- Insert comment
  INSERT INTO comments (post_id, user_id, text)
  VALUES (p_post_id, p_user_id, p_comment_text)
  RETURNING id INTO comment_id;

  -- Update post emotion/color based on ECBridge calculation
  UPDATE posts
  SET
    emotion = p_new_emotion,
    color = p_new_color,
    intensity = p_intensity,
    updated_at = NOW()
  WHERE id = p_post_id;

  RETURN comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Toggle brace (like/unlike)
CREATE OR REPLACE FUNCTION toggle_brace(
  p_post_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  brace_exists BOOLEAN;
BEGIN
  -- Check if brace already exists
  SELECT EXISTS (
    SELECT 1 FROM braces
    WHERE post_id = p_post_id AND user_id = p_user_id
  ) INTO brace_exists;

  IF brace_exists THEN
    -- Remove brace
    DELETE FROM braces
    WHERE post_id = p_post_id AND user_id = p_user_id;
    RETURN FALSE; -- Indicating unbrace
  ELSE
    -- Add brace
    INSERT INTO braces (post_id, user_id)
    VALUES (p_post_id, p_user_id);
    RETURN TRUE; -- Indicating brace
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Toggle follow (follow/unfollow)
CREATE OR REPLACE FUNCTION toggle_follow(
  p_follower_id UUID,
  p_following_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  follow_exists BOOLEAN;
BEGIN
  -- Prevent self-follow
  IF p_follower_id = p_following_id THEN
    RAISE EXCEPTION 'Cannot follow yourself';
  END IF;

  -- Check if follow already exists
  SELECT EXISTS (
    SELECT 1 FROM follows
    WHERE follower_id = p_follower_id AND following_id = p_following_id
  ) INTO follow_exists;

  IF follow_exists THEN
    -- Unfollow
    DELETE FROM follows
    WHERE follower_id = p_follower_id AND following_id = p_following_id;
    RETURN FALSE; -- Indicating unfollow
  ELSE
    -- Follow
    INSERT INTO follows (follower_id, following_id)
    VALUES (p_follower_id, p_following_id);
    RETURN TRUE; -- Indicating follow
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- FEED GENERATION FUNCTIONS
-- =============================================

-- Function: Get enhanced personalized feed with ECBridge scoring
CREATE OR REPLACE FUNCTION get_enhanced_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  post_id UUID,
  title TEXT,
  content JSONB,
  image_url TEXT,
  emotion TEXT,
  color TEXT,
  intensity NUMERIC,
  author_id UUID,
  author_name TEXT,
  author_avatar TEXT,
  author_emotion TEXT,
  author_color TEXT,
  brace_count BIGINT,
  comment_count BIGINT,
  user_has_braced BOOLEAN,
  user_is_following BOOLEAN,
  created_at TIMESTAMPTZ,
  affinity_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH user_state AS (
    SELECT emotion, color FROM users WHERE id = p_user_id
  ),
  post_data AS (
    SELECT
      p.id,
      p.title,
      p.content,
      p.image_url,
      p.emotion,
      p.color,
      p.intensity,
      p.user_id,
      u.name as author_name,
      u.avatar_url as author_avatar,
      u.emotion as author_emotion,
      u.color as author_color,
      p.created_at,
      -- Calculate affinity score based on emotion/color matching
      CASE
        -- Same emotion = highest affinity
        WHEN p.emotion = (SELECT emotion FROM user_state) THEN 2.0
        -- Same color = high affinity
        WHEN p.color = (SELECT color FROM user_state) THEN 1.5
        -- Opposite emotions = interesting (transformation potential)
        WHEN (p.emotion = 'Joy' AND (SELECT emotion FROM user_state) = 'Sad')
          OR (p.emotion = 'Sad' AND (SELECT emotion FROM user_state) = 'Joy')
          OR (p.emotion = 'Trust' AND (SELECT emotion FROM user_state) = 'Disgust')
          OR (p.emotion = 'Disgust' AND (SELECT emotion FROM user_state) = 'Trust')
          OR (p.emotion = 'Angry' AND (SELECT emotion FROM user_state) = 'Feared')
          OR (p.emotion = 'Feared' AND (SELECT emotion FROM user_state) = 'Angry')
          OR (p.emotion = 'Anticipated' AND (SELECT emotion FROM user_state) = 'Surprised')
          OR (p.emotion = 'Surprised' AND (SELECT emotion FROM user_state) = 'Anticipated')
        THEN 0.8
        -- Default affinity
        ELSE 1.0
      END as affinity_score,
      COUNT(DISTINCT b.id) as brace_count,
      COUNT(DISTINCT c.id) as comment_count,
      EXISTS(SELECT 1 FROM braces WHERE post_id = p.id AND user_id = p_user_id) as user_has_braced,
      EXISTS(SELECT 1 FROM follows WHERE follower_id = p_user_id AND following_id = p.user_id) as user_is_following
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN braces b ON p.id = b.post_id
    LEFT JOIN comments c ON p.id = c.post_id AND c.deleted_at IS NULL
    WHERE p.deleted_at IS NULL
    GROUP BY p.id, u.id, u.name, u.avatar_url, u.emotion, u.color
  )
  SELECT
    pd.id as post_id,
    pd.title,
    pd.content,
    pd.image_url,
    pd.emotion,
    pd.color,
    pd.intensity,
    pd.user_id as author_id,
    pd.author_name,
    pd.author_avatar,
    pd.author_emotion,
    pd.author_color,
    pd.brace_count,
    pd.comment_count,
    pd.user_has_braced,
    pd.user_is_following,
    pd.created_at,
    pd.affinity_score
  FROM post_data pd
  ORDER BY pd.affinity_score DESC, pd.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get posts from followed users
CREATE OR REPLACE FUNCTION get_following_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  post_id UUID,
  title TEXT,
  content JSONB,
  image_url TEXT,
  emotion TEXT,
  color TEXT,
  author_name TEXT,
  author_avatar TEXT,
  brace_count BIGINT,
  comment_count BIGINT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as post_id,
    p.title,
    p.content,
    p.image_url,
    p.emotion,
    p.color,
    u.name as author_name,
    u.avatar_url as author_avatar,
    COUNT(DISTINCT b.id) as brace_count,
    COUNT(DISTINCT c.id) as comment_count,
    p.created_at
  FROM posts p
  INNER JOIN follows f ON p.user_id = f.following_id
  LEFT JOIN users u ON p.user_id = u.id
  LEFT JOIN braces b ON p.id = b.post_id
  LEFT JOIN comments c ON p.id = c.post_id AND c.deleted_at IS NULL
  WHERE f.follower_id = p_user_id
    AND p.deleted_at IS NULL
  GROUP BY p.id, u.name, u.avatar_url
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- ANALYTICS FUNCTIONS
-- =============================================

-- Function: Get emotion distribution for posts
CREATE OR REPLACE FUNCTION get_emotion_distribution()
RETURNS TABLE (
  emotion TEXT,
  count BIGINT,
  percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH emotion_counts AS (
    SELECT
      p.emotion,
      COUNT(*) as count
    FROM posts p
    WHERE p.deleted_at IS NULL
    GROUP BY p.emotion
  ),
  total_posts AS (
    SELECT COUNT(*) as total FROM posts WHERE deleted_at IS NULL
  )
  SELECT
    ec.emotion,
    ec.count,
    ROUND((ec.count::NUMERIC / tp.total::NUMERIC) * 100, 2) as percentage
  FROM emotion_counts ec
  CROSS JOIN total_posts tp
  ORDER BY ec.count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user's emotional journey
CREATE OR REPLACE FUNCTION get_user_emotional_journey(
  p_user_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  emotion TEXT,
  color TEXT,
  post_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(p.created_at) as date,
    p.emotion,
    p.color,
    COUNT(*) as post_count
  FROM posts p
  WHERE p.user_id = p_user_id
    AND p.deleted_at IS NULL
    AND p.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY DATE(p.created_at), p.emotion, p.color
  ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Get trending posts (most engagement)
CREATE OR REPLACE FUNCTION get_trending_posts(
  p_hours INTEGER DEFAULT 24,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  post_id UUID,
  title TEXT,
  emotion TEXT,
  color TEXT,
  author_name TEXT,
  engagement_score BIGINT,
  brace_count BIGINT,
  comment_count BIGINT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as post_id,
    p.title,
    p.emotion,
    p.color,
    u.name as author_name,
    (COUNT(DISTINCT b.id) * 2 + COUNT(DISTINCT c.id) * 3) as engagement_score,
    COUNT(DISTINCT b.id) as brace_count,
    COUNT(DISTINCT c.id) as comment_count,
    p.created_at
  FROM posts p
  LEFT JOIN users u ON p.user_id = u.id
  LEFT JOIN braces b ON p.id = b.post_id
  LEFT JOIN comments c ON p.id = c.post_id AND c.deleted_at IS NULL
  WHERE p.deleted_at IS NULL
    AND p.created_at >= NOW() - (p_hours || ' hours')::INTERVAL
  GROUP BY p.id, u.name
  ORDER BY engagement_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SEARCH FUNCTIONS
-- =============================================

-- Function: Search posts by title or content
CREATE OR REPLACE FUNCTION search_posts(
  p_query TEXT,
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
  relevance REAL,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as post_id,
    p.title,
    p.content,
    p.emotion,
    p.color,
    u.name as author_name,
    ts_rank(
      to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content::TEXT, '')),
      plainto_tsquery('english', p_query)
    ) as relevance,
    p.created_at
  FROM posts p
  LEFT JOIN users u ON p.user_id = u.id
  WHERE p.deleted_at IS NULL
    AND (
      to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content::TEXT, ''))
      @@ plainto_tsquery('english', p_query)
    )
  ORDER BY relevance DESC, p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- NOTIFICATION TRIGGERS
-- =============================================

-- Function: Notify on new comment
CREATE OR REPLACE FUNCTION notify_new_comment()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
BEGIN
  -- Get post author
  SELECT user_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  -- Don't notify if user is commenting on their own post
  IF post_author_id != NEW.user_id THEN
    -- Insert notification (you'll create a notifications table later)
    -- For now, we'll skip this
    NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_notify_new_comment
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_comment();

-- =============================================
-- SUCCESS MESSAGE
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '✅ ECBridge Database Functions Created Successfully!';
  RAISE NOTICE '🧠 ECBridge logging function ready';
  RAISE NOTICE '💬 Comment + ECBridge update function available';
  RAISE NOTICE '❤️  Toggle brace/follow functions ready';
  RAISE NOTICE '📊 Enhanced feed generation with affinity scoring';
  RAISE NOTICE '📈 Analytics functions: emotion distribution, trending posts';
  RAISE NOTICE '🔍 Search function with full-text search';
  RAISE NOTICE '🔔 Notification triggers in place';
  RAISE NOTICE '✨ Database setup complete! Ready for application development';
END $$;
