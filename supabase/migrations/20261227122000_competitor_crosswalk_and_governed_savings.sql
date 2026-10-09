-- Phase 2: competitor crosswalk + governed invoice comparison + sell-price-only listing/PA V2 views.
-- Additive. Does not replace CatalogOS matching, spec groups, or gc_resolve_buyer_unit_price.

-- -----------------------------------------------------------------------------
-- gc_commerce.competitor_products
-- External/competitor catalog. No manufacturer hardcoded in application logic.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.competitor_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer TEXT,
  brand TEXT,
  sku TEXT,
  upc_gtin TEXT,
  product_name TEXT,
  material TEXT,
  thickness_mil NUMERIC(8, 4),
  color TEXT,
  size TEXT,
  grade TEXT,
  powder TEXT,
  texture TEXT,
  cuff TEXT,
  aql TEXT,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  gloves_per_box NUMERIC(14, 4),
  boxes_per_case NUMERIC(14, 4),
  gloves_per_case NUMERIC(14, 4),
  quantity_uom TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_gc_competitor_products_quantity_uom CHECK (
    quantity_uom IS NULL OR quantity_uom IN ('EA', 'BX', 'CS')
  )
);

CREATE INDEX IF NOT EXISTS idx_gc_competitor_products_sku
  ON gc_commerce.competitor_products (sku)
  WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gc_competitor_products_upc
  ON gc_commerce.competitor_products (upc_gtin)
  WHERE upc_gtin IS NOT NULL;

COMMENT ON TABLE gc_commerce.competitor_products IS
  'Durable external/competitor products. Identification is via competitor_product_aliases; never inferred solely from fuzzy title.';

-- -----------------------------------------------------------------------------
-- gc_commerce.competitor_product_aliases
-- SKU / UPC / invoice description → competitor_products. Operator-confirmed aliases win forever.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.competitor_product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_product_id UUID NOT NULL REFERENCES gc_commerce.competitor_products (id) ON DELETE CASCADE,
  alias_type TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_gc_competitor_alias_type CHECK (
    alias_type IN ('sku', 'upc', 'invoice_description', 'manufacturer_sku')
  ),
  CONSTRAINT ck_gc_competitor_alias_source CHECK (
    source IN ('operator', 'system', 'invoice')
  ),
  CONSTRAINT uq_gc_competitor_alias_type_normalized UNIQUE (alias_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_gc_competitor_aliases_product
  ON gc_commerce.competitor_product_aliases (competitor_product_id);

COMMENT ON TABLE gc_commerce.competitor_product_aliases IS
  'Deterministic identification keys for competitor products. Unique (alias_type, normalized_value).';

-- -----------------------------------------------------------------------------
-- gc_commerce.competitor_equivalencies
-- EXTERNAL PRODUCT → GloveCubs product / optional spec group.
-- candidate → approved is operator-only. AI must never write status=approved.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.competitor_equivalencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_product_id UUID NOT NULL REFERENCES gc_commerce.competitor_products (id) ON DELETE CASCADE,
  catalog_product_id UUID,
  catalog_variant_id UUID,
  spec_group_id UUID REFERENCES gc_commerce.glove_spec_groups (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_gc_competitor_equivalency_status CHECK (
    status IN ('candidate', 'needs_review', 'approved', 'rejected')
  ),
  CONSTRAINT uq_gc_competitor_equivalency_pair UNIQUE (competitor_product_id, catalog_product_id)
);

CREATE INDEX IF NOT EXISTS idx_gc_competitor_equivalencies_competitor
  ON gc_commerce.competitor_equivalencies (competitor_product_id);
CREATE INDEX IF NOT EXISTS idx_gc_competitor_equivalencies_approved
  ON gc_commerce.competitor_equivalencies (competitor_product_id)
  WHERE status = 'approved';

COMMENT ON TABLE gc_commerce.competitor_equivalencies IS
  'Governed competitor → GloveCubs equivalency. Savings requires status=approved plus compatibility and UoM gates.';

-- -----------------------------------------------------------------------------
-- invoice_lines: comparison snapshot (reuse existing review_status; do not duplicate that enum)
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.invoice_lines
  ADD COLUMN IF NOT EXISTS competitor_product_id UUID REFERENCES gc_commerce.competitor_products (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_trust_status TEXT,
  ADD COLUMN IF NOT EXISTS comparison_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS comparison_block_reason TEXT;

DO $trust$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_gc_invoice_lines_match_trust_status'
      AND conrelid = 'gc_commerce.invoice_lines'::regclass
  ) THEN
    ALTER TABLE gc_commerce.invoice_lines
      ADD CONSTRAINT ck_gc_invoice_lines_match_trust_status CHECK (
        match_trust_status IS NULL OR match_trust_status IN (
          'unidentified',
          'candidate_match',
          'spec_review_required',
          'uom_review_required',
          'price_review_required',
          'incompatible',
          'insufficient_data',
          'verified',
          'high_confidence',
          'savings_ready'
        )
      );
  END IF;
END
$trust$;

CREATE INDEX IF NOT EXISTS idx_gc_invoice_lines_competitor
  ON gc_commerce.invoice_lines (competitor_product_id)
  WHERE competitor_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gc_invoice_lines_match_trust
  ON gc_commerce.invoice_lines (match_trust_status)
  WHERE match_trust_status IS NOT NULL;

COMMENT ON COLUMN gc_commerce.invoice_lines.match_trust_status IS
  'Categorical comparison trust (savings_ready only when approved equivalency + gates pass). Independent of review_status.';
COMMENT ON COLUMN gc_commerce.invoice_lines.comparison_snapshot IS
  'Authoritative invoice-line comparison DTO from the governed savings engine. Not a customer UI payload.';

GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.competitor_products TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.competitor_product_aliases TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.competitor_equivalencies TO postgres, service_role;

-- -----------------------------------------------------------------------------
-- Public / PA V2 list prices: sell_price only. Never COALESCE to supplier cost.
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
GROUP BY product_id;

COMMENT ON VIEW catalogos.product_best_offer_price IS
  'Per-product min public sell_price from active supplier_offers. Cost is never a fallback.';

GRANT SELECT ON catalogos.product_best_offer_price TO authenticated;
GRANT SELECT ON catalogos.product_best_offer_price TO service_role;

-- Variant list pricing is NOT redefined here. catalogos.variant_best_offer_price
-- remains the production definition until 20261227122100, which replaces the
-- SKU-equality join with catalogos.supplier_offers.catalog_variant_id.
-- Do not recreate a variant_sku = supplier_sku join in this file.
