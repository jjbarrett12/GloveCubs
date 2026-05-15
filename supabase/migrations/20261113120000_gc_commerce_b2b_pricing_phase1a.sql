-- =============================================================================
-- Phase 1a: Canonical B2B company pricing tiers + server price resolution.
-- - Company-level tier codes on gc_commerce.companies (cub / grizzly / kodiak).
-- - catalogos.quote_requests.gc_company_id links RFQs to canonical companies.
-- - gc_commerce.resolve_buyer_unit_price: list from site best-offer view × tier.
-- - RLS: buyer-visible quote rows only when gc_company_id matches membership.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) companies: B2B pricing tier (canonical; not public.pricing_tiers)
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.companies
  ADD COLUMN IF NOT EXISTS b2b_pricing_tier_code TEXT NOT NULL DEFAULT 'cub';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_gc_companies_b2b_pricing_tier_code'
  ) THEN
    ALTER TABLE gc_commerce.companies
      ADD CONSTRAINT ck_gc_companies_b2b_pricing_tier_code
      CHECK (b2b_pricing_tier_code IN ('cub', 'grizzly', 'kodiak'));
  END IF;
END $$;

COMMENT ON COLUMN gc_commerce.companies.b2b_pricing_tier_code IS
  'Canonical B2B volume tier for site-list-derived pricing: cub=10%, grizzly=20%, kodiak=30% off catalogos.product_best_offer_price (see resolve_buyer_unit_price).';

-- -----------------------------------------------------------------------------
-- 2) quote_requests: optional link to gc_commerce company (signed-in buyer)
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.quote_requests
  ADD COLUMN IF NOT EXISTS gc_company_id UUID REFERENCES gc_commerce.companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quote_requests_gc_company_id
  ON catalogos.quote_requests (gc_company_id)
  WHERE gc_company_id IS NOT NULL;

COMMENT ON COLUMN catalogos.quote_requests.gc_company_id IS
  'When set, the submitter was authenticated with this active gc_commerce company; used for buyer quote history and isolation.';

-- -----------------------------------------------------------------------------
-- 3) Server-authoritative unit price resolution (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gc_commerce.resolve_buyer_unit_price(
  p_company_id UUID,
  p_catalog_variant_id UUID,
  p_quantity INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = gc_commerce, catalog_v2, catalogos, public
AS $fn$
DECLARE
  v_tier TEXT;
  v_discount INT;
  v_product_id UUID;
  v_list NUMERIC;
  v_list_minor BIGINT;
  v_res_minor BIGINT;
  v_currency TEXT := 'USD';
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 99999 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  IF auth.role() = 'service_role' THEN
    NULL;
  ELSIF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM gc_commerce.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
  ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT c.b2b_pricing_tier_code
  INTO v_tier
  FROM gc_commerce.companies c
  WHERE c.id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'company_not_found');
  END IF;

  v_discount := CASE v_tier
    WHEN 'cub' THEN 10
    WHEN 'grizzly' THEN 20
    WHEN 'kodiak' THEN 30
    ELSE 10
  END;

  SELECT v.catalog_product_id
  INTO v_product_id
  FROM catalog_v2.catalog_variants v
  WHERE v.id = p_catalog_variant_id
    AND v.is_active = true;

  IF v_product_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'variant_not_found_or_inactive',
      'pricing_tier_code', v_tier,
      'discount_percent', v_discount
    );
  END IF;

  SELECT p.best_price
  INTO v_list
  FROM catalogos.product_best_offer_price p
  WHERE p.product_id = v_product_id;

  IF v_list IS NULL THEN
    RETURN jsonb_build_object(
      'company_id', p_company_id,
      'catalog_variant_id', p_catalog_variant_id,
      'catalog_product_id', v_product_id,
      'quantity', p_quantity,
      'list_unit_price_major', NULL,
      'list_unit_price_minor', NULL,
      'pricing_tier_code', v_tier,
      'discount_percent', v_discount,
      'resolved_unit_price_major', NULL,
      'resolved_unit_price_minor', NULL,
      'currency_code', v_currency,
      'pricing_source', 'site_list_unavailable',
      'computed_at', to_jsonb(now())
    );
  END IF;

  v_list_minor := ROUND(v_list * 100)::BIGINT;
  v_res_minor := ROUND(v_list_minor * (100 - v_discount) / 100.0)::BIGINT;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'catalog_variant_id', p_catalog_variant_id,
    'catalog_product_id', v_product_id,
    'quantity', p_quantity,
    'list_unit_price_major', v_list,
    'list_unit_price_minor', v_list_minor,
    'pricing_tier_code', v_tier,
    'discount_percent', v_discount,
    'resolved_unit_price_major', (v_res_minor::NUMERIC / 100.0),
    'resolved_unit_price_minor', v_res_minor,
    'currency_code', v_currency,
    'pricing_source', 'site_best_offer_x_company_tier_v1',
    'computed_at', to_jsonb(now())
  );
END;
$fn$;

COMMENT ON FUNCTION gc_commerce.resolve_buyer_unit_price(UUID, UUID, INT) IS
  'Returns site list (catalogos.product_best_offer_price) and tier-discounted unit price in USD; tier map must match companies.b2b_pricing_tier_code CHECK. Callable as service_role (server) or authenticated company member.';

REVOKE ALL ON FUNCTION gc_commerce.resolve_buyer_unit_price(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gc_commerce.resolve_buyer_unit_price(UUID, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION gc_commerce.resolve_buyer_unit_price(UUID, UUID, INT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4) RLS: gc_commerce.companies (members read own companies)
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_companies_select_member ON gc_commerce.companies;
CREATE POLICY gc_companies_select_member
  ON gc_commerce.companies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM gc_commerce.company_members cm
      WHERE cm.company_id = companies.id
        AND cm.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 5) RLS: catalogos quote tables (buyer sees only rows tied to their company)
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.quote_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogos_quote_requests_select_company_member ON catalogos.quote_requests;
CREATE POLICY catalogos_quote_requests_select_company_member
  ON catalogos.quote_requests
  FOR SELECT
  TO authenticated
  USING (
    gc_company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM gc_commerce.company_members cm
      WHERE cm.company_id = quote_requests.gc_company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS catalogos_quote_line_items_select_company_member ON catalogos.quote_line_items;
CREATE POLICY catalogos_quote_line_items_select_company_member
  ON catalogos.quote_line_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM catalogos.quote_requests qr
      WHERE qr.id = quote_line_items.quote_request_id
        AND qr.gc_company_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM gc_commerce.company_members cm
          WHERE cm.company_id = qr.gc_company_id
            AND cm.user_id = auth.uid()
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 6) Grants for authenticated defense-in-depth (RLS still applies)
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA catalogos TO authenticated;
GRANT SELECT ON TABLE catalogos.quote_requests TO authenticated;
GRANT SELECT ON TABLE catalogos.quote_line_items TO authenticated;

GRANT USAGE ON SCHEMA gc_commerce TO authenticated;
GRANT SELECT ON TABLE gc_commerce.companies TO authenticated;

-- -----------------------------------------------------------------------------
-- 7) Public RPC wrapper (Supabase PostgREST / supabase-js default schema)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gc_resolve_buyer_unit_price(
  p_company_id UUID,
  p_catalog_variant_id UUID,
  p_quantity INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, gc_commerce
AS $w$
BEGIN
  RETURN gc_commerce.resolve_buyer_unit_price(
    p_company_id,
    p_catalog_variant_id,
    COALESCE(p_quantity, 1)
  );
END;
$w$;

COMMENT ON FUNCTION public.gc_resolve_buyer_unit_price(UUID, UUID, INT) IS
  'Thin wrapper over gc_commerce.resolve_buyer_unit_price for Supabase RPC access.';

REVOKE ALL ON FUNCTION public.gc_resolve_buyer_unit_price(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gc_resolve_buyer_unit_price(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gc_resolve_buyer_unit_price(UUID, UUID, INT) TO service_role;
