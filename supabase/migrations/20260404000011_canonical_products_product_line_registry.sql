-- =============================================================================
-- Apply product_line_code to public.canonical_products and extend
-- catalogos.sync_canonical_products after the table is created (20260404000001).
-- =============================================================================

ALTER TABLE public.canonical_products
  ADD COLUMN IF NOT EXISTS product_line_code TEXT NOT NULL DEFAULT 'ppe_gloves';

COMMENT ON COLUMN public.canonical_products.product_line_code IS 'Product line for merchandising and search token sets; derived from category map in sync.';
COMMENT ON COLUMN public.canonical_products.glove_type IS 'Legacy extracted facet for hand-protection lines only; new lines should use attributes JSONB—do not repurpose for unrelated categories.';

CREATE INDEX IF NOT EXISTS idx_canonical_products_product_line
  ON public.canonical_products (product_line_code) WHERE is_active = true;

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
    material, glove_type, size, color, pack_size, product_line_code, is_active, created_at, updated_at
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
    COALESCE(m.product_line_code, 'ppe_gloves'),
    COALESCE(p.is_active, true),
    p.created_at,
    p.updated_at
  FROM catalogos.products p
  LEFT JOIN catalogos.categories c ON c.id = p.category_id
  LEFT JOIN catalogos.category_product_line m ON m.category_slug = c.slug
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
    product_line_code = EXCLUDED.product_line_code,
    is_active = EXCLUDED.is_active,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON FUNCTION catalogos.sync_canonical_products IS 'Upsert public.canonical_products from catalogos.products; sets product_line_code via category_product_line map.';

UPDATE public.canonical_products cp
SET product_line_code = COALESCE(m.product_line_code, 'ppe_gloves')
FROM catalogos.categories c
LEFT JOIN catalogos.category_product_line m ON m.category_slug = c.slug
WHERE cp.category_id IS NOT NULL
  AND c.id = cp.category_id;

UPDATE public.canonical_products cp
SET product_line_code = m.product_line_code
FROM catalogos.category_product_line m
WHERE cp.category IS NOT NULL
  AND m.category_slug = cp.category;
