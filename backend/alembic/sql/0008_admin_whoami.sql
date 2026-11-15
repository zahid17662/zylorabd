-- Used by the media-presign Edge Function to check that the caller is a password-signed-in admin.
CREATE OR REPLACE FUNCTION public.admin_whoami() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.zy_require_admin();
  RETURN true;
END $$;

-- @@
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.admin_whoami() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_whoami() TO authenticated;
  END IF;
END $$;
