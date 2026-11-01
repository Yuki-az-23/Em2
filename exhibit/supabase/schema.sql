-- =============================================================================
-- הרמס והקיר: סכמה אחת
--
-- Applied once to an empty database. Runs on Supabase (hosted or self-hosted)
-- and on plain PostgreSQL 16+ for CI: everything Supabase-specific (auth
-- schema, roles, realtime publication, storage buckets) is guarded so that
-- the file never overwrites what Supabase provides and never fails where it
-- is absent.
--
-- Principles enforced here, not in the client:
--   one identity per entity (human, agent, persona) in `profiles`;
--   private state (`base_*`, `felt_*`, messages) readable only by its owner;
--   every write to shared state goes through a SECURITY DEFINER function;
--   a refusal is a refusal: RATE_LIMITED, NOT_CONTACT, FORBIDDEN raise;
--   the audit log holds ids, never content.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 0. Shims for plain PostgreSQL (no-ops on Supabase)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    CREATE TABLE auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'auth' AND p.proname = 'uid') THEN
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
      $f$ SELECT NULLIF(COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''),
                              NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub'), '')::uuid $f$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'auth' AND p.proname = 'role') THEN
    CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS
      $f$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
                       NULLIF(current_setting('request.jwt.claims', true), '')::json->>'role', 'anon') $f$;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. Rings: names, distance, one step. Mirrors packages/core/ring.js.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ring_names(p_kind TEXT) RETURNS TEXT[] AS $$
  SELECT CASE p_kind
    WHEN 'emotion' THEN ARRAY['joy','trust','feared','surprised','sad','disgust','angry','anticipated']
    ELSE ARRAY['yellow','lime','green','aqua','blue','pink','red','orange'] END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.ring_index(p_kind TEXT, p_name TEXT) RETURNS INT AS $$
  SELECT array_position(public.ring_names(p_kind), lower(p_name)) - 1;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.ring_d8(a INT, b INT) RETURNS INT AS $$
  SELECT LEAST(abs(a - b) % 8, 8 - (abs(a - b) % 8));
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.ring_step(a INT, b INT) RETURNS INT AS $$
  SELECT CASE WHEN a = b THEN a
              WHEN ((b - a + 8) % 8) <= 4 THEN (a + 1) % 8
              ELSE (a + 7) % 8 END;
$$ LANGUAGE sql IMMUTABLE;

-- resonance in [0,1] between two (emotion,color) index pairs
CREATE OR REPLACE FUNCTION public.ring_rho(e1 INT, c1 INT, e2 INT, c2 INT) RETURNS NUMERIC AS $$
  SELECT 1 - (public.ring_d8(e1, e2) + public.ring_d8(c1, c2))::NUMERIC / 8;
$$ LANGUAGE sql IMMUTABLE;

-- -----------------------------------------------------------------------------
-- 2. Settings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.app_settings(key, value) VALUES
  ('telegram_bot', 'HermesExhibitBot'),
  ('consent_version', 'exhibit-consent-1'),
  ('feed_epsilon', '0.5'),
  ('feed_pi', '0.05'),
  ('feed_alpha', '0.6'),
  ('memory_lambda', '0.9'),
  ('brace_beta', '1.0'),
  ('publish_weight', '3')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.setting(p_key TEXT) RETURNS TEXT AS $$
  SELECT value FROM public.app_settings WHERE key = p_key;
$$ LANGUAGE sql STABLE;

-- -----------------------------------------------------------------------------
-- 3. Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_user_id BIGINT UNIQUE,
  kind TEXT NOT NULL DEFAULT 'human' CHECK (kind IN ('human', 'agent', 'persona')),
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 50),
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'investor')),
  answer TEXT CHECK (answer IS NULL OR answer IN ('trust_signal', 'amplifier_shapes')),
  -- b: the home. Only set_home writes it.
  base_emotion TEXT NOT NULL DEFAULT 'joy' CHECK (base_emotion = ANY (public.ring_names('emotion'))),
  base_color   TEXT NOT NULL DEFAULT 'yellow' CHECK (base_color = ANY (public.ring_names('color'))),
  -- a: felt. Owner only.
  felt_emotion TEXT NOT NULL DEFAULT 'joy' CHECK (felt_emotion = ANY (public.ring_names('emotion'))),
  felt_color   TEXT NOT NULL DEFAULT 'yellow' CHECK (felt_color = ANY (public.ring_names('color'))),
  -- x: expressed. Public.
  emotion TEXT NOT NULL DEFAULT 'joy' CHECK (emotion = ANY (public.ring_names('emotion'))),
  color   TEXT NOT NULL DEFAULT 'yellow' CHECK (color = ANY (public.ring_names('color'))),
  consent_version TEXT,
  consent_at TIMESTAMPTZ,
  style TEXT NOT NULL DEFAULT 'watercolor',
  avatar_seed TEXT,
  accept_from TEXT NOT NULL DEFAULT 'contacts' CHECK (accept_from IN ('contacts', 'anyone', 'nobody')),
  owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,  -- agents: the human who made them
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS profiles_handle_idx ON public.profiles(handle);
-- When a participant told the bot which emotion and color they bring. Until both are
-- set, the bot keeps asking and relays nothing.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS emotion_declared_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS color_declared_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.invites (
  code TEXT PRIMARY KEY CHECK (char_length(code) = 22),
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,  -- null: self-claim from the door
  for_display_name TEXT CHECK (for_display_name IS NULL OR char_length(for_display_name) BETWEEN 1 AND 50),
  handle TEXT,                                                       -- reserved pseudonym for the claimer
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'investor')),
  answer TEXT CHECK (answer IS NULL OR answer IN ('trust_signal', 'amplifier_shapes')),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invites_expires_idx ON public.invites(expires_at);

CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (a <> b),
  UNIQUE (a, b)
);
-- store the pair ordered so (x,y) and (y,x) are one row
CREATE OR REPLACE FUNCTION public.pair_key(x UUID, y UUID, OUT lo UUID, OUT hi UUID) AS $$
  SELECT LEAST(x, y), GREATEST(x, y);
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE IF NOT EXISTS public.exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'mcp', 'web')),
  participants UUID[] NOT NULL CHECK (array_length(participants, 1) = 2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'published', 'failed', 'withdrawn')),
  consent JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  attempts INT NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS exchanges_status_idx ON public.exchanges(status);
CREATE INDEX IF NOT EXISTS exchanges_participants_idx ON public.exchanges USING GIN (participants);

CREATE TABLE IF NOT EXISTS public.messages (
  id BIGSERIAL PRIMARY KEY,
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  from_profile UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4096),
  witness TEXT NOT NULL DEFAULT 'self_wrote' CHECK (witness IN ('self_wrote', 'agent_drafted', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_exchange_idx ON public.messages(exchange_id, id);

CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID UNIQUE REFERENCES public.exchanges(id) ON DELETE SET NULL,
  pseudonyms TEXT[] NOT NULL CHECK (array_length(pseudonyms, 1) >= 1),
  title TEXT,
  body TEXT NOT NULL,                       -- the paraphrase. Never the words.
  content JSONB,                            -- optional EditorJS blocks
  seed TEXT,
  image_url TEXT,
  initial_emotion TEXT NOT NULL CHECK (initial_emotion = ANY (public.ring_names('emotion'))),
  initial_color   TEXT NOT NULL CHECK (initial_color = ANY (public.ring_names('color'))),
  emotion TEXT NOT NULL CHECK (emotion = ANY (public.ring_names('emotion'))),
  color   TEXT NOT NULL CHECK (color = ANY (public.ring_names('color'))),
  intensity NUMERIC NOT NULL DEFAULT 1.0,
  confidence NUMERIC NOT NULL DEFAULT 1.0,
  memory NUMERIC[] NOT NULL,                -- 64 cells, index = e*8 + c
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  reactions INT NOT NULL DEFAULT 0,
  braces INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS posts_live_idx ON public.posts(created_at DESC) WHERE withdrawn_at IS NULL;

CREATE TABLE IF NOT EXISTS public.comments (
  id BIGSERIAL PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,                      -- sha256 of client key or 'agent:<id>'
  actor_profile UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_emotion TEXT NOT NULL,
  actor_color TEXT NOT NULL,
  text TEXT CHECK (text IS NULL OR char_length(text) <= 500),
  before_emotion TEXT NOT NULL, before_color TEXT NOT NULL,
  after_emotion TEXT NOT NULL,  after_color TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS comments_post_idx ON public.comments(post_id, id);

CREATE TABLE IF NOT EXISTS public.braces (
  id BIGSERIAL PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  actor_profile UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, actor)
);

CREATE TABLE IF NOT EXISTS public.follows (
  follower UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  followed UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower, followed),
  CHECK (follower <> followed)
);

CREATE TABLE IF NOT EXISTS public.agent_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,            -- sha256 hex of the key. Never the key.
  prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'default',
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count INT NOT NULL DEFAULT 0,
  strikes INT NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS posts_touch ON public.posts;
CREATE TRIGGER posts_touch BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS contacts_touch ON public.contacts;
CREATE TRIGGER contacts_touch BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Internal helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit(p_actor TEXT, p_action TEXT, p_target TEXT) RETURNS VOID AS $$
  INSERT INTO public.audit_log(actor, action, target) VALUES (p_actor, p_action, p_target);
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION public.fail(p_code TEXT, p_detail TEXT DEFAULT NULL) RETURNS VOID AS $$
BEGIN
  RAISE EXCEPTION '%', CASE WHEN p_detail IS NULL THEN p_code ELSE p_code || ':' || p_detail END
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- The profile of the calling authenticated user, or null.
CREATE OR REPLACE FUNCTION public.my_profile_id() RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Who may name a profile other than their own: the service role (the Worker), or
-- a direct database session with no API caller behind it (psql, the seed). Every
-- request through the API carries JWT claims; only service_role among them is trusted.
CREATE OR REPLACE FUNCTION public.trusted_caller() RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL
      THEN COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    WHEN NULLIF(current_setting('request.jwt.claim.role', true), '') IS NOT NULL
      THEN current_setting('request.jwt.claim.role', true) = 'service_role'
    ELSE TRUE
  END;
$$ LANGUAGE sql STABLE;

-- The profile a call acts for: the caller's own when none is named; a named one only
-- for a trusted caller. A signed-in user naming any profile is refused, even their own,
-- because the site never needs to.
CREATE OR REPLACE FUNCTION public.acting_profile(p_profile UUID) RETURNS UUID AS $$
BEGIN
  IF p_profile IS NULL THEN RETURN public.my_profile_id(); END IF;
  IF NOT public.trusted_caller() THEN PERFORM public.fail('FORBIDDEN', 'profile'); END IF;
  RETURN p_profile;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.client_key() RETURNS TEXT AS $$
DECLARE hdr JSON; ip TEXT;
BEGIN
  IF auth.uid() IS NOT NULL THEN RETURN 'uid:' || auth.uid()::text; END IF;
  BEGIN hdr := current_setting('request.headers', true)::json; EXCEPTION WHEN OTHERS THEN hdr := NULL; END;
  ip := trim(COALESCE(hdr->>'cf-connecting-ip', split_part(COALESCE(hdr->>'x-forwarded-for', ''), ',', 1), ''));
  IF ip = '' THEN ip := 'unknown'; END IF;
  RETURN 'ip:' || ip;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3, then 1, 2, 4: burst free, then doubling cooldowns, strikes forgiven after a quiet day.
CREATE OR REPLACE FUNCTION public.rate_limit_check(
  p_action TEXT, p_burst INT DEFAULT 3, p_window INTERVAL DEFAULT INTERVAL '10 minutes',
  p_base_cooldown INTERVAL DEFAULT INTERVAL '1 minute', p_max_doublings INT DEFAULT 6,
  p_strike_reset INTERVAL DEFAULT INTERVAL '24 hours', p_key TEXT DEFAULT NULL
) RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INT, strikes INT) AS $$
DECLARE k TEXT; r public.rate_limits%ROWTYPE; cooldown INTERVAL; n INT;
BEGIN
  k := encode(digest(p_action || '|' || COALESCE(p_key, public.client_key()), 'sha256'), 'hex');
  INSERT INTO public.rate_limits(key) VALUES (k) ON CONFLICT (key) DO NOTHING;
  SELECT * INTO r FROM public.rate_limits WHERE key = k FOR UPDATE;
  IF r.updated_at < NOW() - p_strike_reset THEN r.strikes := 0; END IF;
  IF r.blocked_until IS NOT NULL AND r.blocked_until > NOW() THEN
    UPDATE public.rate_limits SET updated_at = NOW() WHERE key = k;
    RETURN QUERY SELECT FALSE, CEIL(EXTRACT(EPOCH FROM (r.blocked_until - NOW())))::INT, r.strikes; RETURN;
  END IF;
  IF r.window_start + p_window < NOW() THEN r.window_start := NOW(); r.count := 0; END IF;
  IF r.count < p_burst THEN
    UPDATE public.rate_limits SET window_start = r.window_start, count = r.count + 1, strikes = r.strikes,
      blocked_until = NULL, updated_at = NOW() WHERE key = k;
    RETURN QUERY SELECT TRUE, 0, r.strikes; RETURN;
  END IF;
  n := LEAST(r.strikes, p_max_doublings);
  cooldown := p_base_cooldown * POWER(2, n)::INT;
  UPDATE public.rate_limits SET strikes = r.strikes + 1, blocked_until = NOW() + cooldown,
    window_start = NOW(), count = 0, updated_at = NOW() WHERE key = k;
  RETURN QUERY SELECT FALSE, CEIL(EXTRACT(EPOCH FROM cooldown))::INT, r.strikes + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.make_handle() RETURNS TEXT AS $$
DECLARE
  f TEXT[] := ARRAY['נמל','בוסתן','שביל','חלון','מגדלור','גשר','מזח','חורשה','מרפסת','באר','סמטה','כרם','חוף','מעיין','צריף','גן'];
  s TEXT[] := ARRAY['שקט','מאוחר','ראשון','אפור','רחוק','פתוח','צהוב','קר','נסתר','ישן','כחול','חם','זר','סגור','ריק','מלא'];
  h TEXT; i INT := 0;
BEGIN
  LOOP
    h := f[1 + (get_byte(gen_random_bytes(1), 0) % 16)] || '-' || s[1 + (get_byte(gen_random_bytes(1), 0) % 16)];
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE handle = h) THEN RETURN h; END IF;
    i := i + 1;
    IF i > 20 THEN RETURN h || '-' || substr(encode(gen_random_bytes(2), 'hex'), 1, 3); END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION public.make_code() RETURNS TEXT AS $$
DECLARE alphabet TEXT := 'abcdefghijkmnpqrstuvwxyz23456789'; b BYTEA := gen_random_bytes(22); o TEXT := ''; i INT;
BEGIN
  FOR i IN 0..21 LOOP o := o || substr(alphabet, 1 + (get_byte(b, i) % 32), 1); END LOOP;
  RETURN o;
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION public.telegram_link(p_code TEXT) RETURNS TEXT AS $$
  SELECT 'https://t.me/' || public.setting('telegram_bot') || '?start=' || p_code;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.are_contacts(x UUID, y UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.contacts c, public.pair_key(x, y) k
                 WHERE c.a = k.lo AND c.b = k.hi AND c.status = 'accepted');
$$ LANGUAGE sql STABLE;

-- -----------------------------------------------------------------------------
-- 5. The door
-- -----------------------------------------------------------------------------
-- From the website, anonymous. Creates a self-claim invite: the person will claim
-- it from Telegram (/start code) or from a signed-in session.
CREATE OR REPLACE FUNCTION public.create_invite(p_display_name TEXT, p_role TEXT DEFAULT 'participant', p_answer TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE lim RECORD; v_code TEXT; v_handle TEXT; v_exp TIMESTAMPTZ := NOW() + INTERVAL '7 days';
BEGIN
  IF p_display_name IS NULL OR char_length(trim(p_display_name)) NOT BETWEEN 1 AND 50 THEN PERFORM public.fail('INVALID_NAME'); END IF;
  IF p_role NOT IN ('participant', 'investor') THEN PERFORM public.fail('INVALID_ROLE'); END IF;
  IF p_answer IS NOT NULL AND p_answer NOT IN ('trust_signal', 'amplifier_shapes') THEN PERFORM public.fail('INVALID_ANSWER'); END IF;
  SELECT * INTO lim FROM public.rate_limit_check('invite', 3);
  IF NOT lim.allowed THEN PERFORM public.fail('RATE_LIMITED', lim.retry_after_seconds::text); END IF;
  v_code := public.make_code(); v_handle := public.make_handle();
  INSERT INTO public.invites(code, created_by, for_display_name, handle, role, answer, expires_at)
  VALUES (v_code, NULL, trim(p_display_name), v_handle, p_role, p_answer, v_exp);
  PERFORM public.audit(public.client_key(), 'invite.create', v_code);
  RETURN jsonb_build_object('code', v_code, 'handle', v_handle, 'telegram_link', public.telegram_link(v_code), 'expires_at', v_exp);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- A participant invites a specific other person. Called by the Worker (service role)
-- on behalf of a Telegram user, or by a signed-in user.
CREATE OR REPLACE FUNCTION public.create_pair_invite(p_from_profile UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE me UUID := public.acting_profile(p_from_profile); lim RECORD; v_code TEXT; v_exp TIMESTAMPTZ := NOW() + INTERVAL '7 days';
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  SELECT * INTO lim FROM public.rate_limit_check('invite', 3, p_key => 'profile:' || me::text);
  IF NOT lim.allowed THEN PERFORM public.fail('RATE_LIMITED', lim.retry_after_seconds::text); END IF;
  v_code := public.make_code();
  INSERT INTO public.invites(code, created_by, handle, role, expires_at)
  VALUES (v_code, me, public.make_handle(), 'participant', v_exp);
  PERFORM public.audit('profile:' || me::text, 'invite.pair', v_code);
  RETURN jsonb_build_object('code', v_code, 'telegram_link', public.telegram_link(v_code), 'expires_at', v_exp);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- What the /join page may show: who left something, by handle. Nothing else.
CREATE OR REPLACE FUNCTION public.peek_invite(p_code TEXT) RETURNS JSONB AS $$
  SELECT CASE WHEN i.code IS NULL OR i.expires_at < NOW() OR i.claimed_at IS NOT NULL THEN NULL
         ELSE jsonb_build_object('from_handle', p.handle, 'role', i.role, 'expires_at', i.expires_at) END
  FROM (SELECT p_code AS code) q
  LEFT JOIN public.invites i ON i.code = q.code
  LEFT JOIN public.profiles p ON p.id = i.created_by;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Claim: binds the invite to a profile found or created by telegram id or auth user.
-- Returns the profile and, for pair invites, opens the contact.
CREATE OR REPLACE FUNCTION public.claim_invite(p_code TEXT, p_telegram_user_id BIGINT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE inv public.invites%ROWTYPE; me UUID; v_handle TEXT; paired UUID; k RECORD;
BEGIN
  SELECT * INTO inv FROM public.invites WHERE code = p_code FOR UPDATE;
  IF NOT FOUND OR inv.expires_at < NOW() THEN PERFORM public.fail('INVITE_EXPIRED'); END IF;
  IF inv.claimed_at IS NOT NULL THEN PERFORM public.fail('INVITE_EXPIRED'); END IF;

  -- find the claimer; only the Worker may claim for a Telegram account
  IF p_telegram_user_id IS NOT NULL AND NOT public.trusted_caller() THEN PERFORM public.fail('FORBIDDEN', 'telegram'); END IF;
  IF p_telegram_user_id IS NOT NULL THEN
    SELECT id INTO me FROM public.profiles WHERE telegram_user_id = p_telegram_user_id;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT id INTO me FROM public.profiles WHERE auth_user_id = auth.uid();
  ELSE
    PERFORM public.fail('UNAUTHENTICATED');
  END IF;

  IF me IS NULL THEN
    v_handle := COALESCE(inv.handle, public.make_handle());
    IF EXISTS (SELECT 1 FROM public.profiles WHERE handle = v_handle) THEN v_handle := public.make_handle(); END IF;
    INSERT INTO public.profiles(auth_user_id, telegram_user_id, handle, display_name, role, answer)
    VALUES (CASE WHEN p_telegram_user_id IS NULL THEN auth.uid() END, p_telegram_user_id, v_handle, inv.for_display_name, inv.role, inv.answer)
    RETURNING id INTO me;
  END IF;

  UPDATE public.invites SET claimed_by = me, claimed_at = NOW() WHERE code = p_code;

  IF inv.created_by IS NOT NULL AND inv.created_by <> me THEN
    SELECT * INTO k FROM public.pair_key(inv.created_by, me);
    INSERT INTO public.contacts(a, b, requested_by, status) VALUES (k.lo, k.hi, inv.created_by, 'accepted')
    ON CONFLICT (a, b) DO UPDATE SET status = 'accepted', updated_at = NOW();
    paired := inv.created_by;
  END IF;

  PERFORM public.audit('profile:' || me::text, 'invite.claim', p_code);
  RETURN jsonb_build_object('profile_id', me, 'handle', (SELECT handle FROM public.profiles WHERE id = me),
                            'paired_with', paired, 'consent_version', (SELECT consent_version FROM public.profiles WHERE id = me));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.record_consent(p_profile UUID DEFAULT NULL) RETURNS JSONB AS $$
DECLARE me UUID := public.acting_profile(p_profile); v TEXT := public.setting('consent_version');
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  UPDATE public.profiles SET consent_version = v, consent_at = NOW() WHERE id = me;
  PERFORM public.audit('profile:' || me::text, 'consent', v);
  RETURN jsonb_build_object('consent_version', v);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 6. Home, contacts, follows
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_home(p_emotion TEXT, p_color TEXT, p_profile UUID DEFAULT NULL) RETURNS JSONB AS $$
DECLARE me UUID := public.acting_profile(p_profile);
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  IF public.ring_index('emotion', p_emotion) IS NULL OR public.ring_index('color', p_color) IS NULL THEN PERFORM public.fail('INVALID_STATE'); END IF;
  UPDATE public.profiles SET base_emotion = lower(p_emotion), base_color = lower(p_color) WHERE id = me;
  PERFORM public.audit('profile:' || me::text, 'home.set', lower(p_emotion) || '/' || lower(p_color));
  RETURN jsonb_build_object('base_emotion', lower(p_emotion), 'base_color', lower(p_color));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_state(p_emotion TEXT, p_color TEXT, p_felt BOOLEAN DEFAULT FALSE, p_profile UUID DEFAULT NULL) RETURNS JSONB AS $$
DECLARE me UUID := public.acting_profile(p_profile);
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  IF public.ring_index('emotion', p_emotion) IS NULL OR public.ring_index('color', p_color) IS NULL THEN PERFORM public.fail('INVALID_STATE'); END IF;
  IF p_felt THEN UPDATE public.profiles SET felt_emotion = lower(p_emotion), felt_color = lower(p_color) WHERE id = me;
  ELSE UPDATE public.profiles SET emotion = lower(p_emotion), color = lower(p_color) WHERE id = me; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- A participant tells the bot the emotion and color they bring. Writes the expressed
-- (public) state, one part at a time; p_reset clears both stamps so the bot asks again.
-- Service role only: the Worker calls it for a Telegram user.
CREATE OR REPLACE FUNCTION public.declare_state(p_profile UUID, p_emotion TEXT DEFAULT NULL, p_color TEXT DEFAULT NULL, p_reset BOOLEAN DEFAULT FALSE)
RETURNS JSONB AS $$
DECLARE me UUID := public.acting_profile(p_profile); r public.profiles%ROWTYPE;
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  IF p_emotion IS NOT NULL AND public.ring_index('emotion', p_emotion) IS NULL THEN PERFORM public.fail('INVALID_STATE', 'emotion'); END IF;
  IF p_color IS NOT NULL AND public.ring_index('color', p_color) IS NULL THEN PERFORM public.fail('INVALID_STATE', 'color'); END IF;
  IF p_reset THEN UPDATE public.profiles SET emotion_declared_at = NULL, color_declared_at = NULL WHERE id = me; END IF;
  IF p_emotion IS NOT NULL THEN UPDATE public.profiles SET emotion = lower(p_emotion), emotion_declared_at = NOW() WHERE id = me; END IF;
  IF p_color IS NOT NULL THEN UPDATE public.profiles SET color = lower(p_color), color_declared_at = NOW() WHERE id = me; END IF;
  SELECT * INTO r FROM public.profiles WHERE id = me;
  IF NOT FOUND THEN PERFORM public.fail('NOT_FOUND'); END IF;
  PERFORM public.audit('profile:' || me::text, 'state.declare', r.emotion || '/' || r.color);
  RETURN jsonb_build_object('emotion', r.emotion, 'color', r.color,
    'emotionDeclared', r.emotion_declared_at IS NOT NULL, 'colorDeclared', r.color_declared_at IS NOT NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.add_contact(p_handle TEXT) RETURNS JSONB AS $$
DECLARE me UUID := public.my_profile_id(); other UUID; k RECORD; cid UUID;
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  SELECT id INTO other FROM public.profiles WHERE handle = p_handle;
  IF other IS NULL OR other = me THEN PERFORM public.fail('NOT_FOUND'); END IF;
  SELECT * INTO k FROM public.pair_key(me, other);
  INSERT INTO public.contacts(a, b, requested_by) VALUES (k.lo, k.hi, me)
  ON CONFLICT (a, b) DO NOTHING RETURNING id INTO cid;
  RETURN jsonb_build_object('request_id', cid, 'status', 'pending');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.respond_contact(p_request UUID, p_accept BOOLEAN) RETURNS JSONB AS $$
DECLARE me UUID := public.my_profile_id(); c public.contacts%ROWTYPE;
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  SELECT * INTO c FROM public.contacts WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR c.requested_by = me OR (c.a <> me AND c.b <> me) THEN PERFORM public.fail('FORBIDDEN'); END IF;
  UPDATE public.contacts SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'blocked' END WHERE id = p_request;
  RETURN jsonb_build_object('status', CASE WHEN p_accept THEN 'accepted' ELSE 'blocked' END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.toggle_follow(p_handle TEXT) RETURNS JSONB AS $$
DECLARE me UUID := public.my_profile_id(); other UUID; existed BOOLEAN;
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  SELECT id INTO other FROM public.profiles WHERE handle = p_handle;
  IF other IS NULL OR other = me THEN PERFORM public.fail('NOT_FOUND'); END IF;
  DELETE FROM public.follows WHERE follower = me AND followed = other;
  existed := FOUND;
  IF NOT existed THEN INSERT INTO public.follows(follower, followed) VALUES (me, other); END IF;
  RETURN jsonb_build_object('following', NOT existed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 7. Exchanges: the private channel. Service role (the Worker) only.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_exchange(p_a UUID, p_b UUID, p_channel TEXT) RETURNS UUID AS $$
DECLARE x UUID; pa public.profiles%ROWTYPE; pb public.profiles%ROWTYPE;
BEGIN
  IF p_a = p_b THEN PERFORM public.fail('INVALID_EXCHANGE'); END IF;
  SELECT * INTO pa FROM public.profiles WHERE id = p_a; SELECT * INTO pb FROM public.profiles WHERE id = p_b;
  IF pa.id IS NULL OR pb.id IS NULL THEN PERFORM public.fail('NOT_FOUND'); END IF;
  IF pa.consent_at IS NULL OR pb.consent_at IS NULL THEN PERFORM public.fail('CONSENT_MISSING'); END IF;
  IF pa.stopped_at IS NOT NULL OR pb.stopped_at IS NOT NULL THEN PERFORM public.fail('BLOCKED'); END IF;
  IF NOT public.are_contacts(p_a, p_b) THEN PERFORM public.fail('NOT_CONTACT'); END IF;
  -- one open exchange per pair
  SELECT id INTO x FROM public.exchanges WHERE status = 'open' AND participants @> ARRAY[p_a, p_b] AND participants <@ ARRAY[p_a, p_b];
  IF x IS NOT NULL THEN RETURN x; END IF;
  INSERT INTO public.exchanges(channel, participants, consent)
  VALUES (p_channel, ARRAY[p_a, p_b], jsonb_build_object(
    p_a::text, jsonb_build_object('version', pa.consent_version, 'acceptedAt', pa.consent_at),
    p_b::text, jsonb_build_object('version', pb.consent_version, 'acceptedAt', pb.consent_at)))
  RETURNING id INTO x;
  PERFORM public.audit('system', 'exchange.open', x::text);
  RETURN x;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.append_message(p_exchange UUID, p_from UUID, p_text TEXT, p_witness TEXT DEFAULT 'self_wrote') RETURNS BIGINT AS $$
DECLARE x public.exchanges%ROWTYPE; mid BIGINT;
BEGIN
  SELECT * INTO x FROM public.exchanges WHERE id = p_exchange FOR UPDATE;
  IF NOT FOUND OR x.status <> 'open' THEN PERFORM public.fail('EXCHANGE_CLOSED'); END IF;
  IF NOT (p_from = ANY (x.participants)) THEN PERFORM public.fail('FORBIDDEN'); END IF;
  INSERT INTO public.messages(exchange_id, from_profile, text, witness) VALUES (p_exchange, p_from, p_text, p_witness) RETURNING id INTO mid;
  UPDATE public.exchanges SET last_message_at = NOW() WHERE id = p_exchange;
  RETURN mid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Closes and hands the bundle to the pipeline. The bundle is the only place the words leave the table.
CREATE OR REPLACE FUNCTION public.close_exchange(p_exchange UUID) RETURNS JSONB AS $$
DECLARE x public.exchanges%ROWTYPE;
BEGIN
  SELECT * INTO x FROM public.exchanges WHERE id = p_exchange FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.fail('NOT_FOUND'); END IF;
  IF x.status = 'open' THEN
    UPDATE public.exchanges SET status = 'closed', closed_at = NOW() WHERE id = p_exchange;
  END IF;
  PERFORM public.audit('system', 'exchange.close', p_exchange::text);
  RETURN public.exchange_bundle(p_exchange);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.exchange_bundle(p_exchange UUID) RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'id', x.id, 'channel', x.channel, 'status', x.status, 'at', x.closed_at,
    'participants', (SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.display_name, 'pseudonym', p.handle,
        'emotion', p.emotion, 'color', p.color, 'style', p.style,
        'consent', x.consent -> p.id::text) ORDER BY array_position(x.participants, p.id))
      FROM public.profiles p WHERE p.id = ANY (x.participants)),
    'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('from', m.from_profile, 'text', m.text, 'witness', m.witness, 'at', m.created_at) ORDER BY m.id)
      FROM public.messages m WHERE m.exchange_id = x.id), '[]'::jsonb))
  FROM public.exchanges x WHERE x.id = p_exchange;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.mark_exchange_failed(p_exchange UUID, p_code TEXT) RETURNS VOID AS $$
  UPDATE public.exchanges SET status = 'failed', error_code = p_code, attempts = attempts + 1 WHERE id = p_exchange;
  SELECT public.audit('system', 'exchange.failed', p_exchange::text || ':' || p_code);
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.stop_profile(p_profile UUID) RETURNS VOID AS $$
DECLARE me UUID := public.acting_profile(p_profile);
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  UPDATE public.profiles SET stopped_at = NOW() WHERE id = me;
  UPDATE public.exchanges SET status = 'closed', closed_at = NOW() WHERE status = 'open' AND me = ANY (participants);
  PERFORM public.audit('profile:' || me::text, 'stop', NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 8. The wall
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_post(p_card JSONB) RETURNS UUID AS $$
DECLARE e INT; c INT; mem NUMERIC[] := array_fill(0::NUMERIC, ARRAY[64]); pid UUID; xid UUID; w NUMERIC := public.setting('publish_weight')::NUMERIC;
BEGIN
  e := public.ring_index('emotion', p_card->>'emotion'); c := public.ring_index('color', p_card->>'color');
  IF e IS NULL OR c IS NULL THEN PERFORM public.fail('INVALID_STATE'); END IF;
  IF COALESCE(p_card->>'paraphrase', '') = '' THEN PERFORM public.fail('INVALID_CARD', 'paraphrase'); END IF;
  xid := NULLIF(p_card->'provenance'->>'exchangeId', '')::uuid;
  mem[1 + e * 8 + c] := w;
  INSERT INTO public.posts(exchange_id, pseudonyms, title, body, seed, image_url, initial_emotion, initial_color, emotion, color,
                           intensity, confidence, memory, provenance)
  VALUES (xid, ARRAY(SELECT jsonb_array_elements_text(p_card->'pseudonyms')), p_card->>'title', p_card->>'paraphrase',
          p_card->>'seed', p_card->>'imageUrl', (public.ring_names('emotion'))[e+1], (public.ring_names('color'))[c+1],
          (public.ring_names('emotion'))[e+1], (public.ring_names('color'))[c+1],
          COALESCE((p_card->>'intensity')::NUMERIC, 1.0), COALESCE((p_card->>'confidence')::NUMERIC, 1.0),
          mem, COALESCE(p_card->'provenance', '{}'::jsonb))
  RETURNING id INTO pid;
  IF xid IS NOT NULL THEN UPDATE public.exchanges SET status = 'published' WHERE id = xid; END IF;
  PERFORM public.audit('system', 'post.publish', pid::text);
  RETURN pid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_post_image(p_post UUID, p_url TEXT) RETURNS VOID AS $$
  UPDATE public.posts SET image_url = p_url WHERE id = p_post;
$$ LANGUAGE sql SECURITY DEFINER;

-- trigger: the post moves one step toward the actor, through decaying memory.
-- brace: the post's original cell gains weight, by the actor's resonance to it.
CREATE OR REPLACE FUNCTION public.react_to_post(p_post UUID, p_kind TEXT, p_emotion TEXT, p_color TEXT, p_text TEXT DEFAULT NULL, p_api_key TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  lam NUMERIC := public.setting('memory_lambda')::NUMERIC; beta NUMERIC := public.setting('brace_beta')::NUMERIC;
  c public.posts%ROWTYPE; lim RECORD; v_actor TEXT; actor_pid UUID;
  ae INT; ac INT; ce INT; cc INT; ie INT; ic INT; ne INT; nc INT; mem NUMERIC[]; i INT; best INT; rho NUMERIC;
BEGIN
  IF p_kind NOT IN ('trigger', 'brace') THEN PERFORM public.fail('INVALID_KIND'); END IF;
  ae := public.ring_index('emotion', p_emotion); ac := public.ring_index('color', p_color);
  IF ae IS NULL OR ac IS NULL THEN PERFORM public.fail('INVALID_STATE'); END IF;

  IF p_api_key IS NOT NULL THEN
    actor_pid := public.authenticate_agent(p_api_key); v_actor := 'agent:' || actor_pid::text;
  ELSE
    actor_pid := public.my_profile_id(); v_actor := public.client_key();
  END IF;
  SELECT * INTO lim FROM public.rate_limit_check('react', 30, p_key => v_actor);
  IF NOT lim.allowed THEN PERFORM public.fail('RATE_LIMITED', lim.retry_after_seconds::text); END IF;

  SELECT * INTO c FROM public.posts WHERE id = p_post AND withdrawn_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.fail('NOT_FOUND'); END IF;
  ce := public.ring_index('emotion', c.emotion); cc := public.ring_index('color', c.color);
  ie := public.ring_index('emotion', c.initial_emotion); ic := public.ring_index('color', c.initial_color);
  mem := c.memory;
  FOR i IN 1..64 LOOP mem[i] := mem[i] * lam; END LOOP;

  IF p_kind = 'trigger' THEN
    ne := public.ring_step(ce, ae); nc := public.ring_step(cc, ac);
    mem[1 + ne * 8 + nc] := mem[1 + ne * 8 + nc] + 1;
  ELSE
    IF EXISTS (SELECT 1 FROM public.braces b WHERE b.post_id = p_post AND b.actor = encode(digest(v_actor, 'sha256'), 'hex')) THEN
      PERFORM public.fail('ALREADY_BRACED');
    END IF;
    rho := public.ring_rho(ae, ac, ie, ic);
    mem[1 + ie * 8 + ic] := mem[1 + ie * 8 + ic] + beta * rho;
  END IF;

  best := 1 + ce * 8 + cc;
  FOR i IN 1..64 LOOP IF mem[i] > mem[best] THEN best := i; END IF; END LOOP;
  ne := (best - 1) / 8; nc := (best - 1) % 8;

  UPDATE public.posts SET memory = mem,
    emotion = (public.ring_names('emotion'))[ne + 1], color = (public.ring_names('color'))[nc + 1],
    reactions = reactions + CASE WHEN p_kind = 'trigger' THEN 1 ELSE 0 END,
    braces = braces + CASE WHEN p_kind = 'brace' THEN 1 ELSE 0 END
  WHERE id = p_post;

  IF p_kind = 'trigger' THEN
    INSERT INTO public.comments(post_id, actor, actor_profile, actor_emotion, actor_color, text, before_emotion, before_color, after_emotion, after_color)
    VALUES (p_post, encode(digest(v_actor, 'sha256'), 'hex'), actor_pid, lower(p_emotion), lower(p_color), p_text,
            c.emotion, c.color, (public.ring_names('emotion'))[ne + 1], (public.ring_names('color'))[nc + 1]);
  ELSE
    INSERT INTO public.braces(post_id, actor, actor_profile) VALUES (p_post, encode(digest(v_actor, 'sha256'), 'hex'), actor_pid);
  END IF;

  RETURN jsonb_build_object('post_id', p_post, 'kind', p_kind,
    'before', jsonb_build_object('emotion', c.emotion, 'color', c.color),
    'after', jsonb_build_object('emotion', (public.ring_names('emotion'))[ne + 1], 'color', (public.ring_names('color'))[nc + 1]));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The feed: visitor declares a state, sees by resonance above epsilon, with a crack of pi.
CREATE OR REPLACE FUNCTION public.get_feed(p_emotion TEXT, p_color TEXT, p_limit INT DEFAULT 30, p_before TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE(id UUID, pseudonyms TEXT[], title TEXT, body TEXT, image_url TEXT, emotion TEXT, color TEXT,
              initial_emotion TEXT, initial_color TEXT, reactions INT, braces INT, created_at TIMESTAMPTZ, score NUMERIC) AS $$
DECLARE ve INT := public.ring_index('emotion', p_emotion); vc INT := public.ring_index('color', p_color);
        eps NUMERIC := public.setting('feed_epsilon')::NUMERIC; pi NUMERIC := public.setting('feed_pi')::NUMERIC; alpha NUMERIC := public.setting('feed_alpha')::NUMERIC;
BEGIN
  IF ve IS NULL OR vc IS NULL THEN PERFORM public.fail('INVALID_STATE'); END IF;
  RETURN QUERY
  SELECT p.id, p.pseudonyms, p.title, p.body, p.image_url, p.emotion, p.color, p.initial_emotion, p.initial_color, p.reactions, p.braces, p.created_at,
         (alpha * public.ring_rho(ve, vc, public.ring_index('emotion', p.initial_emotion), public.ring_index('color', p.initial_color))
          + (1 - alpha) * public.ring_rho(ve, vc, public.ring_index('emotion', p.emotion), public.ring_index('color', p.color))
          + 0.1 * ln(1 + p.braces))::NUMERIC AS score
  FROM public.posts p
  WHERE p.withdrawn_at IS NULL
    AND (p_before IS NULL OR p.created_at < p_before)
    AND (public.ring_rho(ve, vc, public.ring_index('emotion', p.initial_emotion), public.ring_index('color', p.initial_color)) >= eps
         OR random() < pi)
  ORDER BY 13 DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.withdraw_post(p_post UUID, p_profile UUID DEFAULT NULL) RETURNS BOOLEAN AS $$
DECLARE me UUID := public.acting_profile(p_profile); x UUID;
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  SELECT exchange_id INTO x FROM public.posts WHERE id = p_post;
  IF x IS NULL OR NOT EXISTS (SELECT 1 FROM public.exchanges WHERE id = x AND me = ANY (participants)) THEN PERFORM public.fail('FORBIDDEN'); END IF;
  UPDATE public.posts SET withdrawn_at = NOW(), body = '', title = NULL, seed = NULL, image_url = NULL, content = NULL WHERE id = p_post AND withdrawn_at IS NULL;
  UPDATE public.exchanges SET status = 'withdrawn' WHERE id = x;
  PERFORM public.audit('profile:' || me::text, 'post.withdraw', p_post::text);
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 9. Agents
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_agent(p_name TEXT, p_emotion TEXT, p_color TEXT, p_owner UUID DEFAULT NULL) RETURNS JSONB AS $$
DECLARE owner UUID := public.acting_profile(p_owner); aid UUID; key TEXT; h TEXT;
BEGIN
  IF owner IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  IF public.ring_index('emotion', p_emotion) IS NULL OR public.ring_index('color', p_color) IS NULL THEN PERFORM public.fail('INVALID_STATE'); END IF;
  h := public.make_handle();
  INSERT INTO public.profiles(kind, handle, display_name, owner_profile_id, base_emotion, base_color, felt_emotion, felt_color, emotion, color,
                              consent_version, consent_at)
  VALUES ('agent', h, p_name, owner, lower(p_emotion), lower(p_color), lower(p_emotion), lower(p_color), lower(p_emotion), lower(p_color),
          public.setting('consent_version'), NOW())
  RETURNING id INTO aid;
  key := 'em2_sk_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.agent_keys(profile_id, key_hash, prefix) VALUES (aid, encode(digest(key, 'sha256'), 'hex'), substr(key, 1, 12));
  PERFORM public.audit('profile:' || owner::text, 'agent.create', aid::text);
  RETURN jsonb_build_object('agent_id', aid, 'handle', h, 'api_key', key, 'note', 'The key is shown once. We store only its hash.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.authenticate_agent(p_key TEXT) RETURNS UUID AS $$
DECLARE pid UUID;
BEGIN
  SELECT profile_id INTO pid FROM public.agent_keys WHERE key_hash = encode(digest(COALESCE(p_key, ''), 'sha256'), 'hex') AND revoked_at IS NULL;
  IF pid IS NULL THEN PERFORM public.fail('UNAUTHENTICATED', 'agent'); END IF;
  UPDATE public.agent_keys SET last_used_at = NOW() WHERE profile_id = pid AND revoked_at IS NULL;
  RETURN pid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.revoke_agent_key(p_agent UUID) RETURNS VOID AS $$
DECLARE me UUID := public.my_profile_id();
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  UPDATE public.agent_keys SET revoked_at = NOW() WHERE profile_id = p_agent AND revoked_at IS NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_agent AND owner_profile_id = me);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -----------------------------------------------------------------------------
-- 9b. Me: preferences, my agents, leaving
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_preferences(p_style TEXT DEFAULT NULL, p_accept_from TEXT DEFAULT NULL) RETURNS JSONB AS $$
DECLARE me UUID := public.my_profile_id();
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  IF p_style IS NOT NULL AND p_style NOT IN ('watercolor', 'comic', 'pixel', 'sketch', 'abstract') THEN PERFORM public.fail('INVALID_STYLE'); END IF;
  IF p_accept_from IS NOT NULL AND p_accept_from NOT IN ('contacts', 'anyone', 'nobody') THEN PERFORM public.fail('INVALID_SETTING'); END IF;
  UPDATE public.profiles SET style = COALESCE(p_style, style), accept_from = COALESCE(p_accept_from, accept_from) WHERE id = me;
  RETURN jsonb_build_object('style', (SELECT style FROM public.profiles WHERE id = me), 'accept_from', (SELECT accept_from FROM public.profiles WHERE id = me));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.my_agents()
RETURNS TABLE(id UUID, handle TEXT, emotion TEXT, color TEXT, key_prefix TEXT, revoked BOOLEAN, last_used_at TIMESTAMPTZ, created_at TIMESTAMPTZ) AS $$
  SELECT p.id, p.handle, p.emotion, p.color, k.prefix, k.revoked_at IS NOT NULL, k.last_used_at, p.created_at
  FROM public.profiles p LEFT JOIN public.agent_keys k ON k.profile_id = p.id
  WHERE p.kind = 'agent' AND p.owner_profile_id = public.my_profile_id()
  ORDER BY p.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Leaving: withdraw every post of mine, then delete the profile. Posts keep
-- their withdrawn row (no content); the audit log keeps the id.
CREATE OR REPLACE FUNCTION public.delete_my_profile() RETURNS BOOLEAN AS $$
DECLARE me UUID := public.my_profile_id(); r RECORD;
BEGIN
  IF me IS NULL THEN PERFORM public.fail('UNAUTHENTICATED'); END IF;
  FOR r IN SELECT p.id FROM public.posts p JOIN public.exchanges x ON x.id = p.exchange_id WHERE me = ANY (x.participants) AND p.withdrawn_at IS NULL LOOP
    PERFORM public.withdraw_post(r.id, me);
  END LOOP;
  UPDATE public.agent_keys SET revoked_at = NOW() WHERE profile_id IN (SELECT id FROM public.profiles WHERE owner_profile_id = me) AND revoked_at IS NULL;
  PERFORM public.audit('profile:' || me::text, 'profile.delete', NULL);
  DELETE FROM public.profiles WHERE id = me;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 10. Views for the public
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT id, handle, kind, emotion, color, created_at FROM public.profiles WHERE stopped_at IS NULL;

CREATE OR REPLACE VIEW public.post_trail AS
  SELECT c.id, c.post_id, c.actor_emotion, c.actor_color, c.text, c.before_emotion, c.before_color, c.after_emotion, c.after_color, c.created_at
  FROM public.comments c JOIN public.posts p ON p.id = c.post_id WHERE p.withdrawn_at IS NULL;

-- -----------------------------------------------------------------------------
-- 11. Row level security
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.braces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self ON public.profiles;
CREATE POLICY profiles_self ON public.profiles FOR SELECT USING (auth_user_id = auth.uid());
DROP POLICY IF EXISTS contacts_mine ON public.contacts;
CREATE POLICY contacts_mine ON public.contacts FOR SELECT USING (a = public.my_profile_id() OR b = public.my_profile_id());
DROP POLICY IF EXISTS exchanges_mine ON public.exchanges;
CREATE POLICY exchanges_mine ON public.exchanges FOR SELECT USING (public.my_profile_id() = ANY (participants));
DROP POLICY IF EXISTS messages_mine ON public.messages;
CREATE POLICY messages_mine ON public.messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.exchanges x WHERE x.id = exchange_id AND public.my_profile_id() = ANY (x.participants)));
DROP POLICY IF EXISTS posts_public ON public.posts;
CREATE POLICY posts_public ON public.posts FOR SELECT USING (withdrawn_at IS NULL);
DROP POLICY IF EXISTS comments_public ON public.comments;
CREATE POLICY comments_public ON public.comments FOR SELECT USING (true);
DROP POLICY IF EXISTS braces_public ON public.braces;
CREATE POLICY braces_public ON public.braces FOR SELECT USING (true);
DROP POLICY IF EXISTS follows_public ON public.follows;
CREATE POLICY follows_public ON public.follows FOR SELECT USING (true);
DROP POLICY IF EXISTS settings_public ON public.app_settings;
CREATE POLICY settings_public ON public.app_settings FOR SELECT USING (true);
-- invites, agent_keys, rate_limits, audit_log: no policies. Functions only.

-- Column-level: the public never selects private columns of profiles directly.
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, handle, kind, emotion, color, created_at, role, base_emotion, base_color, felt_emotion, felt_color, style, accept_from, consent_version, consent_at, stopped_at)
  ON public.profiles TO authenticated;   -- RLS restricts rows to self
GRANT SELECT ON public.public_profiles, public.post_trail, public.posts, public.comments, public.braces, public.follows, public.app_settings TO anon, authenticated;
GRANT SELECT ON public.contacts, public.exchanges, public.messages TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- -----------------------------------------------------------------------------
-- 12. Function grants: who may call what
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ring_names(TEXT), public.ring_index(TEXT, TEXT), public.ring_d8(INT, INT), public.ring_step(INT, INT), public.ring_rho(INT, INT, INT, INT), public.setting(TEXT), public.telegram_link(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invite(TEXT, TEXT, TEXT), public.peek_invite(TEXT), public.react_to_post(UUID, TEXT, TEXT, TEXT, TEXT, TEXT), public.get_feed(TEXT, TEXT, INT, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invite(TEXT, BIGINT), public.record_consent(UUID), public.set_home(TEXT, TEXT, UUID), public.set_state(TEXT, TEXT, BOOLEAN, UUID),
  public.add_contact(TEXT), public.respond_contact(UUID, BOOLEAN), public.toggle_follow(TEXT), public.withdraw_post(UUID, UUID),
  public.create_agent(TEXT, TEXT, TEXT, UUID), public.revoke_agent_key(UUID), public.create_pair_invite(UUID), public.my_profile_id(),
  public.update_preferences(TEXT, TEXT), public.my_agents(), public.delete_my_profile() TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- -----------------------------------------------------------------------------
-- 13. Supabase-only extras, guarded
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.posts; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.comments; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.braces; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('post-images', 'post-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
    -- public read; writes only by the service role (the Worker), no policy for anon/authenticated
    BEGIN
      CREATE POLICY "post images are public" ON storage.objects FOR SELECT USING (bucket_id = 'post-images');
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

COMMENT ON TABLE public.profiles IS 'One identity per entity. base_* is the home (owner only), felt_* is private, emotion/color is public.';
COMMENT ON TABLE public.messages IS 'The words. Participants and the pipeline only. Never on the wall.';
COMMENT ON TABLE public.posts IS 'The wall. body is the paraphrase, never the words. memory is 64 decaying cells.';
COMMENT ON TABLE public.audit_log IS 'Ids and actions only. Never content.';
