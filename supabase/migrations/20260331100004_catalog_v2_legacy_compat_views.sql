-- =============================================================================
-- Catalog v2 — compatibility views (legacy public.products row shape)
-- =============================================================================
-- Reconstructs one row per legacy products.id from catalog_v2 after backfill.
-- Use for gradual API migration; does NOT replace public.products for writes.
-- =============================================================================

CREATE OR REPLACE VIEW catalog_v2.v_products_legacy_shape AS
SELECT
  cp.legacy_public_product_id AS id,
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

COMMENT ON VIEW catalog_v2.v_products_legacy_shape IS 'Read model matching legacy products row shape; fed from catalog_v2 after backfill.';

-- PostgREST / Supabase client: public wrapper (same column names as public.products for SELECT *)
CREATE OR REPLACE VIEW public.products_legacy_from_catalog_v2 AS
SELECT * FROM catalog_v2.v_products_legacy_shape;

COMMENT ON VIEW public.products_legacy_from_catalog_v2 IS 'Flip productsService read path to this view when PRODUCTS_READ_SOURCE=catalog_v2_compat (see docs/catalog-migration-backfill.md).';
