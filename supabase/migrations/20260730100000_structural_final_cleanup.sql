-- =============================================================================
-- Structural final cleanup (single source paths; no legacy public.orders).
-- Order: carts → catalog view + product columns → inventory/stock_history →
--        tenancy. (Legacy orders: 20260730104900_drop_legacy_ar_purchase_orders_and_net30_functions.sql,
--        20260730105000_drop_reserve_stock_for_order_atomic.sql, 20260730105010_drop_release_stock_for_order_atomic.sql,
--        20260730105020_drop_deduct_stock_for_order_atomic.sql, 20260730105100_drop_legacy_orders_tables.sql,
--        20260730105200_create_orders_gc_read_view.sql; gc_* stock: 20260730110000_gc_reserve_stock_for_order_atomic.sql,
--        20260730110100_gc_release_stock_for_order_atomic.sql, 20260730110200_gc_deduct_stock_for_order_atomic.sql)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) gc_commerce.carts (replace public.carts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.carts (
  cart_key TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID REFERENCES gc_commerce.companies (id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gc_carts_user_id ON gc_commerce.carts (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE gc_commerce.carts IS 'Server-side carts; cart_key = user_<auth_uuid> or session_<token>.';

DO $$
BEGIN
  IF to_regclass('public.carts') IS NOT NULL THEN
    INSERT INTO gc_commerce.carts AS gcart (cart_key, user_id, company_id, items, updated_at)
    SELECT
      c.cart_key,
      CASE
        WHEN c.cart_key ~ '^user_[0-9a-fA-F-]{36}$' THEN substring(c.cart_key FROM 6)::uuid
        ELSE NULL
      END,
      NULL,
      COALESCE(c.items, '[]'::jsonb),
      COALESCE(c.updated_at, NOW())
    FROM public.carts c
    ON CONFLICT (cart_key) DO UPDATE SET
      items = EXCLUDED.items,
      updated_at = EXCLUDED.updated_at,
      user_id = COALESCE(gcart.user_id, EXCLUDED.user_id);
    DROP TABLE public.carts CASCADE;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Catalog read view: expose catalog UUID; drop legacy image columns on public.products
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.products_legacy_from_catalog_v2;
DROP VIEW IF EXISTS catalog_v2.v_products_legacy_shape;

CREATE VIEW catalog_v2.v_products_legacy_shape AS
SELECT
  cp.legacy_public_product_id AS id,
  cp.id AS canonical_product_id,
  cp.internal_sku AS sku,
  cp.name,
  COALESCE(cp.metadata->>'legacy_brand', '') AS brand,
  cost_l.min_unit_cost AS cost,
  NULLIF(cp.metadata->>'legacy_retail_price', '')::numeric AS price,
  NULLIF(cp.metadata->>'legacy_bulk_price', '')::numeric AS bulk_price,
  (
    SELECT i.url
    FROM catalog_v2.catalog_product_images i
    WHERE i.catalog_product_id = cp.id
    ORDER BY i.is_primary DESC, i.sort_order, i.created_at
    LIMIT 1
  ) AS image_url,
  cp.manufacturer_id,
  cp.created_at,
  cp.updated_at,
  cp.description,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'material'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS material,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'color'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS color,
  COALESCE(size_csv.sizes, '') AS sizes,
  NULLIF(cp.metadata->>'legacy_pack_qty', '')::integer AS pack_qty,
  NULLIF(cp.metadata->>'legacy_case_qty', '')::integer AS case_qty,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'category'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS category,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'subcategory'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS subcategory,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'thickness'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS thickness,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'powder'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS powder,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'grade'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS grade,
  cp.slug,
  COALESCE(NULLIF(cp.metadata->>'legacy_in_stock', '')::smallint, 1::smallint) AS in_stock,
  COALESCE(NULLIF(cp.metadata->>'legacy_featured', '')::smallint, 0::smallint) AS featured,
  cp.metadata->>'legacy_use_case' AS use_case,
  cp.metadata->>'legacy_certifications' AS certifications,
  cp.metadata->>'legacy_texture' AS texture,
  cp.metadata->>'legacy_cuff_style' AS cuff_style,
  cp.metadata->>'legacy_sterility' AS sterility,
  cp.metadata->>'legacy_video_url' AS video_url,
  COALESCE(cp.metadata->'legacy_industry_tags', '[]'::jsonb) AS industry_tags,
  COALESCE((
    SELECT jsonb_agg(trim(both from u.url) ORDER BY u.sort_order, u.created_at)
    FROM catalog_v2.catalog_product_images u
    WHERE u.catalog_product_id = cp.id
  ), '[]'::jsonb) AS images,
  COALESCE(cp.metadata->'legacy_attributes_snapshot', '{}'::jsonb) AS attributes,
  ARRAY[]::text[] AS attribute_warnings,
  '{}'::jsonb AS source_confidence
FROM catalog_v2.catalog_products cp
LEFT JOIN LATERAL (
  SELECT MIN(o.unit_cost) AS min_unit_cost
  FROM catalog_v2.catalog_variants cv
  INNER JOIN catalog_v2.catalog_supplier_product_map m ON m.catalog_variant_id = cv.id
  INNER JOIN catalog_v2.supplier_offers o ON o.supplier_product_id = m.supplier_product_id AND o.is_active = true
  WHERE cv.catalog_product_id = cp.id
) cost_l ON true
LEFT JOIN LATERAL (
  SELECT string_agg(vav.value_text, ',' ORDER BY cv.sort_order) AS sizes
  FROM catalog_v2.catalog_variants cv
  INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
  INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'size'
  WHERE cv.catalog_product_id = cp.id
) size_csv ON true
WHERE cp.legacy_public_product_id IS NOT NULL;

CREATE VIEW public.products_legacy_from_catalog_v2 AS
SELECT * FROM catalog_v2.v_products_legacy_shape;

COMMENT ON VIEW public.products_legacy_from_catalog_v2 IS 'Single read model for legacy-shaped products API; sourced from catalog_v2 only.';

ALTER TABLE public.products DROP COLUMN IF EXISTS image_url;
ALTER TABLE public.products DROP COLUMN IF EXISTS images;

-- Sync catalog row when legacy products row changes (writes stay on public.products; reads use view).
CREATE OR REPLACE FUNCTION catalog_v2.refresh_from_legacy_product(p_legacy_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, catalog_v2
AS $$
DECLARE
  r public.products%ROWTYPE;
  v_cp_id uuid;
BEGIN
  SELECT * INTO r FROM public.products WHERE id = p_legacy_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT id INTO v_cp_id FROM catalog_v2.catalog_products WHERE legacy_public_product_id = p_legacy_id LIMIT 1;
  IF v_cp_id IS NULL THEN
    PERFORM catalog_v2.backfill_legacy_public_products();
    RETURN;
  END IF;

  UPDATE catalog_v2.catalog_products SET
    name = COALESCE(r.name, name),
    description = r.description,
    internal_sku = COALESCE(NULLIF(trim(both from r.sku), ''), internal_sku),
    manufacturer_id = r.manufacturer_id,
    slug = COALESCE(NULLIF(trim(both from r.slug), ''), slug),
    status = CASE WHEN COALESCE(r.in_stock, 1) = 0 THEN 'draft' ELSE 'active' END,
    metadata = metadata || jsonb_build_object(
      'legacy_brand', r.brand,
      'legacy_retail_price', r.price,
      'legacy_bulk_price', r.bulk_price,
      'legacy_in_stock', r.in_stock,
      'legacy_featured', r.featured,
      'legacy_use_case', r.use_case,
      'legacy_certifications', r.certifications,
      'legacy_texture', r.texture,
      'legacy_cuff_style', r.cuff_style,
      'legacy_sterility', r.sterility,
      'legacy_video_url', r.video_url,
      'legacy_industry_tags', COALESCE(r.industry_tags, '[]'::jsonb),
      'legacy_pack_qty', r.pack_qty,
      'legacy_case_qty', r.case_qty,
      'legacy_attributes_snapshot', COALESCE(r.attributes, '{}'::jsonb)
    ),
    updated_at = now()
  WHERE id = v_cp_id;
END;
$$;

GRANT EXECUTE ON FUNCTION catalog_v2.refresh_from_legacy_product(bigint) TO postgres, service_role;

-- PostgREST RPC entrypoints (public schema; delegate to catalog_v2).
CREATE OR REPLACE FUNCTION public.catalog_v2_backfill_legacy_public_products()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, catalog_v2
AS $$
  SELECT catalog_v2.backfill_legacy_public_products();
$$;

CREATE OR REPLACE FUNCTION public.catalog_v2_refresh_from_legacy_product(p_legacy_id bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, catalog_v2
AS $$
  SELECT catalog_v2.refresh_from_legacy_product(p_legacy_id);
$$;

GRANT EXECUTE ON FUNCTION public.catalog_v2_backfill_legacy_public_products() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_v2_refresh_from_legacy_product(bigint) TO postgres, service_role;

-- -----------------------------------------------------------------------------
-- 3) Inventory + stock_history: catalog_v2 UUID only (drop BIGINT product_id)
-- -----------------------------------------------------------------------------
-- Abort before any DELETE if legacy bigint rows cannot map to catalog_v2 (prevents silent data loss).
DO $$
DECLARE
  orphan_inv integer;
  orphan_sh integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'product_id'
  ) THEN
    SELECT COUNT(*)::integer INTO orphan_inv
    FROM public.inventory i
    WHERE i.product_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM catalog_v2.catalog_products cp
        WHERE cp.legacy_public_product_id = i.product_id
      );
    IF orphan_inv > 0 THEN
      RAISE EXCEPTION
        'structural_final_cleanup blocked: % public.inventory row(s) have product_id with no catalog_v2.catalog_products.legacy_public_product_id match; backfill catalog or fix rows first',
        orphan_inv;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_history' AND column_name = 'product_id'
  ) THEN
    SELECT COUNT(*)::integer INTO orphan_sh
    FROM public.stock_history sh
    WHERE sh.product_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM catalog_v2.catalog_products cp
        WHERE cp.legacy_public_product_id = sh.product_id
      );
    IF orphan_sh > 0 THEN
      RAISE EXCEPTION
        'structural_final_cleanup blocked: % public.stock_history row(s) have product_id with no catalog_v2 match; fix before migrate',
        orphan_sh;
    END IF;
  END IF;
END $$;

UPDATE public.inventory i
SET canonical_product_id = cp.id
FROM catalog_v2.catalog_products cp
WHERE cp.legacy_public_product_id = i.product_id
  AND i.canonical_product_id IS DISTINCT FROM cp.id;

DELETE FROM public.inventory WHERE canonical_product_id IS NULL;

UPDATE public.stock_history sh
SET canonical_product_id = cp.id
FROM catalog_v2.catalog_products cp
WHERE cp.legacy_public_product_id = sh.product_id
  AND sh.canonical_product_id IS NULL;

DELETE FROM public.stock_history WHERE canonical_product_id IS NULL;

ALTER TABLE public.stock_history DROP CONSTRAINT IF EXISTS fk_stock_history_canonical_catalog_product;

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS fk_inventory_canonical_catalog_product;

ALTER TABLE public.stock_history DROP CONSTRAINT IF EXISTS stock_history_product_id_fkey;

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_product_id_fkey;
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_product_id_key;

DROP INDEX IF EXISTS idx_stock_history_product;

DROP INDEX IF EXISTS uq_inventory_canonical_product;

ALTER TABLE public.stock_history DROP COLUMN IF EXISTS product_id;

DROP VIEW IF EXISTS public.inventory_resolved;

ALTER TABLE public.inventory DROP COLUMN IF EXISTS product_id;

ALTER TABLE public.stock_history
  ALTER COLUMN canonical_product_id SET NOT NULL;

ALTER TABLE public.inventory
  ALTER COLUMN canonical_product_id SET NOT NULL;

ALTER TABLE public.stock_history
  ADD CONSTRAINT fk_stock_history_canonical_catalog_v2_product
  FOREIGN KEY (canonical_product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE RESTRICT;

ALTER TABLE public.inventory
  ADD CONSTRAINT fk_inventory_canonical_catalog_v2_product
  FOREIGN KEY (canonical_product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_canonical_product
  ON public.inventory (canonical_product_id);

CREATE VIEW public.inventory_resolved AS
SELECT
  inv.id,
  cp.legacy_public_product_id AS legacy_product_id,
  inv.canonical_product_id AS stored_canonical_product_id,
  cat.id AS catalog_product_id,
  inv.quantity_on_hand,
  inv.quantity_reserved,
  inv.reorder_point,
  inv.updated_at
FROM public.inventory inv
LEFT JOIN catalog_v2.catalog_products cp ON cp.id = inv.canonical_product_id
LEFT JOIN LATERAL (
  SELECT p.id
  FROM catalogos.products p
  WHERE cp.legacy_public_product_id IS NOT NULL
    AND p.live_product_id = cp.legacy_public_product_id
  ORDER BY p.updated_at DESC NULLS LAST
  LIMIT 1
) cat ON true;

COMMENT ON VIEW public.inventory_resolved IS
  'inventory.canonical_product_id references catalog_v2.catalog_products. catalog_product_id is catalogos.products.id when bridged via legacy_public_product_id/live_product_id; prefer canonical_product_id for catalog_v2 joins.';

-- -----------------------------------------------------------------------------
-- 5) Tenancy: company_members only (migrate profile company_id then drop column)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'company_id'
  ) THEN
    INSERT INTO gc_commerce.company_members (company_id, user_id, role)
    SELECT u.company_id, u.id, 'member'
    FROM public.users u
    WHERE u.company_id IS NOT NULL
    ON CONFLICT (company_id, user_id) DO NOTHING;
    ALTER TABLE public.users DROP COLUMN company_id;
  END IF;
END $$;
