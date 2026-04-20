-- FIX: Create missing Agent Tables and Function

-- 1. Ensure Agent Tables Exist
CREATE TABLE IF NOT EXISTS public.agent_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_agent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS agent_owner_id UUID REFERENCES public.users(id),
ADD COLUMN IF NOT EXISTS agent_metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Create the Agent Identity Function
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
    
    -- Generate Simple Key
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
        new_api_key, 
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
