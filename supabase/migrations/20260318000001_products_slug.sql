-- =============================================================================
-- Add slug to catalogos.products for storefront URLs and product detail.
-- =============================================================================

ALTER TABLE catalogos.products
  ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON catalogos.products (slug) WHERE slug IS NOT NULL;

COMMENT ON COLUMN catalogos.products.slug IS 'URL-safe unique identifier for storefront product detail (e.g. nitrile-exam-gloves-4mil-blue). Backfilled or set on publish.';
