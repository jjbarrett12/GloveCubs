-- Historical economics at order time for trustworthy margin / shipping analytics.
-- All columns nullable so existing orders remain valid.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_cost_at_order NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS total_cost_at_order NUMERIC(14, 2);

COMMENT ON COLUMN public.order_items.unit_cost_at_order IS 'Product unit cost (COGS) at order placement; analytics prefers this over live products.cost.';
COMMENT ON COLUMN public.order_items.total_cost_at_order IS 'qty × unit_cost_at_order at order time (stored for simple rollups).';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_free_shipping_at_order BOOLEAN,
  ADD COLUMN IF NOT EXISTS shipping_threshold_at_order NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS shipping_flat_rate_at_order NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS shipping_min_order_at_order NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS shipping_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS estimated_fulfillment_cost_usd NUMERIC(14, 2);

COMMENT ON COLUMN public.orders.is_free_shipping_at_order IS 'Whether cart subtotal qualified for free shipping under policy at order time.';
COMMENT ON COLUMN public.orders.shipping_threshold_at_order IS 'FREE_SHIPPING_THRESHOLD env value used at checkout.';
COMMENT ON COLUMN public.orders.shipping_flat_rate_at_order IS 'FLAT_SHIPPING_RATE env value used at checkout.';
COMMENT ON COLUMN public.orders.shipping_min_order_at_order IS 'MIN_ORDER_AMOUNT env value used at checkout.';
COMMENT ON COLUMN public.orders.shipping_policy_version IS 'Fingerprint of shipping policy params at order time.';
COMMENT ON COLUMN public.orders.estimated_fulfillment_cost_usd IS 'Assumed carrier/fulfillment cost at order time (e.g. flat from env); analytics prefers over recomputation.';
