-- Cash-on-delivery checkout as one atomic Postgres function, callable straight from the storefront through
-- Supabase's RPC with the customer's own Supabase session (auth.uid()). Same rules as POST /orders/checkout:
-- server-side prices, row-locked stock, merged duplicate lines. Online payments stay on the API.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key varchar(64);
-- @@
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_user_idempotency ON public.orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- @@
CREATE TABLE IF NOT EXISTS public.shop_settings (key text PRIMARY KEY, value text NOT NULL);
-- @@
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;  -- no policies: only the backend/functions read it
-- @@
INSERT INTO public.shop_settings (key, value) VALUES ('shipping_inside_dhaka', '70'), ('shipping_outside_dhaka', '130')
  ON CONFLICT (key) DO NOTHING;

-- @@
-- Same rounding as the API (Python Decimal.quantize: half-even on exact ties).
CREATE OR REPLACE FUNCTION public.zy_final_price(base numeric, pct numeric) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE t numeric := base * (100 - pct); f numeric := floor(base * (100 - pct)); frac numeric;
BEGIN
  frac := t - f;
  IF frac > 0.5 OR (frac = 0.5 AND mod(f, 2) = 1) THEN f := f + 1; END IF;
  RETURN (f / 100)::numeric(12, 2);
END $$;

-- @@
CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb, p_shipping jsonb, p_payment_method text DEFAULT 'cod',
  p_idempotency_key text DEFAULT NULL, p_attribution jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
  amr text;
  lm text;
  u public.users%ROWTYPE;
  au record;
  recipient text; phone text; addr text; zone text;
  m text[];
  r record;
  lines jsonb := '[]'::jsonb;
  problems jsonb := '[]'::jsonb;
  subtotal numeric(12, 2) := 0;
  fee numeric(12, 2);
  total numeric(12, 2);
  unit numeric(12, 2);
  vcount int; wanted int;
  ord public.orders%ROWTYPE;
  onum text; tries int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF p_payment_method IS DISTINCT FROM 'cod' THEN RAISE EXCEPTION 'online_not_supported' USING ERRCODE = 'P0001'; END IF;

  -- ---- validate the request (mirrors CheckoutIn) ----
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50
     OR jsonb_typeof(p_shipping) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    PERFORM 1 FROM jsonb_array_elements(p_items) e
      WHERE (e->>'variant_id')::uuid IS NULL OR (e->>'quantity')::int NOT BETWEEN 1 AND 20;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE (e->>'quantity')::int NOT BETWEEN 1 AND 20) THEN
      RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
    END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END;
  recipient := p_shipping->>'recipient_name';
  addr := p_shipping->>'address';
  zone := p_shipping->>'zone';
  IF recipient IS NULL OR char_length(recipient) NOT BETWEEN 1 AND 120
     OR addr IS NULL OR char_length(addr) NOT BETWEEN 5 AND 500
     OR zone NOT IN ('inside_dhaka', 'outside_dhaka') THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;
  m := regexp_match(regexp_replace(btrim(coalesce(p_shipping->>'phone', '')), '[ -]', '', 'g'), '^(?:\+?88)?(01[3-9][0-9]{8})$');
  IF m IS NULL THEN RAISE EXCEPTION 'invalid_phone' USING ERRCODE = 'P0001'; END IF;
  phone := m[1];

  -- ---- who is ordering (a Supabase-only customer gets a customer row on first order) ----
  amr := auth.jwt() -> 'amr' -> 0 ->> 'method';
  lm := CASE WHEN amr IN ('id_token', 'oauth') THEN 'google' ELSE 'email' END;
  SELECT * INTO u FROM public.users WHERE id = uid;
  IF NOT FOUND THEN
    SELECT email, email_confirmed_at, raw_user_meta_data INTO au FROM auth.users WHERE id = uid;
    IF NOT FOUND OR au.email IS NULL OR au.email_confirmed_at IS NULL THEN
      RAISE EXCEPTION 'email_unverified' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.users WHERE email = lower(au.email)) THEN
      RAISE EXCEPTION 'account_conflict' USING ERRCODE = 'P0001';  -- never link by email
    END IF;
    INSERT INTO public.users (id, name, email, auth_provider, role)
    VALUES (uid, coalesce(au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
            lower(au.email), lm::auth_provider, 'customer');
  END IF;

  -- ---- idempotent retry: a client that lost the response asks again with the same key ----
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO ord FROM public.orders WHERE user_id = uid AND idempotency_key = left(p_idempotency_key, 64);
    IF FOUND THEN RETURN public.zy_order_json(ord.id); END IF;
  END IF;

  -- ---- lock variants in a stable order, then check stock ----
  SELECT count(*) INTO wanted FROM (SELECT DISTINCT (e->>'variant_id')::uuid FROM jsonb_array_elements(p_items) e) d;
  FOR r IN
    SELECT (e->>'variant_id')::uuid AS vid, sum((e->>'quantity')::int)::int AS qty
    FROM jsonb_array_elements(p_items) e GROUP BY 1 ORDER BY 1
  LOOP
    DECLARE v record;
    BEGIN
      SELECT pv.id, pv.size, pv.stock_quantity, p.title, p.is_active, p.base_price, p.discount_percent INTO v
      FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = r.vid FOR UPDATE OF pv;
      IF NOT FOUND THEN RAISE EXCEPTION 'items_missing' USING ERRCODE = 'P0001'; END IF;
      IF NOT v.is_active THEN
        problems := problems || to_jsonb(v.title || ' is no longer available');
      ELSIF v.stock_quantity < r.qty THEN
        problems := problems || to_jsonb(v.title || ' (' || v.size || '): ' ||
          CASE WHEN v.stock_quantity > 0 THEN 'only ' || v.stock_quantity || ' left' ELSE 'sold out' END);
      ELSE
        unit := public.zy_final_price(v.base_price, v.discount_percent);
        subtotal := subtotal + unit * r.qty;
        lines := lines || jsonb_build_object('variant_id', r.vid, 'qty', r.qty, 'title', v.title, 'size', v.size, 'unit', unit);
      END IF;
    END;
  END LOOP;
  IF jsonb_array_length(problems) > 0 THEN
    RAISE EXCEPTION 'out_of_stock' USING ERRCODE = 'P0001', DETAIL = problems::text;
  END IF;

  SELECT value::numeric(12, 2) INTO fee FROM public.shop_settings
    WHERE key = CASE WHEN zone = 'inside_dhaka' THEN 'shipping_inside_dhaka' ELSE 'shipping_outside_dhaka' END;
  IF fee IS NULL THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001'; END IF;
  total := subtotal + fee;

  -- ---- create the order (retry on the rare order-number collision) ----
  LOOP
    tries := tries + 1;
    onum := 'ZB' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    BEGIN
      INSERT INTO public.orders (id, order_number, user_id, subtotal, shipping_fee, total_amount, payment_method, payment_status,
          order_status, login_method, order_source, utm, recipient_name, shipping_phone, shipping_address, delivery_zone,
          stock_released, idempotency_key)
      VALUES (gen_random_uuid(), onum, uid, subtotal, fee, total, 'cod', 'unpaid', 'confirmed', lm::auth_provider,
          coalesce(nullif(left(p_attribution->>'utm_source', 100), ''), 'direct'),
          CASE WHEN jsonb_typeof(p_attribution) = 'object' THEN jsonb_strip_nulls(p_attribution) END,
          recipient, phone, addr, zone::delivery_zone, false, left(p_idempotency_key, 64))
      RETURNING * INTO ord;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN  -- two identical requests raced: hand back the winner
        SELECT * INTO ord FROM public.orders WHERE user_id = uid AND idempotency_key = left(p_idempotency_key, 64);
        IF FOUND THEN RETURN public.zy_order_json(ord.id); END IF;
      END IF;
      IF tries >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO public.order_items (id, order_id, variant_id, product_title, size, quantity, unit_price)
  SELECT gen_random_uuid(), ord.id, (l->>'variant_id')::uuid, l->>'title', l->>'size', (l->>'qty')::int, (l->>'unit')::numeric(12, 2)
  FROM jsonb_array_elements(lines) l;
  UPDATE public.product_variants pv SET stock_quantity = pv.stock_quantity - (l->>'qty')::int
  FROM jsonb_array_elements(lines) l WHERE pv.id = (l->>'variant_id')::uuid;

  RETURN public.zy_order_json(ord.id);
END $$;

-- @@
-- Same shape as the API's CheckoutOut so the storefront needs no changes.
CREATE OR REPLACE FUNCTION public.zy_order_json(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('payment_url', NULL, 'order', jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'subtotal', o.subtotal::text, 'shipping_fee', o.shipping_fee::text,
    'total_amount', o.total_amount::text, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'order_status', o.order_status, 'delivery_zone', o.delivery_zone, 'recipient_name', o.recipient_name,
    'shipping_phone', o.shipping_phone, 'shipping_address', o.shipping_address, 'created_at', o.created_at,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('product_title', i.product_title, 'size', i.size,
        'quantity', i.quantity, 'unit_price', i.unit_price::text)) FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb)))
  FROM public.orders o WHERE o.id = p_id
$$;

-- @@
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.place_order(jsonb, jsonb, text, text, jsonb) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.zy_order_json(uuid) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.zy_final_price(numeric, numeric) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text, text, jsonb) TO authenticated;
  END IF;
END $$;
