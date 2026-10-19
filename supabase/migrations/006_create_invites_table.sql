-- 006_create_invites_table.sql
-- The door of the exhibit. One row per person who typed a name on the home
-- page. The name they typed stays here and never reaches the wall; the
-- pseudonym is what the system calls them from now on.

CREATE TABLE IF NOT EXISTS public.invites (
  code TEXT PRIMARY KEY CHECK (char_length(code) = 22),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 50),
  pseudonym TEXT NOT NULL,
  answer TEXT NOT NULL CHECK (answer IN ('trust_signal', 'amplifier_shapes')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_by UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS invites_expires_at_idx ON public.invites(expires_at);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Anyone at the door may create an invite. Rate limiting is the server's job,
-- not the database's; until the Worker exists this is open and that is known.
CREATE POLICY "Anyone can create an invite"
  ON public.invites FOR INSERT
  WITH CHECK (expires_at <= NOW() + INTERVAL '8 days' AND claimed_at IS NULL AND claimed_by IS NULL);

-- The code is the capability: 22 random characters. Whoever holds it may read
-- the row, and nothing in the row identifies the person except display_name,
-- which the /join page never shows.
CREATE POLICY "Holder of the code can read the invite"
  ON public.invites FOR SELECT
  USING (true);

COMMENT ON TABLE public.invites IS 'Exhibit door: typed name, assigned pseudonym, answer to the question';
COMMENT ON COLUMN public.invites.display_name IS 'What the visitor typed. Never shown on the wall or on /join';
COMMENT ON COLUMN public.invites.pseudonym IS 'What the system calls them. Not derived from display_name';
COMMENT ON COLUMN public.invites.answer IS 'First datapoint the system keeps: trust_signal or amplifier_shapes';
