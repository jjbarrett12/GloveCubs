-- =============================================================================
-- Phase 1: revoke public/anonymous supplier-cost access.
-- Drops USING (true) SELECT policies on supplier_offers / trust scores / suppliers.
-- Enables RLS on catalog_v2.supplier_offers (no public policies).
-- Rollback: recreate previous "public read …" policies only if intentionally
--   reopening competitive data (not recommended).
-- =============================================================================

-- catalogos.supplier_offers
DROP POLICY IF EXISTS "public read supplier_offers" ON catalogos.supplier_offers;
DROP POLICY IF EXISTS catalogos_admin_all_supplier_offers ON catalogos.supplier_offers;

ALTER TABLE catalogos.supplier_offers ENABLE ROW LEVEL SECURITY;

-- Internal operators via JWT admin allowlist (authenticated admin_users).
DROP POLICY IF EXISTS catalogos_supplier_offers_admin_select ON catalogos.supplier_offers;
CREATE POLICY catalogos_supplier_offers_admin_select
  ON catalogos.supplier_offers
  FOR SELECT
  TO authenticated
  USING (public.is_active_admin());

DROP POLICY IF EXISTS catalogos_supplier_offers_admin_all ON catalogos.supplier_offers;
CREATE POLICY catalogos_supplier_offers_admin_all
  ON catalogos.supplier_offers
  FOR ALL
  TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

REVOKE ALL ON TABLE catalogos.supplier_offers FROM anon;
REVOKE ALL ON TABLE catalogos.supplier_offers FROM PUBLIC;
GRANT SELECT ON TABLE catalogos.supplier_offers TO authenticated; -- gated by RLS admin policy
GRANT ALL ON TABLE catalogos.supplier_offers TO service_role, postgres;

-- catalogos.offer_trust_scores
DROP POLICY IF EXISTS "public read offer_trust_scores" ON catalogos.offer_trust_scores;
ALTER TABLE catalogos.offer_trust_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogos_offer_trust_scores_admin_select ON catalogos.offer_trust_scores;
CREATE POLICY catalogos_offer_trust_scores_admin_select
  ON catalogos.offer_trust_scores
  FOR SELECT
  TO authenticated
  USING (public.is_active_admin());

REVOKE ALL ON TABLE catalogos.offer_trust_scores FROM anon;
REVOKE ALL ON TABLE catalogos.offer_trust_scores FROM PUBLIC;
GRANT SELECT ON TABLE catalogos.offer_trust_scores TO authenticated;
GRANT ALL ON TABLE catalogos.offer_trust_scores TO service_role, postgres;

-- catalogos.suppliers — master may be referenced server-side; no anon/public read of contacts/terms
DROP POLICY IF EXISTS "public read suppliers" ON catalogos.suppliers;
ALTER TABLE catalogos.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogos_suppliers_admin_select ON catalogos.suppliers;
CREATE POLICY catalogos_suppliers_admin_select
  ON catalogos.suppliers
  FOR SELECT
  TO authenticated
  USING (public.is_active_admin());

REVOKE ALL ON TABLE catalogos.suppliers FROM anon;
REVOKE ALL ON TABLE catalogos.suppliers FROM PUBLIC;
GRANT SELECT ON TABLE catalogos.suppliers TO authenticated;
GRANT ALL ON TABLE catalogos.suppliers TO service_role, postgres;

-- catalogos.supplier_contacts / supplier_products_* already admin-oriented in early RLS;
-- ensure no anon grants.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalogos.supplier_contacts',
    'catalogos.supplier_feeds',
    'catalogos.supplier_products_raw',
    'catalogos.supplier_products_normalized',
    'catalogos.pricing_rules'
  ]
  LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE %s FROM anon', t);
      EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC', t);
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- catalog_v2.supplier_offers — never exposed to anon/authenticated customers
DO $$
BEGIN
  IF to_regclass('catalog_v2.supplier_offers') IS NOT NULL THEN
    ALTER TABLE catalog_v2.supplier_offers ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE catalog_v2.supplier_offers FROM anon;
    REVOKE ALL ON TABLE catalog_v2.supplier_offers FROM PUBLIC;
    REVOKE ALL ON TABLE catalog_v2.supplier_offers FROM authenticated;
    GRANT ALL ON TABLE catalog_v2.supplier_offers TO service_role, postgres;
  END IF;
END $$;

-- Public views that may wrap offers: revoke anon if present
DO $$
BEGIN
  IF to_regclass('public.supplier_offers') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.supplier_offers FROM anon;
    REVOKE ALL ON TABLE public.supplier_offers FROM PUBLIC;
  END IF;
  IF to_regclass('public.offer_trust_scores') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.offer_trust_scores FROM anon;
    REVOKE ALL ON TABLE public.offer_trust_scores FROM PUBLIC;
  END IF;
  IF to_regclass('public.suppliers') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.suppliers FROM anon;
    REVOKE ALL ON TABLE public.suppliers FROM PUBLIC;
  END IF;
END $$;

COMMENT ON TABLE catalogos.supplier_offers IS
  'Supplier commercial offers (unit costs). Not customer-readable. Access: service_role or active admin_users via RLS.';
