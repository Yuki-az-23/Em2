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
