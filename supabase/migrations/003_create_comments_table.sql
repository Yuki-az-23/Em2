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
