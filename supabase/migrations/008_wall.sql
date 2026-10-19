-- 008_wall.sql
-- The wall: cards that came out of exchangeToWallCard, and the audience's
-- reactions to them. The ring math from src/core/ring.js is repeated here in
-- SQL so that a reaction is computed where the data lives, and so that an
-- agent with an API key and a visitor in a browser go through the same door.

CREATE TABLE IF NOT EXISTS public.wall_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id TEXT NOT NULL UNIQUE,
  pseudonyms TEXT[] NOT NULL CHECK (array_length(pseudonyms, 1) >= 2),
  initial_emotion TEXT NOT NULL CHECK (initial_emotion IN ('joy','trust','feared','surprised','sad','disgust','angry','anticipated')),
  initial_color   TEXT NOT NULL CHECK (initial_color IN ('yellow','lime','green','aqua','blue','pink','red','orange')),
  emotion TEXT NOT NULL,
  color TEXT NOT NULL,
  paraphrase TEXT NOT NULL,
  seed TEXT,
  image_url TEXT,
  memory NUMERIC[] NOT NULL,                    -- 64 cells, index = e*8 + c
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  reactions INT NOT NULL DEFAULT 0,
  braces INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wall_cards_created_idx ON public.wall_cards(created_at DESC) WHERE withdrawn_at IS NULL;

CREATE TABLE IF NOT EXISTS public.wall_reactions (
  id BIGSERIAL PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.wall_cards(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('trigger', 'brace')),
  actor TEXT NOT NULL,                          -- 'uid:..', 'agent:..' or 'ip:..' (hashed below)
  actor_emotion TEXT NOT NULL,
  actor_color TEXT NOT NULL,
  before_emotion TEXT NOT NULL, before_color TEXT NOT NULL,
  after_emotion TEXT NOT NULL,  after_color TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wall_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wall_reactions ENABLE ROW LEVEL SECURITY;

-- The wall is public to read. Withdrawn cards vanish from it.
CREATE POLICY "Wall is public" ON public.wall_cards FOR SELECT USING (withdrawn_at IS NULL);
-- Nobody inserts cards from a client. The publisher (Hermes) uses the service role.
-- Reactions are written only through wall_react below.
CREATE POLICY "Reactions are public" ON public.wall_reactions FOR SELECT USING (true);

-- ---- ring math, mirrored from src/core/ring.js ----
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

-- One step from a toward b on the shortest arc; clockwise at distance 4.
CREATE OR REPLACE FUNCTION public.ring_step(a INT, b INT) RETURNS INT AS $$
  SELECT CASE
    WHEN a = b THEN a
    WHEN ((b - a + 8) % 8) <= 4 THEN (a + 1) % 8
    ELSE (a + 7) % 8 END;
$$ LANGUAGE sql IMMUTABLE;

-- ---- the audience's two verbs ----
-- trigger: the card moves one step toward the actor, through memory with decay
-- brace:   the card's original cell gains weight, scaled by the actor's resonance to it
CREATE OR REPLACE FUNCTION public.wall_react(
  p_card_id UUID,
  p_kind TEXT,
  p_emotion TEXT,
  p_color TEXT,
  p_api_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  lam CONSTANT NUMERIC := 0.9;     -- memory decay
  beta CONSTANT NUMERIC := 1.0;    -- brace strength
  c public.wall_cards%ROWTYPE;
  lim RECORD;
  actor TEXT;
  ae INT; ac INT;                  -- actor indices
  ce INT; cc INT;                  -- current card indices
  ie INT; ic INT;                  -- initial indices
  ne INT; nc INT;                  -- proposed
  mem NUMERIC[];
  i INT; best INT := 0;
  rho NUMERIC;
BEGIN
  IF p_kind NOT IN ('trigger', 'brace') THEN RAISE EXCEPTION 'INVALID_KIND' USING ERRCODE = 'P0001'; END IF;
  ae := public.ring_index('emotion', p_emotion);
  ac := public.ring_index('color', p_color);
  IF ae IS NULL OR ac IS NULL THEN RAISE EXCEPTION 'INVALID_STATE' USING ERRCODE = 'P0001'; END IF;

  -- Who is acting: an agent by key, a user by uid, or a visitor by hashed ip.
  IF p_api_key IS NOT NULL THEN
    actor := 'agent:' || public.authenticate_agent(p_api_key)::text;
  ELSE
    actor := public.client_key();
  END IF;

  SELECT * INTO lim FROM public.rate_limit_check('react', 30, INTERVAL '10 minutes', INTERVAL '1 minute');
  IF NOT lim.allowed THEN RAISE EXCEPTION 'RATE_LIMITED:%', lim.retry_after_seconds USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO c FROM public.wall_cards WHERE id = p_card_id AND withdrawn_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  ce := public.ring_index('emotion', c.emotion); cc := public.ring_index('color', c.color);
  ie := public.ring_index('emotion', c.initial_emotion); ic := public.ring_index('color', c.initial_color);
  mem := c.memory;

  -- decay everything
  FOR i IN 1..64 LOOP mem[i] := mem[i] * lam; END LOOP;

  IF p_kind = 'trigger' THEN
    ne := public.ring_step(ce, ae); nc := public.ring_step(cc, ac);
    mem[1 + ne * 8 + nc] := mem[1 + ne * 8 + nc] + 1;
  ELSE
    rho := 1 - (public.ring_d8(ae, ie) + public.ring_d8(ac, ic))::NUMERIC / 8;
    mem[1 + ie * 8 + ic] := mem[1 + ie * 8 + ic] + beta * rho;
  END IF;

  -- displayed state = heaviest cell; ties keep the current cell
  best := 1 + ce * 8 + cc;
  FOR i IN 1..64 LOOP
    IF mem[i] > mem[best] THEN best := i; END IF;
  END LOOP;
  ne := (best - 1) / 8; nc := (best - 1) % 8;

  UPDATE public.wall_cards
     SET memory = mem,
         emotion = (public.ring_names('emotion'))[ne + 1],
         color   = (public.ring_names('color'))[nc + 1],
         reactions = reactions + CASE WHEN p_kind = 'trigger' THEN 1 ELSE 0 END,
         braces    = braces    + CASE WHEN p_kind = 'brace'   THEN 1 ELSE 0 END
   WHERE id = p_card_id;

  INSERT INTO public.wall_reactions(card_id, kind, actor, actor_emotion, actor_color,
                                    before_emotion, before_color, after_emotion, after_color)
  VALUES (p_card_id, p_kind, encode(digest(actor, 'sha256'), 'hex'), lower(p_emotion), lower(p_color),
          c.emotion, c.color, (public.ring_names('emotion'))[ne + 1], (public.ring_names('color'))[nc + 1]);

  RETURN jsonb_build_object(
    'card_id', p_card_id, 'kind', p_kind,
    'before', jsonb_build_object('emotion', c.emotion, 'color', c.color),
    'after',  jsonb_build_object('emotion', (public.ring_names('emotion'))[ne + 1], 'color', (public.ring_names('color'))[nc + 1])
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Publisher entry point: used by Hermes with the service role. Builds the
-- initial memory with the publisher's weight on the assigned cell.
CREATE OR REPLACE FUNCTION public.wall_publish(p_card JSONB, p_initial_weight NUMERIC DEFAULT 3)
RETURNS UUID AS $$
DECLARE
  e INT := public.ring_index('emotion', p_card->>'emotion');
  c INT := public.ring_index('color', p_card->>'color');
  mem NUMERIC[] := array_fill(0::NUMERIC, ARRAY[64]);
  new_id UUID;
BEGIN
  IF e IS NULL OR c IS NULL THEN RAISE EXCEPTION 'INVALID_STATE' USING ERRCODE = 'P0001'; END IF;
  mem[1 + e * 8 + c] := p_initial_weight;
  INSERT INTO public.wall_cards(exchange_id, pseudonyms, initial_emotion, initial_color, emotion, color,
                                paraphrase, seed, image_url, memory, provenance)
  VALUES (
    p_card->>'exchangeId',
    ARRAY(SELECT jsonb_array_elements_text(p_card->'pseudonyms')),
    lower(p_card->>'emotion'), lower(p_card->>'color'),
    lower(p_card->>'emotion'), lower(p_card->>'color'),
    p_card->>'paraphrase', p_card->>'seed', p_card->>'imageUrl',
    mem, COALESCE(p_card->'provenance', '{}'::jsonb)
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Withdrawal: a participant pulls a card. Content goes; the fact that a card
-- existed stays, with no content.
CREATE OR REPLACE FUNCTION public.wall_withdraw(p_card_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.wall_cards
     SET withdrawn_at = NOW(), paraphrase = '', seed = NULL, image_url = NULL
   WHERE id = p_card_id AND withdrawn_at IS NULL;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.wall_react(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.wall_publish(JSONB, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wall_withdraw(UUID) FROM PUBLIC, anon, authenticated;
