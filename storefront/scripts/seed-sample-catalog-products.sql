-- Sample products for empty dev/staging databases (run in Supabase SQL Editor).
-- Does NOT change schema — inserts rows only.
-- Requires existing migrations so catalog_v2 + catalogos exist.

-- 1) Product family row (one type for all demo SKUs)
INSERT INTO catalog_v2.catalog_product_types (code, name, sort_order, is_active)
SELECT 'gc_demo_gloves', 'Demo gloves', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_v2.catalog_product_types WHERE code = 'gc_demo_gloves'
);

-- 2) Fifteen active parent products (no variants — enough for /store listing)
INSERT INTO catalog_v2.catalog_products (product_type_id, slug, name, status)
SELECT
  (SELECT id FROM catalog_v2.catalog_product_types WHERE code = 'gc_demo_gloves' LIMIT 1),
  'demo-product-' || n,
  'Demo Product ' || n,
  'active'
FROM generate_series(1, 15) AS n
WHERE EXISTS (SELECT 1 FROM catalog_v2.catalog_product_types WHERE code = 'gc_demo_gloves')
ON CONFLICT (slug) DO NOTHING;
