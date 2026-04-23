-- =============================================================================
-- Product families and size variants: schema for family inference and staging.
-- - product_families: shared attributes (brand, material, thickness, color, etc.)
-- - products.family_id: variant products belong to a family
-- - supplier_products_normalized: inferred base SKU, size, family group, confidence
-- =============================================================================

-- Product families (parent): one per glove line; variants differ only by size.
CREATE TABLE IF NOT EXISTS catalogos.product_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES catalogos.categories(id) ON DELETE RESTRICT,
  brand_id UUID REFERENCES catalogos.brands(id) ON DELETE SET NULL,
  description TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_families_base_sku UNIQUE (base_sku)
);

CREATE INDEX idx_product_families_base_sku ON catalogos.product_families (base_sku);
CREATE INDEX idx_product_families_category ON catalogos.product_families (category_id);
CREATE INDEX idx_product_families_brand ON catalogos.product_families (brand_id);

COMMENT ON TABLE catalogos.product_families IS 'Product family (glove line); shared attributes; size variants reference via products.family_id.';

-- Products may be standalone or a size variant of a family.
ALTER TABLE catalogos.products
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES catalogos.product_families(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_family_id ON catalogos.products (family_id) WHERE family_id IS NOT NULL;

COMMENT ON COLUMN catalogos.products.family_id IS 'When set, this product is a size variant of the given family; offer/pricing is per variant.';

-- Staging: inferred family/variant for review and publish.
ALTER TABLE catalogos.supplier_products_normalized
  ADD COLUMN IF NOT EXISTS inferred_base_sku TEXT,
  ADD COLUMN IF NOT EXISTS inferred_size TEXT,
  ADD COLUMN IF NOT EXISTS family_group_key TEXT,
  ADD COLUMN IF NOT EXISTS grouping_confidence NUMERIC(5,4) CHECK (grouping_confidence IS NULL OR (grouping_confidence >= 0 AND grouping_confidence <= 1));

CREATE INDEX IF NOT EXISTS idx_spn_family_group_key ON catalogos.supplier_products_normalized (family_group_key) WHERE family_group_key IS NOT NULL;

COMMENT ON COLUMN catalogos.supplier_products_normalized.inferred_base_sku IS 'Base SKU inferred from variant SKU (e.g. GL-N125F from GL-N125FS).';
COMMENT ON COLUMN catalogos.supplier_products_normalized.inferred_size IS 'Size inferred from SKU suffix or title/specs (e.g. S, M, L, XL).';
COMMENT ON COLUMN catalogos.supplier_products_normalized.family_group_key IS 'Stable key for grouping staging rows into one family (base_sku + shared attrs).';
COMMENT ON COLUMN catalogos.supplier_products_normalized.grouping_confidence IS 'Confidence that this row belongs to the inferred family (0-1); only auto-group when above threshold.';
