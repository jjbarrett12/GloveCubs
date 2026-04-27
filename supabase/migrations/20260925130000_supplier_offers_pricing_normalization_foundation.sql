-- =============================================================================
-- Supplier offers: explicit currency / cost basis / pack + normalized unit cost
-- (foundation for pricing intelligence — no savings math here).
-- =============================================================================

ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS cost_basis TEXT NOT NULL DEFAULT 'per_case',
  ADD COLUMN IF NOT EXISTS pack_qty NUMERIC,
  ADD COLUMN IF NOT EXISTS normalized_unit_cost_minor BIGINT,
  ADD COLUMN IF NOT EXISTS normalized_unit_uom TEXT,
  ADD COLUMN IF NOT EXISTS normalization_confidence TEXT NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS normalization_notes JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN catalogos.supplier_offers.currency_code IS 'Supplier offer currency; USD-only until multi-currency is modeled.';
COMMENT ON COLUMN catalogos.supplier_offers.cost_basis IS 'How cost is quoted: per_case, per_each, or per_pair.';
COMMENT ON COLUMN catalogos.supplier_offers.pack_qty IS 'Units per pack when cost_basis is per_case (often mirrors units_per_case).';
COMMENT ON COLUMN catalogos.supplier_offers.normalized_unit_cost_minor IS 'Acquisition cost in currency minor units per normalized_unit_uom when derivable.';
COMMENT ON COLUMN catalogos.supplier_offers.normalization_notes IS 'JSON array of {code,detail} audit entries for normalization.';

DO $c$
BEGIN
  ALTER TABLE catalogos.supplier_offers
    ADD CONSTRAINT chk_supplier_offers_currency_code_usd
    CHECK (currency_code = 'USD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $c$;

DO $c$
BEGIN
  ALTER TABLE catalogos.supplier_offers
    ADD CONSTRAINT chk_supplier_offers_cost_basis
    CHECK (cost_basis IN ('per_case', 'per_each', 'per_pair'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $c$;

DO $c$
BEGIN
  ALTER TABLE catalogos.supplier_offers
    ADD CONSTRAINT chk_supplier_offers_pack_qty_positive
    CHECK (pack_qty IS NULL OR pack_qty > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $c$;

DO $c$
BEGIN
  ALTER TABLE catalogos.supplier_offers
    ADD CONSTRAINT chk_supplier_offers_normalized_unit_cost_minor_nonneg
    CHECK (normalized_unit_cost_minor IS NULL OR normalized_unit_cost_minor >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $c$;

DO $c$
BEGIN
  ALTER TABLE catalogos.supplier_offers
    ADD CONSTRAINT chk_supplier_offers_normalization_confidence
    CHECK (normalization_confidence IN ('high', 'medium', 'low'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $c$;

-- Backfill: per_case + positive units_per_case → derive per-each minor cost
UPDATE catalogos.supplier_offers so
SET
  pack_qty = so.units_per_case::NUMERIC,
  normalized_unit_cost_minor = ROUND(so.cost * 100 / so.units_per_case)::BIGINT,
  normalized_unit_uom = 'each',
  normalization_confidence = 'medium',
  normalization_notes = '[
    {
      "code": "assumed_cost_per_case",
      "detail": "Backfill: cost interpreted as USD per case; pack_qty from units_per_case; normalized_unit_cost_minor = round(cost*100/units_per_case) cents per each."
    }
  ]'::JSONB
WHERE so.cost_basis = 'per_case'
  AND so.units_per_case IS NOT NULL
  AND so.units_per_case > 0;

-- Backfill: per_case but missing pack size → cannot normalize; explicit low + note
UPDATE catalogos.supplier_offers so
SET
  pack_qty = NULL,
  normalized_unit_cost_minor = NULL,
  normalized_unit_uom = NULL,
  normalization_confidence = 'low',
  normalization_notes = '[
    {
      "code": "missing_units_per_case",
      "detail": "Backfill: cost_basis is per_case but units_per_case is null or not positive; normalized unit cost not derived."
    }
  ]'::JSONB
WHERE so.cost_basis = 'per_case'
  AND (so.units_per_case IS NULL OR so.units_per_case <= 0);

-- Keep public view aligned with catalogos.supplier_offers (additive columns).
DO $body$
BEGIN
  IF to_regclass('catalogos.supplier_offers') IS NOT NULL THEN
    EXECUTE 'DROP VIEW IF EXISTS public.supplier_offers';
    EXECUTE $v$
CREATE VIEW public.supplier_offers AS
SELECT
  so.id,
  so.supplier_id,
  so.product_id,
  so.supplier_sku AS sku,
  so.cost,
  so.sell_price,
  COALESCE(so.sell_price, so.cost) AS price,
  so.lead_time_days,
  so.raw_id,
  so.normalized_id,
  so.is_active,
  so.created_at,
  so.updated_at,
  so.units_per_case,
  so.currency_code,
  so.cost_basis,
  so.pack_qty,
  so.normalized_unit_cost_minor,
  so.normalized_unit_uom,
  so.normalization_confidence,
  so.normalization_notes,
  p.name AS product_name
FROM catalogos.supplier_offers so
LEFT JOIN catalog_v2.catalog_products p ON p.id = so.product_id
$v$;
    EXECUTE 'COMMENT ON VIEW public.supplier_offers IS ''Public view over catalogos.supplier_offers; product_name from catalog_v2.catalog_products; pricing normalization columns included.''';
  END IF;
END $body$;
