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
