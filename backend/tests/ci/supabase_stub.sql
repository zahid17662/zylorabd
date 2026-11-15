-- Stand-in for the few Supabase pieces the Alembic migrations rely on, so they can run on a plain Postgres
-- container (GitHub Actions). NEVER run this against a real Supabase project: it already has all of this.
--   - roles anon / authenticated (the migrations GRANT to them when 'anon' exists)
--   - auth.uid() / auth.jwt(), which read the same request settings Supabase's PostgREST sets, so a test can
--     act as a signed-in user with:  SELECT set_config('request.jwt.claim.sub', '<uuid>', true);
-- Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated;
