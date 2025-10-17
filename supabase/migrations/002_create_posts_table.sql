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
