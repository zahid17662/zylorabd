-- Product photos/videos live in Supabase Storage: a public bucket `media` (anyone may view), where only a password-signed-in
-- admin may add files under products/. The bucket itself limits the size (15 MB) and the file types.
-- Every step is guarded: on a database without Supabase Storage this does nothing, and a failure here must never
-- stop the API from starting.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('media', 'media', true, 15728640, ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
    ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 15728640, allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'media bucket not created: %', SQLERRM;
END $$;

-- @@
CREATE OR REPLACE FUNCTION public.is_admin_session() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT public.zy_is_admin() $$;

-- @@
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.is_admin_session() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.is_admin_session() TO authenticated;
  END IF;
END $$;

-- @@
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS zy_media_admin_upload ON storage.objects';
    EXECUTE $p$CREATE POLICY zy_media_admin_upload ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'media' AND name LIKE 'products/%' AND public.is_admin_session())$p$;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'media upload policy not created: %', SQLERRM;
END $$;
