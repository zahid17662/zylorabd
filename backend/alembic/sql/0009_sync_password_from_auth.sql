-- A password changed in Supabase Auth (the storefront/admin "change password" now talks to it directly) is copied
-- to public.users, so the API sign-in keeps accepting the same password. Alembic 0005's mirror covers the other
-- direction. Both hashes are bcrypt.
CREATE OR REPLACE FUNCTION public.zy_sync_password_from_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(NEW.encrypted_password, '') <> '' AND NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    UPDATE public.users SET password_hash = NEW.encrypted_password
      WHERE id = NEW.id AND password_hash IS DISTINCT FROM NEW.encrypted_password;
  END IF;
  RETURN NEW;
END $$;

-- @@
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS zy_sync_password ON auth.users';
    EXECUTE 'CREATE TRIGGER zy_sync_password AFTER UPDATE OF encrypted_password ON auth.users
             FOR EACH ROW EXECUTE FUNCTION public.zy_sync_password_from_auth()';
  END IF;
END $$;
