-- =============================================================================
-- CI only: make a plain PostgreSQL database look like Supabase where it matters
-- for schema.sql, so the schema job catches what only shows up on Supabase.
--
-- Copied from supabase/postgres migrations/db/init-scripts/
--   00000000000000-initial-schema.sql (extensions schema, default privileges)
--   00000000000003-post-setup.sql     (postgres's search_path)
--
-- 1. pgcrypto lives in schema `extensions`, not public. A function that relies on
--    the caller's search_path to find digest() or gen_random_bytes() then fails
--    when PostgREST calls it with search_path = public.
-- 2. Default privileges grant anon, authenticated and service_role ALL on every new
--    table, view, sequence and function in public. schema.sql must revoke them.
--
-- Apply as the role that will then apply schema.sql (postgres), before schema.sql,
-- on an empty database. Idempotent.
-- =============================================================================
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pgcrypto into extensions if an earlier step put it in public.
DO $$
DECLARE s TEXT;
BEGIN
  SELECT n.nspname INTO s FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';
  IF s IS NULL THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  ELSIF s <> 'extensions' THEN
    ALTER EXTENSION pgcrypto SET SCHEMA extensions;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Supabase: alter default privileges in schema public grant all on ... to postgres, anon, authenticated, service_role
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- Supabase: ALTER ROLE postgres SET search_path TO "$user",public,extensions. Scoped to
-- this database here so a shared CI cluster is not changed. Takes effect on the next
-- connection, which is how schema.sql is applied (a new psql run).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path TO "$user", public, extensions', current_database());
END $$;
