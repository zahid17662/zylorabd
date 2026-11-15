-- The signed-in user's own profile {id,name,email,phone,role} for the storefront and admin guard, so the page no longer
-- needs the API server to know who is signed in. A Supabase user without a public.users row yet is a customer.
CREATE OR REPLACE FUNCTION public.my_profile() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u public.users%ROWTYPE; j jsonb := COALESCE(auth.jwt(), '{}'::jsonb);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO u FROM public.users WHERE id = auth.uid();
  IF FOUND THEN
    RETURN jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone, 'role', u.role);
  END IF;
  RETURN jsonb_build_object('id', auth.uid(),
    'name', COALESCE(NULLIF(j #>> '{user_metadata,name}', ''), NULLIF(j #>> '{user_metadata,full_name}', ''), NULLIF(split_part(COALESCE(j ->> 'email', ''), '@', 1), ''), 'Customer'),
    'email', j ->> 'email', 'phone', null, 'role', 'customer');
END $$;

-- @@
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.my_profile() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.my_profile() TO authenticated;
  END IF;
END $$;
