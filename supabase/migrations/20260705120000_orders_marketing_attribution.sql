-- First-touch / campaign attribution captured at checkout (client-supplied, sanitized server-side).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS marketing_attribution JSONB DEFAULT NULL;

COMMENT ON COLUMN public.orders.marketing_attribution IS 'UTM and click ids at checkout; optional first_seen_at, landing_path. Not used for pricing.';

CREATE INDEX IF NOT EXISTS idx_orders_marketing_utm_source
  ON public.orders ((marketing_attribution->>'utm_source'))
  WHERE marketing_attribution IS NOT NULL;
