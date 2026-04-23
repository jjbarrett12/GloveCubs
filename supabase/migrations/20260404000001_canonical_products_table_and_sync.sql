-- =============================================================================
-- Productionization: public.canonical_products as live-product surface for
-- storefront search. Single source of truth: catalogos.products (+ attributes).
-- Storefront product search and jobs depend on this table; it must exist before
-- storefront migrations that ALTER TABLE canonical_products.
-- =============================================================================

-- Create table so storefront migrations (search_vector, material, etc.) can run.
CREATE TABLE IF NOT EXISTS public.canonical_products (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  sku TEXT NOT NULL,
  category_id UUID,
  category TEXT,
  brand_id UUID,
  description TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  material TEXT,
  glove_type TEXT,
  size TEXT,
  color TEXT,
  pack_size INTEGER,
  search_vector TSVECTOR,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.canonical_products IS 'Live product list for storefront search; synced from catalogos.products. Run catalogos.sync_canonical_products() to refresh.';

CREATE INDEX IF NOT EXISTS idx_canonical_products_sku ON public.canonical_products (sku);
CREATE INDEX IF NOT EXISTS idx_canonical_products_is_active ON public.canonical_products (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_canonical_products_category ON public.canonical_products (category) WHERE category IS NOT NULL;

-- Sync function: refresh public.canonical_products from catalogos.products.
-- Call after publish or on schedule. Safe to run repeatedly (upsert by id).
CREATE OR REPLACE FUNCTION catalogos.sync_canonical_products()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos, public
AS $$
DECLARE
  affected INT := 0;
BEGIN
  INSERT INTO public.canonical_products (
    id, name, title, sku, category_id, category, brand_id, description, attributes,
    material, glove_type, size, color, pack_size, is_active, created_at, updated_at
  )
  SELECT
    p.id,
    p.name,
    p.name,
    p.sku,
    p.category_id,
    c.slug,
    p.brand_id,
    p.description,
    COALESCE(p.attributes, '{}'::jsonb),
    (p.attributes->>'material')::TEXT,
    (p.attributes->>'glove_type')::TEXT,
    (p.attributes->>'size')::TEXT,
    (p.attributes->>'color')::TEXT,
    (p.attributes->>'pack_size')::INTEGER,
    COALESCE(p.is_active, true),
    p.created_at,
    p.updated_at
  FROM catalogos.products p
  LEFT JOIN catalogos.categories c ON c.id = p.category_id
  WHERE p.is_active = true
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    title = EXCLUDED.name,
    sku = EXCLUDED.sku,
    category_id = EXCLUDED.category_id,
    category = EXCLUDED.category,
    brand_id = EXCLUDED.brand_id,
    description = EXCLUDED.description,
    attributes = EXCLUDED.attributes,
    material = EXCLUDED.material,
    glove_type = EXCLUDED.glove_type,
    size = EXCLUDED.size,
    color = EXCLUDED.color,
    pack_size = EXCLUDED.pack_size,
    is_active = EXCLUDED.is_active,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON FUNCTION catalogos.sync_canonical_products IS 'Upsert public.canonical_products from catalogos.products; call after publish or on cron.';

-- Initial backfill from existing catalogos.products
SELECT catalogos.sync_canonical_products();
