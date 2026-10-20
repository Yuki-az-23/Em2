-- 007_rate_limits_and_invite_rpc.sql
-- Rate limiting in the database, so it holds on hosted Supabase and on a
-- private self-hosted instance alike, with no Worker in front.
--
-- Schedule ("3, then 1, then 2, then 4"):
--   a burst of 3 actions per window is free;
--   the first violation blocks for 1 unit, the second for 2, the third for 4,
--   doubling up to a cap; strikes reset after a quiet day.
-- Units and sizes are parameters of rate_limit_check, so the schedule can be
-- tuned per action without a new migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,                       -- sha256(action | client)
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count INT NOT NULL DEFAULT 0,
  strikes INT NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only SECURITY DEFINER functions below touch this table.

-- Best-effort client identity from the request headers PostgREST exposes.
-- Behind Cloudflare: cf-connecting-ip. Elsewhere: first hop of x-forwarded-for.
-- Authenticated users are keyed by their user id instead, which is stronger.
CREATE OR REPLACE FUNCTION public.client_key()
RETURNS TEXT AS $$
DECLARE
  hdr JSON;
  ip TEXT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN 'uid:' || auth.uid()::text;
  END IF;
  BEGIN
    hdr := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    hdr := NULL;
  END;
  ip := COALESCE(hdr->>'cf-connecting-ip', split_part(COALESCE(hdr->>'x-forwarded-for', ''), ',', 1), '');
  ip := trim(ip);
  IF ip = '' THEN ip := 'unknown'; END IF;
  RETURN 'ip:' || ip;
END;
$$ LANGUAGE plpgsql STABLE;

-- Returns (allowed, retry_after_seconds, strikes). Mutates the limiter row.
CREATE OR REPLACE FUNCTION public.rate_limit_check(
  p_action TEXT,
  p_burst INT DEFAULT 3,
  p_window INTERVAL DEFAULT INTERVAL '10 minutes',
  p_base_cooldown INTERVAL DEFAULT INTERVAL '1 minute',
  p_max_doublings INT DEFAULT 6,          -- 1,2,4,8,16,32,64 units, then flat
  p_strike_reset INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INT, strikes INT) AS $$
DECLARE
  k TEXT := encode(digest(p_action || '|' || public.client_key(), 'sha256'), 'hex');
  r public.rate_limits%ROWTYPE;
  cooldown INTERVAL;
  n INT;
BEGIN
  INSERT INTO public.rate_limits(key) VALUES (k) ON CONFLICT (key) DO NOTHING;
  SELECT * INTO r FROM public.rate_limits WHERE key = k FOR UPDATE;

  -- Quiet for a day: forgive the strikes.
  IF r.updated_at < NOW() - p_strike_reset THEN
    r.strikes := 0;
  END IF;

  -- Still blocked?
  IF r.blocked_until IS NOT NULL AND r.blocked_until > NOW() THEN
    UPDATE public.rate_limits SET updated_at = NOW() WHERE key = k;
    RETURN QUERY SELECT FALSE, CEIL(EXTRACT(EPOCH FROM (r.blocked_until - NOW())))::INT, r.strikes;
    RETURN;
  END IF;

  -- New window?
  IF r.window_start + p_window < NOW() THEN
    r.window_start := NOW();
    r.count := 0;
  END IF;

  IF r.count < p_burst THEN
    UPDATE public.rate_limits
       SET window_start = r.window_start, count = r.count + 1, strikes = r.strikes,
           blocked_until = NULL, updated_at = NOW()
     WHERE key = k;
    RETURN QUERY SELECT TRUE, 0, r.strikes;
    RETURN;
  END IF;

  -- Burst exhausted: strike, and block for base * 2^(strikes-1), capped.
  n := LEAST(r.strikes, p_max_doublings);
  cooldown := p_base_cooldown * POWER(2, n)::INT;
  UPDATE public.rate_limits
     SET strikes = r.strikes + 1, blocked_until = NOW() + cooldown,
         window_start = NOW(), count = 0, updated_at = NOW()
   WHERE key = k;
  RETURN QUERY SELECT FALSE, CEIL(EXTRACT(EPOCH FROM cooldown))::INT, r.strikes + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pseudonym and code generation move to the database so a client cannot
-- choose its own. Same word lists as src/core/pseudonym.js.
CREATE OR REPLACE FUNCTION public.make_pseudonym()
RETURNS TEXT AS $$
DECLARE
  first_words TEXT[] := ARRAY['נמל','בוסתן','שביל','חלון','מגדלור','גשר','מזח','חורשה','מרפסת','באר','סמטה','כרם','חוף','מעיין','צריף','גן'];
  second_words TEXT[] := ARRAY['שקט','מאוחר','ראשון','אפור','רחוק','פתוח','צהוב','קר','נסתר','ישן','כחול','חם','זר','סגור','ריק','מלא'];
BEGIN
  RETURN first_words[1 + (get_byte(gen_random_bytes(1), 0) % 16)] || '-' ||
         second_words[1 + (get_byte(gen_random_bytes(1), 0) % 16)];
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION public.make_invite_code()
RETURNS TEXT AS $$
DECLARE
  alphabet TEXT := 'abcdefghijkmnpqrstuvwxyz23456789';
  bytes BYTEA := gen_random_bytes(22);
  out TEXT := '';
  i INT;
BEGIN
  FOR i IN 0..21 LOOP
    out := out || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
  END LOOP;
  RETURN out;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Who the visitor says they are: part of the exhibit (their exchanges feed the
-- wall) or an investor in it (they keep it alive by reacting). Second datapoint.
ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'participant'
  CHECK (role IN ('participant', 'investor'));

-- The door, as one call. Replaces the open INSERT policy from 006.
CREATE OR REPLACE FUNCTION public.create_invite(p_display_name TEXT, p_answer TEXT, p_role TEXT DEFAULT 'participant')
RETURNS JSONB AS $$
DECLARE
  lim RECORD;
  v_code TEXT;
  v_pseudonym TEXT;
  v_expires TIMESTAMPTZ := NOW() + INTERVAL '7 days';
BEGIN
  IF p_display_name IS NULL OR char_length(trim(p_display_name)) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE = 'P0001';
  END IF;
  IF p_answer NOT IN ('trust_signal', 'amplifier_shapes') THEN
    RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE = 'P0001';
  END IF;
  IF p_role NOT IN ('participant', 'investor') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO lim FROM public.rate_limit_check('invite', 3, INTERVAL '10 minutes', INTERVAL '1 minute');
  IF NOT lim.allowed THEN
    RAISE EXCEPTION 'RATE_LIMITED:%', lim.retry_after_seconds USING ERRCODE = 'P0002';
  END IF;

  v_code := public.make_invite_code();
  v_pseudonym := public.make_pseudonym();
  INSERT INTO public.invites(code, display_name, pseudonym, answer, role, expires_at)
  VALUES (v_code, trim(p_display_name), v_pseudonym, p_answer, p_role, v_expires);

  RETURN jsonb_build_object('code', v_code, 'pseudonym', v_pseudonym, 'expires_at', v_expires);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Anyone can create an invite" ON public.invites;

REVOKE ALL ON FUNCTION public.rate_limit_check(TEXT, INT, INTERVAL, INTERVAL, INT, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invite(TEXT, TEXT, TEXT) TO anon, authenticated;
