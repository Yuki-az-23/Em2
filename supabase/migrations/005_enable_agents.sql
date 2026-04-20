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
