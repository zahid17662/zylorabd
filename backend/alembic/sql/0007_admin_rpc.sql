-- Admin panel as Postgres functions (Supabase RPC). Every admin_* function starts with zy_require_admin():
-- the caller must be signed in with a Supabase session whose user has role 'admin' in public.users AND signed
-- in with a password (not Google), exactly like the API's require_admin. The tables themselves stay closed to
-- the public API (no policies, no grants): nothing is readable or writable except through these functions.
-- One statement per chunk (asyncpg runs one at a time); the migration splits on the marker lines below.

CREATE OR REPLACE FUNCTION public.zy_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL
    AND COALESCE(auth.jwt() -> 'amr' -> 0 ->> 'method', 'password') IN ('password', 'otp', 'magiclink')
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
$$;

-- @@
CREATE OR REPLACE FUNCTION public.zy_require_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.zy_is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END $$;

-- @@
CREATE OR REPLACE FUNCTION public.zy_product_json(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'title', p.title, 'slug', p.slug, 'category', p.category,
    'base_price', p.base_price::text, 'discount_percent', p.discount_percent::text,
    'final_price', public.zy_final_price(p.base_price, p.discount_percent)::text,
    'images', to_jsonb(COALESCE(p.images, '{}'::text[])), 'video_url', p.video_url, 'is_active', p.is_active,
    'in_stock', EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.stock_quantity > 0),
    'description', p.description,
    'total_stock', COALESCE((SELECT sum(v.stock_quantity) FROM public.product_variants v WHERE v.product_id = p.id), 0),
    'variants', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', v.id, 'size', v.size, 'sku', v.sku, 'stock_quantity', v.stock_quantity,
        'in_stock', v.stock_quantity > 0, 'low_stock', v.stock_quantity > 0 AND v.stock_quantity <= 3)
        ORDER BY v.created_at, v.id) FROM public.product_variants v WHERE v.product_id = p.id), '[]'::jsonb))
  FROM public.products p WHERE p.id = p_id
$$;

-- @@
CREATE OR REPLACE FUNCTION public.zy_admin_order_json(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'subtotal', o.subtotal::text, 'shipping_fee', o.shipping_fee::text,
    'total_amount', o.total_amount::text, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'order_status', o.order_status, 'delivery_zone', o.delivery_zone, 'recipient_name', o.recipient_name,
    'shipping_phone', o.shipping_phone, 'shipping_address', o.shipping_address, 'created_at', o.created_at,
    'login_method', o.login_method, 'order_source', o.order_source, 'utm', o.utm,
    'customer_name', u.name, 'customer_email', u.email, 'customer_phone', u.phone,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('product_title', i.product_title, 'size', i.size,
        'quantity', i.quantity, 'unit_price', i.unit_price::text) ORDER BY i.id)
        FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb),
    'transactions', COALESCE((SELECT jsonb_agg(jsonb_build_object('provider', t.provider, 'status', t.status,
        'gateway_tx_id', t.gateway_tx_id, 'amount', t.amount::text, 'paid_at', t.paid_at) ORDER BY t.created_at)
        FROM public.transactions t WHERE t.order_id = o.id), '[]'::jsonb))
  FROM public.orders o JOIN public.users u ON u.id = o.user_id WHERE o.id = p_id
$$;

-- @@
CREATE OR REPLACE FUNCTION public.zy_split(p_rows jsonb, p_always text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'key', s.k, 'orders', COALESCE((p_rows -> s.k ->> 'orders')::int, 0),
      'revenue', COALESCE(p_rows -> s.k ->> 'revenue', '0')) ORDER BY s.grp, s.ord, s.k), '[]'::jsonb)
  FROM (
    SELECT a.k, 0 AS grp, a.ord FROM unnest(p_always) WITH ORDINALITY AS a(k, ord)
    UNION ALL
    SELECT j.k, 1, 0 FROM jsonb_object_keys(p_rows) AS j(k) WHERE j.k <> ALL (p_always)
  ) s
$$;

-- @@
CREATE OR REPLACE FUNCTION public.admin_list_products() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.zy_require_admin();
  RETURN COALESCE((SELECT jsonb_agg(public.zy_product_json(p.id) ORDER BY p.created_at DESC, p.id)
                   FROM public.products p), '[]'::jsonb);
END $$;

-- @@
-- Create (p_id NULL) or update. Only the keys present in p_data change (works for PUT and PATCH alike);
-- sizes are upserted, never removed (past orders reference variants).
CREATE OR REPLACE FUNCTION public.admin_save_product(p_id uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d jsonb := COALESCE(p_data, '{}'::jsonb);
  v_id uuid := p_id;
  v_slug text;
  v_sizes text[];
  v_var jsonb;
  v_qty int;
  v_n int;
BEGIN
  PERFORM public.zy_require_admin();

  IF d ? 'title' AND (jsonb_typeof(d -> 'title') <> 'string' OR length(d ->> 'title') NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'Title must be 1 to 200 characters' USING ERRCODE = 'PT422';
  END IF;
  IF d ? 'category' AND (jsonb_typeof(d -> 'category') <> 'string' OR length(d ->> 'category') NOT BETWEEN 1 AND 80) THEN
    RAISE EXCEPTION 'Category must be 1 to 80 characters' USING ERRCODE = 'PT422';
  END IF;
  IF d ? 'base_price' THEN
    IF jsonb_typeof(d -> 'base_price') NOT IN ('string', 'number') OR (d ->> 'base_price') !~ '^\d{1,10}(\.\d{1,2})?$' THEN
      RAISE EXCEPTION 'Base price must be a number of at most 12 digits with 2 decimals' USING ERRCODE = 'PT422';
    END IF;
  END IF;
  IF d ? 'discount_percent' THEN
    IF jsonb_typeof(d -> 'discount_percent') NOT IN ('string', 'number') OR (d ->> 'discount_percent') !~ '^\d{1,3}(\.\d+)?$'
       OR (d ->> 'discount_percent')::numeric > 100 THEN
      RAISE EXCEPTION 'Discount must be between 0 and 100' USING ERRCODE = 'PT422';
    END IF;
  END IF;
  IF d ? 'images' AND (jsonb_typeof(d -> 'images') <> 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'images') e WHERE jsonb_typeof(e) <> 'string')) THEN
    RAISE EXCEPTION 'Images must be a list of URLs' USING ERRCODE = 'PT422';
  END IF;
  IF d ? 'video_url' AND jsonb_typeof(d -> 'video_url') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'Invalid video URL' USING ERRCODE = 'PT422';
  END IF;
  IF d ? 'is_active' AND jsonb_typeof(d -> 'is_active') <> 'boolean' THEN
    RAISE EXCEPTION 'is_active must be true or false' USING ERRCODE = 'PT422';
  END IF;
  IF d ? 'variants' THEN
    IF jsonb_typeof(d -> 'variants') <> 'array' THEN
      RAISE EXCEPTION 'Variants must be a list' USING ERRCODE = 'PT422';
    END IF;
    FOR v_var IN SELECT * FROM jsonb_array_elements(d -> 'variants') LOOP
      IF jsonb_typeof(v_var -> 'size') IS DISTINCT FROM 'string' OR length(v_var ->> 'size') NOT BETWEEN 1 AND 20
         OR jsonb_typeof(v_var -> 'stock_quantity') IS DISTINCT FROM 'number'
         OR (v_var ->> 'stock_quantity') !~ '^\d{1,9}$' THEN
        RAISE EXCEPTION 'Each size needs a name (max 20 characters) and a whole-number stock of 0 or more' USING ERRCODE = 'PT422';
      END IF;
    END LOOP;
    SELECT array_agg(e ->> 'size') INTO v_sizes FROM jsonb_array_elements(d -> 'variants') e;
    IF v_sizes IS NOT NULL AND (SELECT count(DISTINCT s) FROM unnest(v_sizes) s) <> cardinality(v_sizes) THEN
      RAISE EXCEPTION 'Duplicate size in request' USING ERRCODE = 'PT422';
    END IF;
  END IF;

  IF v_id IS NULL THEN
    IF NOT (d ? 'title' AND d ? 'category' AND d ? 'base_price') THEN
      RAISE EXCEPTION 'Title, category and base price are required' USING ERRCODE = 'PT422';
    END IF;
    v_slug := btrim(regexp_replace(lower(d ->> 'title'), '[^a-z0-9]+', '-', 'g'), '-');
    IF v_slug = '' THEN v_slug := 'product'; END IF;
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    v_id := gen_random_uuid();
    INSERT INTO public.products (id, title, slug, description, category, base_price, discount_percent, video_url,
                                 images, is_active, created_at)
    VALUES (v_id, d ->> 'title', v_slug, COALESCE(d ->> 'description', ''), d ->> 'category',
            (d ->> 'base_price')::numeric, COALESCE((d ->> 'discount_percent')::numeric, 0),
            CASE WHEN jsonb_typeof(d -> 'video_url') = 'string' THEN d ->> 'video_url' END,
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(d -> 'images')), '{}'::text[]),
            COALESCE((d ->> 'is_active')::boolean, true), now());
  ELSE
    SELECT slug INTO v_slug FROM public.products WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found' USING ERRCODE = 'PT404';
    END IF;
    IF d ? 'variants' THEN
      PERFORM 1 FROM public.product_variants WHERE product_id = v_id ORDER BY id FOR UPDATE; -- checkout's lock order
    END IF;
    UPDATE public.products SET
      title = CASE WHEN d ? 'title' THEN d ->> 'title' ELSE title END,
      description = CASE WHEN d ? 'description' THEN COALESCE(d ->> 'description', '') ELSE description END,
      category = CASE WHEN d ? 'category' THEN d ->> 'category' ELSE category END,
      base_price = CASE WHEN d ? 'base_price' THEN (d ->> 'base_price')::numeric ELSE base_price END,
      discount_percent = CASE WHEN d ? 'discount_percent' THEN (d ->> 'discount_percent')::numeric ELSE discount_percent END,
      video_url = CASE WHEN d ? 'video_url' THEN (CASE WHEN jsonb_typeof(d -> 'video_url') = 'string' THEN d ->> 'video_url' END) ELSE video_url END,
      images = CASE WHEN d ? 'images' THEN ARRAY(SELECT jsonb_array_elements_text(d -> 'images')) ELSE images END,
      is_active = CASE WHEN d ? 'is_active' THEN (d ->> 'is_active')::boolean ELSE is_active END
    WHERE id = v_id;
  END IF;

  IF d ? 'variants' THEN
    FOR v_var IN SELECT * FROM jsonb_array_elements(d -> 'variants') LOOP
      v_qty := (v_var ->> 'stock_quantity')::int;
      UPDATE public.product_variants SET stock_quantity = v_qty WHERE product_id = v_id AND size = v_var ->> 'size';
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        INSERT INTO public.product_variants (id, product_id, size, stock_quantity, sku, created_at)
        VALUES (gen_random_uuid(), v_id, v_var ->> 'size', v_qty,
                COALESCE(NULLIF(v_var ->> 'sku', ''),
                         left(v_slug, 40) || '-' || upper(regexp_replace(v_var ->> 'size', '[^A-Za-z0-9]+', '', 'g'))),
                clock_timestamp());
      END IF;
    END LOOP;
  END IF;

  RETURN public.zy_product_json(v_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Duplicate size or SKU' USING ERRCODE = 'PT409';
END $$;

-- @@
-- Per-size stock: p_items = [{size, stock_quantity} | {size, delta}] (exactly one of the two per item).
CREATE OR REPLACE FUNCTION public.admin_update_stock(p_product_id uuid, p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  it jsonb;
  v_slug text;
  v_cur int;
  v_qty int;
  v_sizes text[];
BEGIN
  PERFORM public.zy_require_admin();
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Send a list of sizes' USING ERRCODE = 'PT422';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(it -> 'size') IS DISTINCT FROM 'string' OR length(it ->> 'size') NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'Each item needs a size' USING ERRCODE = 'PT422';
    END IF;
    IF (it ? 'stock_quantity' AND jsonb_typeof(it -> 'stock_quantity') <> 'null') = (it ? 'delta' AND jsonb_typeof(it -> 'delta') <> 'null') THEN
      RAISE EXCEPTION 'Send exactly one of stock_quantity or delta' USING ERRCODE = 'PT422';
    END IF;
    IF it ? 'stock_quantity' AND jsonb_typeof(it -> 'stock_quantity') <> 'null'
       AND (jsonb_typeof(it -> 'stock_quantity') <> 'number' OR (it ->> 'stock_quantity') !~ '^\d{1,9}$') THEN
      RAISE EXCEPTION 'Stock must be a whole number, 0 or more' USING ERRCODE = 'PT422';
    END IF;
    IF it ? 'delta' AND jsonb_typeof(it -> 'delta') <> 'null'
       AND (jsonb_typeof(it -> 'delta') <> 'number' OR (it ->> 'delta') !~ '^-?\d{1,6}$' OR abs((it ->> 'delta')::int) > 100000) THEN
      RAISE EXCEPTION 'Delta must be a whole number between -100000 and 100000' USING ERRCODE = 'PT422';
    END IF;
  END LOOP;
  SELECT array_agg(e ->> 'size') INTO v_sizes FROM jsonb_array_elements(p_items) e;
  IF v_sizes IS NOT NULL AND (SELECT count(DISTINCT s) FROM unnest(v_sizes) s) <> cardinality(v_sizes) THEN
    RAISE EXCEPTION 'Duplicate size in request' USING ERRCODE = 'PT422';
  END IF;

  SELECT slug INTO v_slug FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'PT404';
  END IF;
  PERFORM 1 FROM public.product_variants WHERE product_id = p_product_id ORDER BY id FOR UPDATE;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT stock_quantity INTO v_cur FROM public.product_variants WHERE product_id = p_product_id AND size = it ->> 'size';
    IF NOT FOUND THEN v_cur := NULL; END IF;
    IF it ? 'stock_quantity' AND jsonb_typeof(it -> 'stock_quantity') <> 'null' THEN
      v_qty := (it ->> 'stock_quantity')::int;
    ELSE
      v_qty := COALESCE(v_cur, 0) + (it ->> 'delta')::int;
    END IF;
    IF v_qty < 0 THEN
      RAISE EXCEPTION 'Stock for % cannot go below zero', it ->> 'size' USING ERRCODE = 'PT422';
    END IF;
    IF v_cur IS NULL THEN
      INSERT INTO public.product_variants (id, product_id, size, stock_quantity, sku, created_at)
      VALUES (gen_random_uuid(), p_product_id, it ->> 'size', v_qty,
              left(v_slug, 40) || '-' || upper(regexp_replace(it ->> 'size', '[^A-Za-z0-9]+', '', 'g')), clock_timestamp());
    ELSE
      UPDATE public.product_variants SET stock_quantity = v_qty WHERE product_id = p_product_id AND size = it ->> 'size';
    END IF;
  END LOOP;
  RETURN public.zy_product_json(p_product_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Duplicate size or SKU' USING ERRCODE = 'PT409';
END $$;

-- @@
CREATE OR REPLACE FUNCTION public.admin_delete_product(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.zy_require_admin();
  PERFORM 1 FROM public.products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'PT404';
  END IF;
  -- Products that were ever ordered are archived (past orders reference their variants); others are removed.
  IF EXISTS (SELECT 1 FROM public.order_items i JOIN public.product_variants v ON v.id = i.variant_id WHERE v.product_id = p_id) THEN
    UPDATE public.products SET is_active = false WHERE id = p_id;
    RETURN jsonb_build_object('result', 'archived');
  END IF;
  BEGIN
    DELETE FROM public.products WHERE id = p_id;
  EXCEPTION WHEN foreign_key_violation THEN
    UPDATE public.products SET is_active = false WHERE id = p_id;
    RETURN jsonb_build_object('result', 'archived');
  END;
  RETURN jsonb_build_object('result', 'deleted');
END $$;

-- @@
-- Filters (all optional): q, order_status, payment_method, payment_provider, payment_status, login_method,
-- order_source, date_from, date_to (YYYY-MM-DD, Dhaka time).
CREATE OR REPLACE FUNCTION public.admin_list_orders(p_filters jsonb DEFAULT '{}'::jsonb, p_page int DEFAULT 1, p_page_size int DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f jsonb := COALESCE(p_filters, '{}'::jsonb);
  v_page int := GREATEST(COALESCE(p_page, 1), 1);
  v_size int := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_q text := NULLIF(f ->> 'q', '');
  v_like text;
  v_from timestamptz;
  v_to timestamptz;
  r jsonb;
BEGIN
  PERFORM public.zy_require_admin();
  IF v_q IS NOT NULL THEN
    IF length(v_q) > 100 THEN RAISE EXCEPTION 'Search is too long' USING ERRCODE = 'PT422'; END IF;
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;
  IF NULLIF(f ->> 'date_from', '') IS NOT NULL THEN
    v_from := ((f ->> 'date_from')::date)::timestamp AT TIME ZONE 'Asia/Dhaka';
  END IF;
  IF NULLIF(f ->> 'date_to', '') IS NOT NULL THEN
    v_to := (((f ->> 'date_to')::date) + 1)::timestamp AT TIME ZONE 'Asia/Dhaka';
  END IF;

  WITH filtered AS (
    SELECT o.id, o.created_at FROM public.orders o
    WHERE (NULLIF(f ->> 'order_status', '') IS NULL OR o.order_status = (f ->> 'order_status')::public.order_status)
      AND (NULLIF(f ->> 'payment_method', '') IS NULL OR o.payment_method = (f ->> 'payment_method')::public.payment_method)
      AND (NULLIF(f ->> 'payment_status', '') IS NULL OR o.payment_status = (f ->> 'payment_status')::public.payment_status)
      AND (NULLIF(f ->> 'login_method', '') IS NULL OR o.login_method = (f ->> 'login_method')::public.auth_provider)
      AND (NULLIF(f ->> 'order_source', '') IS NULL OR o.order_source = f ->> 'order_source')
      AND (NULLIF(f ->> 'payment_provider', '') IS NULL OR EXISTS (
            SELECT 1 FROM public.transactions t WHERE t.order_id = o.id AND t.provider = f ->> 'payment_provider'))
      AND (v_from IS NULL OR o.created_at >= v_from)
      AND (v_to IS NULL OR o.created_at < v_to)
      AND (v_like IS NULL OR o.order_number ILIKE v_like ESCAPE '\' OR o.shipping_phone ILIKE v_like ESCAPE '\'
           OR o.recipient_name ILIKE v_like ESCAPE '\')
  ), page AS (
    SELECT id, created_at FROM filtered ORDER BY created_at DESC, id OFFSET (v_page - 1) * v_size LIMIT v_size
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(public.zy_admin_order_json(page.id) ORDER BY page.created_at DESC, page.id) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered), 'page', v_page, 'page_size', v_size)
  INTO r;
  RETURN r;
END $$;

-- @@
CREATE OR REPLACE FUNCTION public.admin_get_order(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r jsonb;
BEGIN
  PERFORM public.zy_require_admin();
  r := public.zy_admin_order_json(p_id);
  IF r IS NULL THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'PT404'; END IF;
  RETURN r;
END $$;

-- @@
-- Row-locked transition. Cancelling returns stock exactly once; delivering a COD order records the cash as paid.
CREATE OR REPLACE FUNCTION public.admin_set_order_status(p_order_id uuid, p_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_new public.order_status;
  v_ok boolean;
BEGIN
  PERFORM public.zy_require_admin();
  BEGIN
    v_new := p_status::public.order_status;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Unknown order status' USING ERRCODE = 'PT422';
  END;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'PT404';
  END IF;
  v_ok := CASE o.order_status
    WHEN 'pending' THEN v_new IN ('confirmed', 'cancelled')
    WHEN 'awaiting_payment' THEN v_new = 'cancelled' -- only the payment webhook can confirm these
    WHEN 'confirmed' THEN v_new IN ('shipped', 'cancelled')
    WHEN 'shipped' THEN v_new IN ('delivered', 'cancelled')
    ELSE false END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Cannot move order from % to %', o.order_status, v_new USING ERRCODE = 'PT409';
  END IF;

  IF v_new = 'cancelled' THEN
    IF NOT o.stock_released THEN
      PERFORM 1 FROM public.product_variants
        WHERE id IN (SELECT variant_id FROM public.order_items WHERE order_id = o.id) ORDER BY id FOR UPDATE;
      UPDATE public.product_variants v SET stock_quantity = v.stock_quantity + s.q
        FROM (SELECT variant_id, sum(quantity)::int AS q FROM public.order_items WHERE order_id = o.id GROUP BY variant_id) s
        WHERE v.id = s.variant_id;
    END IF;
    UPDATE public.orders SET order_status = 'cancelled', stock_released = true, updated_at = now() WHERE id = o.id;
  ELSE
    UPDATE public.orders SET order_status = v_new, updated_at = now(),
      payment_status = CASE WHEN v_new = 'delivered' AND payment_method = 'cod' THEN 'paid'::public.payment_status ELSE payment_status END
      WHERE id = o.id;
  END IF;
  RETURN public.zy_admin_order_json(o.id);
END $$;

-- @@
CREATE OR REPLACE FUNCTION public.admin_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  st jsonb; pay jsonb; chan jsonb; src jsonb; low jsonb; rev numeric;
BEGIN
  PERFORM public.zy_require_admin();
  SELECT COALESCE(jsonb_object_agg(s.k, s.c), '{}'::jsonb) INTO st
    FROM (SELECT order_status::text AS k, count(*)::int AS c FROM public.orders GROUP BY 1) s;
  SELECT COALESCE(sum(total_amount) FILTER (WHERE payment_status = 'paid'), 0) INTO rev
    FROM public.orders WHERE order_status <> 'cancelled';

  SELECT COALESCE(jsonb_object_agg(s.k, jsonb_build_object('orders', s.n, 'revenue', s.rev::text)), '{}'::jsonb) INTO pay
    FROM (SELECT CASE WHEN o.payment_method = 'cod' THEN 'COD'
                      ELSE upper(COALESCE((SELECT max(t.provider) FROM public.transactions t WHERE t.order_id = o.id), 'online')) END AS k,
                 count(*)::int AS n, COALESCE(sum(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0) AS rev
            FROM public.orders o WHERE o.order_status <> 'cancelled' GROUP BY 1) s;
  SELECT COALESCE(jsonb_object_agg(s.k, jsonb_build_object('orders', s.n, 'revenue', s.rev::text)), '{}'::jsonb) INTO chan
    FROM (SELECT upper(o.login_method::text) AS k, count(*)::int AS n,
                 COALESCE(sum(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0) AS rev
            FROM public.orders o WHERE o.order_status <> 'cancelled' GROUP BY 1) s;
  SELECT COALESCE(jsonb_object_agg(s.k, jsonb_build_object('orders', s.n, 'revenue', s.rev::text)), '{}'::jsonb) INTO src
    FROM (SELECT upper(COALESCE(o.order_source, 'direct')) AS k, count(*)::int AS n,
                 COALESCE(sum(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0) AS rev
            FROM public.orders o WHERE o.order_status <> 'cancelled' GROUP BY 1) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', p.id, 'product_title', p.title, 'variant_id', v.id,
      'size', v.size, 'sku', v.sku, 'stock_quantity', v.stock_quantity) ORDER BY v.stock_quantity, p.title, v.size), '[]'::jsonb)
    INTO low
    FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
    WHERE p.is_active AND v.stock_quantity <= 3;

  RETURN jsonb_build_object(
    'total_orders', (SELECT COALESCE(sum(value::int), 0) FROM jsonb_each_text(st)),
    'pending_orders', COALESCE((st ->> 'pending')::int, 0) + COALESCE((st ->> 'awaiting_payment')::int, 0),
    'confirmed_orders', COALESCE((st ->> 'confirmed')::int, 0),
    'pending_fulfillment', COALESCE((st ->> 'pending')::int, 0) + COALESCE((st ->> 'awaiting_payment')::int, 0) + COALESCE((st ->> 'confirmed')::int, 0),
    'shipped_orders', COALESCE((st ->> 'shipped')::int, 0),
    'delivered_orders', COALESCE((st ->> 'delivered')::int, 0),
    'cancelled_orders', COALESCE((st ->> 'cancelled')::int, 0),
    'total_revenue', rev::text,
    'payment_method_split', public.zy_split(pay, ARRAY['COD', 'BKASH', 'NAGAD', 'CARD']),
    'order_attribution_split', jsonb_build_object(
      'login_channel', public.zy_split(chan, ARRAY['EMAIL', 'PHONE', 'FACEBOOK', 'GOOGLE']),
      'order_source', public.zy_split(src, ARRAY['DIRECT'])),
    'low_stock_variants', low);
END $$;

-- @@
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.zy_is_admin() FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.zy_require_admin() FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.zy_product_json(uuid) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.zy_admin_order_json(uuid) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.zy_split(jsonb, text[]) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.admin_list_products() FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.admin_save_product(uuid, jsonb) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.admin_update_stock(uuid, jsonb) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.admin_delete_product(uuid) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.admin_list_orders(jsonb, int, int) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.admin_get_order(uuid) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.admin_set_order_status(uuid, text) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.admin_stats() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_list_products() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_save_product(uuid, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_update_stock(uuid, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_delete_product(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_list_orders(jsonb, int, int) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_get_order(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_set_order_status(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;
  END IF;
END $$;
