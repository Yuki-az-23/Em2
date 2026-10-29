-- Local demo only. PostgREST logs in as `authenticator` and switches to the
-- role in each request's JWT (anon or service_role), as Supabase does.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'authenticator-demo';
  END IF;
END $$;
GRANT anon, authenticated, service_role TO authenticator;
UPDATE public.app_settings SET value = 'HermesDemoBot', updated_at = NOW() WHERE key = 'telegram_bot';
