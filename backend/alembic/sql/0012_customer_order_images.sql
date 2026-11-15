-- Customer order views also carry each product's first photo (for the My orders page).
CREATE OR REPLACE FUNCTION public.zy_customer_order_json(p_id uuid, p_contact boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'created_at', o.created_at, 'order_status', o.order_status,
    'payment_method', o.payment_method, 'payment_status', o.payment_status, 'delivery_zone', o.delivery_zone,
    'subtotal', o.subtotal::text, 'shipping_fee', o.shipping_fee::text, 'total_amount', o.total_amount::text,
    'recipient_name', CASE WHEN p_contact THEN o.recipient_name ELSE split_part(btrim(o.recipient_name), ' ', 1) END,
    'shipping_address', CASE WHEN p_contact THEN o.shipping_address END,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('product_title', i.product_title, 'size', i.size, 'quantity', i.quantity,
        'unit_price', i.unit_price::text,
        'image', (SELECT p.images[1] FROM public.product_variants v JOIN public.products p ON p.id = v.product_id WHERE v.id = i.variant_id)) ORDER BY i.id)
        FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', e.status, 'at', e.created_at) ORDER BY e.created_at, e.id)
        FROM public.order_status_events e WHERE e.order_id = o.id), '[]'::jsonb))
  FROM public.orders o WHERE o.id = p_id
$$;
