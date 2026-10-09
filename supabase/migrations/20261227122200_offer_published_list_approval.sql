-- Published list approval: cost is never a customer-facing fallback.
-- sell_price is public list SOT only after sell_price_verified_at is set by an operator.
-- Do not backfill verified_at — existing sell_price = cost rows stay unpublished.

ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS sell_price_verified_at TIMESTAMPTZ;

ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS sell_price_verified_by TEXT;

COMMENT ON COLUMN catalogos.supplier_offers.cost IS
  'GloveCubs acquisition cost for this offer cost_basis (usually per case). Internal only. Never a published-list fallback.';

COMMENT ON COLUMN catalogos.supplier_offers.sell_price IS
  'GloveCubs published list for this offer sell unit. Customer-facing only when sell_price_verified_at IS NOT NULL AND sell_price > 0. Null or unverified = unpublished. Do not copy cost here.';

COMMENT ON COLUMN catalogos.supplier_offers.sell_price_verified_at IS
  'Operator approval timestamp for sell_price. Null means the number is unpublished even if sell_price is populated (including historical cost copies).';

COMMENT ON COLUMN catalogos.supplier_offers.sell_price_verified_by IS
  'Operator identity (user id or email) that approved sell_price. Null when unverified.';

-- -----------------------------------------------------------------------------
-- Variant list: mapped active offers with an *approved* sell_price. Never cost.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW catalogos.variant_best_offer_price AS
SELECT
  v.id AS catalog_variant_id,
  v.catalog_product_id,
  MIN(so.sell_price) AS list_unit_price_major,
  COUNT(*)::INT AS offer_count,
  'catalogos.supplier_offers.variant_fk_sell_v1'::TEXT AS pricing_source,
  'USD'::TEXT AS currency_code
FROM catalog_v2.catalog_variants v
INNER JOIN catalogos.supplier_offers so
  ON so.catalog_variant_id = v.id
 AND so.is_active = true
 AND so.sell_price IS NOT NULL
 AND so.sell_price > 0
 AND so.sell_price_verified_at IS NOT NULL
WHERE v.is_active = true
GROUP BY v.id, v.catalog_product_id;

COMMENT ON VIEW catalogos.variant_best_offer_price IS
  'Per-variant min approved sell_price from active catalogos.supplier_offers mapped by catalog_variant_id. Requires sell_price_verified_at. No SKU equality, no manufacturer-SKU lookup, no cost fallback, no sibling/parent fallback.';

GRANT SELECT ON catalogos.variant_best_offer_price TO authenticated;
GRANT SELECT ON catalogos.variant_best_offer_price TO service_role;

CREATE OR REPLACE VIEW public.variant_best_offer_price AS
SELECT
  catalog_variant_id,
  catalog_product_id,
  list_unit_price_major,
  offer_count,
  pricing_source,
  currency_code
FROM catalogos.variant_best_offer_price;

COMMENT ON VIEW public.variant_best_offer_price IS
  'Public read surface for storefront PDP variant list pricing (catalogos.variant_best_offer_price). Approved sell_price only.';

GRANT SELECT ON public.variant_best_offer_price TO authenticated;
GRANT SELECT ON public.variant_best_offer_price TO service_role;

-- -----------------------------------------------------------------------------
-- Product list: same approval gate
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW catalogos.product_best_offer_price AS
SELECT
  product_id,
  MIN(sell_price) AS best_price,
  COUNT(*)::INT AS offer_count
FROM catalogos.supplier_offers
WHERE is_active = true
  AND sell_price IS NOT NULL
  AND sell_price > 0
  AND sell_price_verified_at IS NOT NULL
GROUP BY product_id;

COMMENT ON VIEW catalogos.product_best_offer_price IS
  'Per-product min approved public sell_price from active supplier_offers. Cost is never a fallback. Unverified sell_price is unpublished.';

GRANT SELECT ON catalogos.product_best_offer_price TO authenticated;
GRANT SELECT ON catalogos.product_best_offer_price TO service_role;

-- -----------------------------------------------------------------------------
-- Case economics: same FK join + approved sell_price only
-- gc_commerce.resolve_buyer_unit_price is unchanged; it already reads variant_best_offer_price.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gc_commerce.variant_case_economics_batch(
  p_catalog_variant_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = gc_commerce, catalog_v2, catalogos, public
AS $case$
DECLARE
  v_id UUID;
  v_results JSONB := '[]'::JSONB;
  v_len INT;
  v_row RECORD;
  v_list_unit NUMERIC;
  v_list_case NUMERIC;
  v_units NUMERIC;
BEGIN
  IF p_catalog_variant_ids IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::JSONB);
  END IF;

  v_len := COALESCE(array_length(p_catalog_variant_ids, 1), 0);
  FOR i IN 1..v_len LOOP
    v_id := p_catalog_variant_ids[i];

    SELECT
      v.id AS catalog_variant_id,
      vp.list_unit_price_major,
      so.cost_basis,
      so.pack_qty,
      so.units_per_case,
      so.normalized_unit_uom,
      so.normalization_confidence,
      so.sell_price AS offer_price
    INTO v_row
    FROM catalog_v2.catalog_variants v
    LEFT JOIN catalogos.variant_best_offer_price vp ON vp.catalog_variant_id = v.id
    LEFT JOIN LATERAL (
      SELECT so.*
      FROM catalogos.supplier_offers so
      WHERE so.catalog_variant_id = v.id
        AND so.is_active = true
        AND so.sell_price IS NOT NULL
        AND so.sell_price > 0
        AND so.sell_price_verified_at IS NOT NULL
      ORDER BY so.sell_price ASC
      LIMIT 1
    ) so ON true
    WHERE v.id = v_id
      AND v.is_active = true;

    IF NOT FOUND THEN
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'catalog_variant_id', v_id,
          'error', 'variant_not_found_or_inactive'
        )
      );
      CONTINUE;
    END IF;

    v_list_unit := v_row.list_unit_price_major;
    v_units := NULL;
    IF v_row.pack_qty IS NOT NULL AND v_row.pack_qty > 0 THEN
      v_units := v_row.pack_qty;
    ELSIF v_row.units_per_case IS NOT NULL AND v_row.units_per_case > 0 THEN
      v_units := v_row.units_per_case::NUMERIC;
    END IF;

    v_list_case := NULL;
    IF v_row.cost_basis = 'per_case' AND v_row.offer_price IS NOT NULL AND v_row.offer_price > 0 THEN
      v_list_case := v_row.offer_price;
    ELSIF v_row.cost_basis = 'per_each'
      AND v_units IS NOT NULL
      AND v_list_unit IS NOT NULL
      AND v_list_unit > 0 THEN
      v_list_case := v_list_unit * v_units;
    END IF;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'catalog_variant_id', v_row.catalog_variant_id,
        'units_per_case', v_units,
        'uom_label', COALESCE(NULLIF(TRIM(v_row.normalized_unit_uom), ''), 'each'),
        'cost_basis', v_row.cost_basis,
        'list_unit_price_major', v_list_unit,
        'list_case_price_major', v_list_case,
        'case_pricing_source', CASE
          WHEN v_list_case IS NOT NULL THEN 'supplier_offer.cost_basis_v1'
          ELSE NULL
        END,
        'normalization_confidence', v_row.normalization_confidence,
        'packaging_spec', NULL
      )
    );
  END LOOP;

  RETURN jsonb_build_object('items', v_results);
END;
$case$;

COMMENT ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) IS
  'Server-authoritative case/pack economics per variant; list from mapped approved sell_price only. service_role only.';

REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM anon;
REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) TO service_role;
