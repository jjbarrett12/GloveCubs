-- Shipping / economics snapshots on gc_commerce.orders (parity with legacy public.orders analytics).

ALTER TABLE gc_commerce.orders
  ADD COLUMN IF NOT EXISTS shipping_policy_version_id BIGINT REFERENCES public.shipping_policy_versions (id),
  ADD COLUMN IF NOT EXISTS is_free_shipping_at_order BOOLEAN,
  ADD COLUMN IF NOT EXISTS shipping_threshold_at_order NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS shipping_flat_rate_at_order NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS shipping_min_order_at_order NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS shipping_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS estimated_fulfillment_cost_usd NUMERIC(14, 2);

COMMENT ON COLUMN gc_commerce.orders.shipping_policy_version_id IS 'FK to shipping_policy_versions in effect when the order was placed.';
