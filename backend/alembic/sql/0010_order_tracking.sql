-- Customer order tracking: a status history (written by a trigger, so every path that changes an order is covered:
-- the checkout function, the API, the admin functions, the payment webhook) and two read functions:
--   my_orders()                       a signed-in customer's own orders
--   track_order(order_number, phone)  anyone who knows the order number AND the phone it was placed with
-- Customers never see emails, user ids, UTM data or payment gateway records, and tracking by number shows only the
-- first name and no address or phone.
CREATE TABLE IF NOT EXISTS public.order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- @@
CREATE INDEX IF NOT EXISTS ix_order_status_events_order ON public.order_status_events (order_id, created_at);

-- @@
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

-- @@
CREATE TABLE IF NOT EXISTS public.order_track_failures (
  order_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- @@
CREATE INDEX IF NOT EXISTS ix_order_track_failures ON public.order_track_failures (order_number, created_at);

-- @@
ALTER TABLE public.order_track_failures ENABLE ROW LEVEL SECURITY;

-- @@
CREATE OR REPLACE FUNCTION public.zy_log_order_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    INSERT INTO public.order_status_events (order_id, status) VALUES (NEW.id, NEW.order_status);
  END IF;
  RETURN NEW;
END $$;

-- @@
DROP TRIGGER IF EXISTS zy_log_order_status ON public.orders;

-- @@
CREATE TRIGGER zy_log_order_status AFTER INSERT OR UPDATE OF order_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.zy_log_order_status();

-- @@
-- Orders that exist today: one event for the status they are in now (the earlier steps were never recorded).
INSERT INTO public.order_status_events (order_id, status, created_at)
  SELECT o.id, o.order_status, o.updated_at FROM public.orders o
  WHERE NOT EXISTS (SELECT 1 FROM public.order_status_events e WHERE e.order_id = o.id);

-- @@
CREATE OR REPLACE FUNCTION public.zy_customer_order_json(p_id uuid, p_contact boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'created_at', o.created_at, 'order_status', o.order_status,
    'payment_method', o.payment_method, 'payment_status', o.payment_status, 'delivery_zone', o.delivery_zone,
    'subtotal', o.subtotal::text, 'shipping_fee', o.shipping_fee::text, 'total_amount', o.total_amount::text,
    'recipient_name', CASE WHEN p_contact THEN o.recipient_name ELSE split_part(btrim(o.recipient_name), ' ', 1) END,
    'shipping_address', CASE WHEN p_contact THEN o.shipping_address END,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('product_title', i.product_title, 'size', i.size,
        'quantity', i.quantity, 'unit_price', i.unit_price::text) ORDER BY i.id)
        FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', e.status, 'at', e.created_at) ORDER BY e.created_at, e.id)
        FROM public.order_status_events e WHERE e.order_id = o.id), '[]'::jsonb))
  FROM public.orders o WHERE o.id = p_id
$$;

-- @@
CREATE OR REPLACE FUNCTION public.my_orders() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(public.zy_customer_order_json(s.id, true) ORDER BY s.created_at DESC, s.id)
    FROM (SELECT id, created_at FROM public.orders WHERE user_id = auth.uid() ORDER BY created_at DESC, id LIMIT 50) s), '[]'::jsonb);
END $$;

-- @@
-- Wrong combinations all look the same ({found:false}); after 8 misses on one real order in an hour, that order's
-- lookup stays closed until the hour passes (signed-in customers can still see it under "My orders").
CREATE OR REPLACE FUNCTION public.track_order(p_order_number text, p_phone text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_num text := upper(btrim(COALESCE(p_order_number, '')));
  v_digits text := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  o public.orders%ROWTYPE;
  v_misses int;
BEGIN
  IF length(v_num) NOT BETWEEN 4 AND 20 OR length(v_digits) < 10 THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT * INTO o FROM public.orders WHERE order_number = v_num;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT count(*) INTO v_misses FROM public.order_track_failures
    WHERE order_number = v_num AND created_at > now() - interval '1 hour';
  IF v_misses >= 8 THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF right(regexp_replace(o.shipping_phone, '\D', '', 'g'), 10) <> right(v_digits, 10) THEN
    DELETE FROM public.order_track_failures WHERE created_at < now() - interval '1 day';
    INSERT INTO public.order_track_failures (order_number) VALUES (v_num);
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object('found', true, 'order', public.zy_customer_order_json(o.id, false));
END $$;

-- @@
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.zy_log_order_status() FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.zy_customer_order_json(uuid, boolean) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.my_orders() FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.track_order(text, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.my_orders() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.track_order(text, text) TO anon, authenticated;
  END IF;
END $$;
