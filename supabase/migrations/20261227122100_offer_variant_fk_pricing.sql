-- Explicit GloveCubs variant ↔ catalogos.supplier_offers relationship + sell-price-only
-- variant list pricing. Additive. Does not rewrite SKUs. Does not auto-map live rows.
--
-- Live commerce prices from catalogos.supplier_offers (not the unused catalog_v2.supplier_*
-- stack). catalog_variant_id is the many-suppliers → one-variant relationship on that live table.
-- catalog_v2.supplier_products / catalog_supplier_product_map / catalog_v2.supplier_offers stay unused.

-- -----------------------------------------------------------------------------
-- 1) Nullable FK: one offer → at most one variant; many offers per variant
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS catalog_variant_id UUID;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_supplier_offers_catalog_variant_id'
      AND conrelid = 'catalogos.supplier_offers'::regclass
  ) THEN
    ALTER TABLE catalogos.supplier_offers
      ADD CONSTRAINT fk_supplier_offers_catalog_variant_id
      FOREIGN KEY (catalog_variant_id)
      REFERENCES catalog_v2.catalog_variants (id)
      ON DELETE SET NULL;
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS idx_supplier_offers_catalog_variant_id
  ON catalogos.supplier_offers (catalog_variant_id)
  WHERE catalog_variant_id IS NOT NULL;

COMMENT ON COLUMN catalogos.supplier_offers.catalog_variant_id IS
  'Canonical GloveCubs catalog_v2.catalog_variants.id. Supplier SKU and variant SKU stay distinct. ON DELETE SET NULL so deactivating/removing a variant does not destroy the supplier offer, and deleting a supplier (CASCADE on supplier_id) does not destroy the GloveCubs variant.';

-- Family integrity: mapped variant must belong to the same catalog product as the offer.
CREATE OR REPLACE FUNCTION catalogos.enforce_supplier_offer_variant_family()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.catalog_variant_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM catalog_v2.catalog_variants v
    WHERE v.id = NEW.catalog_variant_id
      AND v.catalog_product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION
      'supplier_offers.catalog_variant_id must reference a catalog_v2.catalog_variants row on the same catalog product as supplier_offers.product_id'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_supplier_offers_variant_family ON catalogos.supplier_offers;
CREATE TRIGGER trg_supplier_offers_variant_family
  BEFORE INSERT OR UPDATE OF catalog_variant_id, product_id
  ON catalogos.supplier_offers
  FOR EACH ROW
  EXECUTE FUNCTION catalogos.enforce_supplier_offer_variant_family();

-- -----------------------------------------------------------------------------
-- 2) Variant list: mapped active offers with sell_price only. Never cost.
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
WHERE v.is_active = true
GROUP BY v.id, v.catalog_product_id;

COMMENT ON VIEW catalogos.variant_best_offer_price IS
  'Per-variant min sell_price from active catalogos.supplier_offers mapped by catalog_variant_id. No SKU equality, no manufacturer-SKU lookup, no cost fallback, no sibling/parent fallback.';

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
  'Public read surface for storefront PDP variant list pricing (catalogos.variant_best_offer_price).';

GRANT SELECT ON public.variant_best_offer_price TO authenticated;
GRANT SELECT ON public.variant_best_offer_price TO service_role;

-- -----------------------------------------------------------------------------
-- 3) Case economics: same FK join + sell_price only (supersedes SKU/cost join in 20261218120100)
-- gc_commerce.resolve_buyer_unit_price is unchanged; it already reads this view.
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
  IF p_catalog_variant_ids IS NULL OR array_length(p_catalog_variant_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::JSONB);
  END IF;

  v_len := array_length(p_catalog_variant_ids, 1);
  IF v_len > 50 THEN
    RETURN jsonb_build_object('error', 'too_many_variant_ids', 'max', 50, 'received', v_len);
  END IF;

  FOREACH v_id IN ARRAY p_catalog_variant_ids
  LOOP
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
  'Server-authoritative case/pack economics per variant; list from mapped sell_price only. service_role only.';

REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM anon;
REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) TO postgres;
