-- =============================================================================
-- Row Level Security (RLS) — enable on catalog and internal tables.
-- Protects all tables from unauthorized writes; storefront keeps read access.
-- Admin APIs using SUPABASE_SERVICE_ROLE_KEY bypass RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 2: Enable RLS on tables
-- Note: public.supplier_offers, public.offer_trust_scores, public.suppliers
-- are VIEWs; RLS is enabled on their underlying catalogos tables.
-- -----------------------------------------------------------------------------

ALTER TABLE public.canonical_products ENABLE ROW LEVEL SECURITY;

ALTER TABLE catalogos.supplier_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.offer_trust_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.error_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_blocks ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- STEP 3 & 5: Public read policies (DROP IF EXISTS for idempotency)
-- Storefront can read catalog/search data via anon key.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "public read canonical_products" ON public.canonical_products;
CREATE POLICY "public read canonical_products"
  ON public.canonical_products
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "public read supplier_offers" ON catalogos.supplier_offers;
CREATE POLICY "public read supplier_offers"
  ON catalogos.supplier_offers
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "public read offer_trust_scores" ON catalogos.offer_trust_scores;
CREATE POLICY "public read offer_trust_scores"
  ON catalogos.offer_trust_scores
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "public read suppliers" ON catalogos.suppliers;
CREATE POLICY "public read suppliers"
  ON catalogos.suppliers
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "public read products" ON catalogos.products;
CREATE POLICY "public read products"
  ON catalogos.products
  FOR SELECT
  USING (true);

-- -----------------------------------------------------------------------------
-- STEP 4: Internal tables — RLS enabled, no public policies
-- error_telemetry, rate_limit_events, rate_limit_blocks remain private.
-- Only service_role (admin APIs) can read/write.
-- -----------------------------------------------------------------------------
-- (No policies created; anon/authenticated get no access.)

-- -----------------------------------------------------------------------------
-- STEP 6: Validation comments
-- -----------------------------------------------------------------------------
-- PUBLIC READ (storefront can SELECT):
--   - public.canonical_products
--   - catalogos.supplier_offers (used via public.supplier_offers view)
--   - catalogos.offer_trust_scores (used via public.offer_trust_scores view)
--   - catalogos.suppliers (used via public.suppliers view)
--   - catalogos.products
--
-- INTERNAL (no public policies; service_role only):
--   - public.error_telemetry
--   - public.rate_limit_events
--   - public.rate_limit_blocks
--
-- Admin APIs using SUPABASE_SERVICE_ROLE_KEY bypass RLS and continue to
-- have full read/write access. Public users cannot write to any table;
-- they can only SELECT from the catalog tables listed above.
