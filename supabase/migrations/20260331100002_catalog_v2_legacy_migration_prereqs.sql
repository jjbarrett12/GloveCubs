-- =============================================================================
-- Catalog v2 — prerequisites for legacy public.products → catalog_v2 backfill
-- =============================================================================
-- Idempotent: safe to re-run. Creates:
--   - Partial UNIQUE on catalog_products.legacy_public_product_id (one parent / legacy row)
--   - Stable UUID rows for legacy product type + synthetic migration supplier
--   - Attribute definitions for type "legacy_glove" (glove-oriented columns)
-- =============================================================================

-- One catalog_product per legacy public.products row (when bridged)
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_v2_products_legacy_public_id
  ON catalog_v2.catalog_products (legacy_public_product_id)
  WHERE legacy_public_product_id IS NOT NULL;

COMMENT ON INDEX catalog_v2.uq_catalog_v2_products_legacy_public_id IS 'Ensures idempotent backfill: at most one v2 parent per legacy products.id.';

-- Stable IDs (do not change after first deploy — backfill and FKs depend on them)
-- Product type: migrated legacy gloves / disposable SKUs from public.products
INSERT INTO catalog_v2.catalog_product_types (id, code, name, description, sort_order, is_active)
VALUES (
  'b1111111-1111-4111-8111-111111111111'::uuid,
  'legacy_glove',
  'Legacy GloveCubs products',
  'Migrated rows from public.products; use more specific types for new lines.',
  0,
  true
)
ON CONFLICT (code) DO NOTHING;

-- Synthetic supplier for legacy cost/offer rows (no real supplier on public.products)
INSERT INTO catalogos.suppliers (id, name, slug, settings, is_active)
VALUES (
  'a0000001-0000-4000-8000-000000000001'::uuid,
  'GloveCubs Legacy Catalog',
  'glovecubs-legacy-catalog',
  '{}'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Attribute definitions (fixed UUIDs for idempotent value upserts in backfill)
INSERT INTO catalog_v2.catalog_attribute_definitions (id, product_type_id, attribute_key, label, value_type, is_variant_axis, is_filterable, is_searchable, sort_order)
VALUES
  ('c1111111-1111-4111-8111-000000000001'::uuid, 'b1111111-1111-4111-8111-111111111111'::uuid, 'material', 'Material', 'string', false, true, true, 10),
  ('c1111111-1111-4111-8111-000000000002'::uuid, 'b1111111-1111-4111-8111-111111111111'::uuid, 'color', 'Color', 'string', false, true, true, 20),
  ('c1111111-1111-4111-8111-000000000003'::uuid, 'b1111111-1111-4111-8111-111111111111'::uuid, 'size', 'Size', 'string', true, true, true, 30),
  ('c1111111-1111-4111-8111-000000000004'::uuid, 'b1111111-1111-4111-8111-111111111111'::uuid, 'thickness', 'Thickness', 'string', false, true, true, 40),
  ('c1111111-1111-4111-8111-000000000005'::uuid, 'b1111111-1111-4111-8111-111111111111'::uuid, 'powder', 'Powder', 'string', false, true, false, 50),
  ('c1111111-1111-4111-8111-000000000006'::uuid, 'b1111111-1111-4111-8111-111111111111'::uuid, 'grade', 'Grade', 'string', false, true, false, 60),
  ('c1111111-1111-4111-8111-000000000007'::uuid, 'b1111111-1111-4111-8111-111111111111'::uuid, 'category', 'Category', 'string', false, true, true, 70),
  ('c1111111-1111-4111-8111-000000000008'::uuid, 'b1111111-1111-4111-8111-111111111111'::uuid, 'subcategory', 'Subcategory', 'string', false, false, false, 80)
ON CONFLICT (product_type_id, attribute_key) DO NOTHING;
