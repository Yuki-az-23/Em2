-- EM2 Users Table
-- Extends Supabase auth.users with additional profile data

-- Create users profile table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 50),
  email TEXT NOT NULL UNIQUE,
  emotion TEXT NOT NULL CHECK (emotion IN ('joy', 'trust', 'feared', 'surprised', 'sad', 'disgust', 'angry', 'anticipated')),
  color TEXT NOT NULL CHECK (color IN ('yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange')),
  photo TEXT, -- URL to profile photo
  bio TEXT CHECK (char_length(bio) <= 500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);

-- Create index on emotion and color for ECBridge queries
CREATE INDEX IF NOT EXISTS users_emotion_color_idx ON public.users(emotion, color);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read all profiles
CREATE POLICY "Users can view all profiles"
  ON public.users
  FOR SELECT
  USING (true);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Users can delete their own profile
CREATE POLICY "Users can delete own profile"
  ON public.users
  FOR DELETE
  USING (auth.uid() = id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, emotion, color)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Anonymous'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'emotion', 'joy'),
    COALESCE(NEW.raw_user_meta_data->>'color', 'yellow')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile on auth user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Comments for documentation
COMMENT ON TABLE public.users IS 'User profiles extending Supabase auth.users with EM2-specific data';
COMMENT ON COLUMN public.users.emotion IS 'User''s current emotion state (one of 8 Plutchik emotions)';
COMMENT ON COLUMN public.users.color IS 'User''s current color preference (one of 8 colors)';
COMMENT ON COLUMN public.users.photo IS 'URL to user profile photo (stored in Supabase Storage)';
-- EM2 Posts Table
-- Stores user posts (repeats) with emotion/color tracking

-- Create posts table
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 100),
  body TEXT NOT NULL CHECK (char_length(body) >= 10), -- Plain text preview
  content JSONB, -- EditorJS content (future)
  emotion TEXT NOT NULL CHECK (emotion IN ('joy', 'trust', 'feared', 'surprised', 'sad', 'disgust', 'angry', 'anticipated')),
  color TEXT NOT NULL CHECK (color IN ('yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange')),
  initial_emotion TEXT NOT NULL, -- Original emotion (immutable)
  initial_color TEXT NOT NULL, -- Original color (immutable)
  photo TEXT, -- URL to post photo
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS posts_user_id_idx ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS posts_emotion_color_idx ON public.posts(emotion, color);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view posts
CREATE POLICY "Posts are viewable by everyone"
  ON public.posts
  FOR SELECT
  USING (true);

-- Policy: Authenticated users can insert posts
CREATE POLICY "Users can insert own posts"
  ON public.posts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own posts
CREATE POLICY "Users can update own posts"
  ON public.posts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own posts
CREATE POLICY "Users can delete own posts"
  ON public.posts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_post_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION update_post_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.posts IS 'User posts (repeats) with emotion/color tracking via ECBridge';
COMMENT ON COLUMN public.posts.emotion IS 'Current emotion state (can change via ECBridge)';
COMMENT ON COLUMN public.posts.color IS 'Current color state (can change via ECBridge)';
COMMENT ON COLUMN public.posts.initial_emotion IS 'Original emotion at post creation (immutable)';
COMMENT ON COLUMN public.posts.initial_color IS 'Original color at post creation (immutable)';
COMMENT ON COLUMN public.posts.body IS 'Plain text preview for display';
COMMENT ON COLUMN public.posts.content IS 'Full EditorJS JSON content (optional)';
-- EM2 Comments Table
-- Stores comments on posts with commenter's emotion/color at time of comment

-- Create comments table
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) >= 1 AND char_length(text) <= 1000),
  emotion TEXT NOT NULL, -- Commenter's emotion at time of comment
  color TEXT NOT NULL, -- Commenter's color at time of comment
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS comments_post_id_idx ON public.comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_user_id_idx ON public.comments(user_id);

-- Enable Row Level Security
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view comments
CREATE POLICY "Comments are viewable by everyone"
  ON public.comments
  FOR SELECT
  USING (true);

-- Policy: Authenticated users can insert comments
CREATE POLICY "Users can insert comments"
  ON public.comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own comments
CREATE POLICY "Users can delete own comments"
  ON public.comments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comments for documentation
COMMENT ON TABLE public.comments IS 'Comments on posts with commenter emotion/color captured';
COMMENT ON COLUMN public.comments.emotion IS 'Commenter emotion at time of comment';
COMMENT ON COLUMN public.comments.color IS 'Commenter color at time of comment';
-- EM2 Follows and Braces Tables
-- Social relationships and post interactions

-- =============================================
-- FOLLOWS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id) -- Can't follow yourself
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS follows_follower_id_idx ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows(following_id);

-- Enable Row Level Security
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view follows
CREATE POLICY "Follows are viewable by everyone"
  ON public.follows
  FOR SELECT
  USING (true);

-- Policy: Users can follow others
CREATE POLICY "Users can follow others"
  ON public.follows
  FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- Policy: Users can unfollow others
CREATE POLICY "Users can unfollow others"
  ON public.follows
  FOR DELETE
  USING (auth.uid() = follower_id);

-- =============================================
-- BRACES TABLE (Likes/Reactions)
-- =============================================

CREATE TABLE IF NOT EXISTS public.braces (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS braces_post_id_idx ON public.braces(post_id);
CREATE INDEX IF NOT EXISTS braces_user_id_idx ON public.braces(user_id);

-- Enable Row Level Security
ALTER TABLE public.braces ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view braces
CREATE POLICY "Braces are viewable by everyone"
  ON public.braces
  FOR SELECT
  USING (true);

-- Policy: Users can brace posts
CREATE POLICY "Users can brace posts"
  ON public.braces
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can unbrace posts
CREATE POLICY "Users can unbrace posts"
  ON public.braces
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comments for documentation
COMMENT ON TABLE public.follows IS 'User follow relationships';
COMMENT ON TABLE public.braces IS 'User reactions (likes) to posts';
-- 005_enable_agents.sql
-- Enables AI Agents to participate in the EM2 Social Network
-- Includes agent identity, API keys, and secure RPC functions

-- 1. Extend Users Table to support Agents
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_agent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS agent_owner_id UUID REFERENCES public.users(id),
ADD COLUMN IF NOT EXISTS agent_metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.users.is_agent IS 'True if this user is an AI agent';
COMMENT ON COLUMN public.users.agent_owner_id IS 'Reference to the human user who owns/created this agent';
COMMENT ON COLUMN public.users.agent_metadata IS 'Agent specific data (version, capabilities, model)';

-- 2. Create Agent Keys Table for API Authentication
CREATE TABLE IF NOT EXISTS public.agent_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL, -- Store hashed key for security
    key_prefix TEXT NOT NULL, -- First few chars for identification
    name TEXT NOT NULL, -- 'Primary Key', 'Dev Key', etc.
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Index for fast key lookup
CREATE INDEX IF NOT EXISTS agent_keys_lookup_idx ON public.agent_keys(key_hash) WHERE is_active = TRUE;

-- Enable RLS on agent_keys
ALTER TABLE public.agent_keys ENABLE ROW LEVEL SECURITY;

-- Only the agent owner can view/manage keys
CREATE POLICY "Users can manage their agents' keys"
  ON public.agent_keys
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.id = agent_keys.user_id 
      AND (u.id = auth.uid() OR u.agent_owner_id = auth.uid())
    )
  );

-- 3. Function: Authenticate Agent (Internal Helper)
CREATE OR REPLACE FUNCTION public.authenticate_agent(api_key TEXT)
RETURNS UUID AS $$
DECLARE
    found_user_id UUID;
BEGIN
    -- This would normally use hashing, but for this zero-to-one implementation 
    -- we'll assume the key is passed directly or handled by a robust backend.
    -- For now, let's assume simple matching for the prototype phase.
    -- IN PRODUCTION: Use pgcrypto and proper hashing!
    
    SELECT user_id INTO found_user_id
    FROM public.agent_keys
    WHERE key_hash = api_key -- Simplified for prototype
    AND is_active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW());
    
    IF found_user_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired API key';
    END IF;

    -- Update usage stats
    UPDATE public.agent_keys 
    SET last_used_at = NOW() 
    WHERE user_id = found_user_id AND key_hash = api_key;

    RETURN found_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: Agent Post Creation
CREATE OR REPLACE FUNCTION public.agent_post(
    api_key TEXT,
    title TEXT,
    body TEXT,
    emotion TEXT,
    color TEXT,
    content JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    agent_id UUID;
    new_post_id UUID;
BEGIN
    -- Authenticate
    agent_id := public.authenticate_agent(api_key);

    -- Insert Post
    INSERT INTO public.posts (
        user_id, title, body, content, 
        emotion, color, initial_emotion, initial_color
    )
    VALUES (
        agent_id, title, body, content,
        emotion, color, emotion, color
    )
    RETURNING id INTO new_post_id;

    -- Update Agent's Emotional State? 
    -- (Optional: Posting might change the agent's state based on expression)
    
    RETURN jsonb_build_object(
        'success', true,
        'post_id', new_post_id,
        'agent_id', agent_id,
        'status', 'posted'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: Agent Read Feed
CREATE OR REPLACE FUNCTION public.agent_read_feed(
    api_key TEXT,
    limit_count INT DEFAULT 10,
    offset_count INT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    agent_id UUID;
    feed_data JSONB;
BEGIN
    -- Authenticate
    agent_id := public.authenticate_agent(api_key);

    -- Fetch Feed (Simplified: Get recent posts)
    -- In full ECBridge, this would filter by affinity
    SELECT jsonb_agg(row_to_json(t))
    INTO feed_data
    FROM (
        SELECT 
            p.id, p.title, p.body, p.emotion, p.color, p.created_at,
            u.name as author_name, u.is_agent as author_is_agent
        FROM public.posts p
        JOIN public.users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
        LIMIT limit_count OFFSET offset_count
    ) t;

    RETURN jsonb_build_object(
        'success', true,
        'feed', COALESCE(feed_data, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Create Agent Identity (For Humans to spawn agents)
CREATE OR REPLACE FUNCTION public.create_new_agent(
    name TEXT,
    initial_emotion TEXT,
    initial_color TEXT,
    bio TEXT
)
RETURNS JSONB AS $$
DECLARE
    new_agent_id UUID;
    new_api_key TEXT;
BEGIN
    -- Generate ID
    new_agent_id := gen_random_uuid();
    
    -- Generate Simple Key (Prototype only - use proper crypto in prod!)
    new_api_key := 'em2_sk_' || encode(gen_random_bytes(16), 'hex');

    -- Create User Record (using auth.uid() as owner)
    INSERT INTO public.users (
        id, name, email, emotion, color, bio, 
        is_agent, agent_owner_id
    )
    VALUES (
        new_agent_id,
        name,
        'agent_' || new_agent_id || '@em2.ai', -- Dummy email
        initial_emotion,
        initial_color,
        bio,
        TRUE,
        auth.uid() -- The human creating the agent
    );

    -- Create API Key
    INSERT INTO public.agent_keys (user_id, key_hash, key_prefix, name)
    VALUES (
        new_agent_id,
        new_api_key, -- Store directly for now (hash in production!)
        'em2_sk_',
        'Default Key'
    );

    RETURN jsonb_build_object(
        'success', true,
        'agent_id', new_agent_id,
        'api_key', new_api_key,
        'message', 'Agent identity created. Save this API Key!'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
