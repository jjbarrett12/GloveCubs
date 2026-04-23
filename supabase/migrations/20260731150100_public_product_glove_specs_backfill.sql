-- Phase 2 backfill: copy glove-only columns from glove_products → product_glove_specs
-- by strict SKU match (p.sku = g.sku). Idempotent: skips existing product_glove_specs rows.
--
-- Rollback order (manual; matches 20260731150000 header):
--   1) DROP VIEW IF EXISTS public.v_audit_glove_products_unmatched_public_product_sku;
--   2) DROP VIEW IF EXISTS public.v_products_with_glove_specs;
--   3) DROP TABLE IF EXISTS public.product_glove_specs;
--
-- Backfill strategy (chosen): GUARDED INSERT + reporting.
-- Reason: invalid source rows (e.g. bad glove_type) must not roll back inserts for
-- all other valid rows. Invalid matches are excluded by the INSERT predicate and
-- counted/sampled in the summary DO block below.

-- Fail fast if normalized SKU is not unique on either side (strict join could match
-- multiple product rows or duplicate glove rows; INSERT would be unsafe).
DO $$
DECLARE
  v_dup_norm_products INT;
  v_dup_norm_gloves INT;
BEGIN
  SELECT COUNT(*) INTO v_dup_norm_products
  FROM (
    SELECT lower(trim(p.sku)) AS nsku
    FROM public.products p
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) x;

  SELECT COUNT(*) INTO v_dup_norm_gloves
  FROM (
    SELECT lower(trim(g.sku)) AS nsku
    FROM public.glove_products g
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) y;

  IF v_dup_norm_products > 0 THEN
    RAISE EXCEPTION
      'product_glove_specs backfill blocked: % duplicate normalized SKU groups in public.products (fix data before deploy)',
      v_dup_norm_products;
  END IF;

  IF v_dup_norm_gloves > 0 THEN
    RAISE EXCEPTION
      'product_glove_specs backfill blocked: % duplicate normalized SKU groups in public.glove_products (fix data before deploy)',
      v_dup_norm_gloves;
  END IF;
END $$;

INSERT INTO public.product_glove_specs (
  product_id,
  glove_type,
  material,
  thickness_mil,
  cut_level,
  impact_rating,
  chemical_resistance,
  heat_resistance_c,
  cold_rating,
  grip,
  lining,
  coating,
  waterproof,
  food_safe,
  medical_grade,
  chemo_rated,
  powder_free,
  sterile,
  cuff_length_mm,
  durability_score,
  dexterity_score,
  protection_score,
  legacy_glove_product_id,
  created_at,
  updated_at
)
SELECT
  p.id,
  g.glove_type,
  g.material,
  g.thickness_mil,
  g.cut_level,
  g.impact_rating,
  g.chemical_resistance,
  g.heat_resistance_c,
  g.cold_rating,
  g.grip,
  g.lining,
  g.coating,
  g.waterproof,
  g.food_safe,
  g.medical_grade,
  g.chemo_rated,
  g.powder_free,
  g.sterile,
  g.cuff_length_mm,
  g.durability_score,
  g.dexterity_score,
  g.protection_score,
  g.id,
  NOW(),
  NOW()
FROM public.glove_products g
INNER JOIN public.products p ON p.sku = g.sku
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_glove_specs s WHERE s.product_id = p.id
)
AND g.glove_type IN ('disposable', 'reusable');

-- Surface unmatched glove rows (no public.products row with the same sku) for manual review.
CREATE OR REPLACE VIEW public.v_audit_glove_products_unmatched_public_product_sku AS
SELECT
  g.id,
  g.sku,
  g.name,
  g.active,
  g.created_at
FROM public.glove_products g
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p WHERE p.sku = g.sku
);

COMMENT ON VIEW public.v_audit_glove_products_unmatched_public_product_sku IS
  'glove_products rows with no public.products.sku match; safe to inspect for data cleanup outside commerce paths.';

GRANT SELECT ON public.v_audit_glove_products_unmatched_public_product_sku TO postgres, service_role;

DO $$
DECLARE
  v_specs_total BIGINT;
  v_glove_with_product BIGINT;
  v_glove_unmatched BIGINT;
  v_dup_glove_sku BIGINT;
  v_dup_product_sku BIGINT;
  v_sample TEXT;
  v_case_ws_only BIGINT;
  v_excluded_invalid_type BIGINT;
  v_excluded_sample TEXT;
  v_matched_missing_specs BIGINT;
  v_dup_legacy BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_specs_total FROM public.product_glove_specs;

  SELECT COUNT(*) INTO v_glove_with_product
  FROM public.glove_products g
  WHERE EXISTS (SELECT 1 FROM public.products p WHERE p.sku = g.sku);

  SELECT COUNT(*) INTO v_glove_unmatched
  FROM public.glove_products g
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.sku = g.sku);

  SELECT COUNT(*) INTO v_dup_glove_sku
  FROM (
    SELECT g.sku FROM public.glove_products g GROUP BY g.sku HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*) INTO v_dup_product_sku
  FROM (
    SELECT p.sku FROM public.products p GROUP BY p.sku HAVING COUNT(*) > 1
  ) d;

  -- Strict vs normalized-equal-only pairs (diagnostic; join remains strict).
  SELECT COUNT(*) INTO v_case_ws_only
  FROM public.glove_products g
  INNER JOIN public.products p ON lower(trim(p.sku)) = lower(trim(g.sku))
  WHERE p.sku IS DISTINCT FROM g.sku;

  SELECT COUNT(*) INTO v_excluded_invalid_type
  FROM public.glove_products g
  INNER JOIN public.products p ON p.sku = g.sku
  WHERE g.glove_type IS DISTINCT FROM 'disposable'::text
    AND g.glove_type IS DISTINCT FROM 'reusable'::text;

  SELECT string_agg(sku, ', ' ORDER BY sku)
  INTO v_excluded_sample
  FROM (
    SELECT g.sku
    FROM public.glove_products g
    INNER JOIN public.products p ON p.sku = g.sku
    WHERE g.glove_type IS DISTINCT FROM 'disposable'::text
      AND g.glove_type IS DISTINCT FROM 'reusable'::text
    ORDER BY g.sku
    LIMIT 10
  ) t;

  SELECT COUNT(*) INTO v_matched_missing_specs
  FROM public.products p
  INNER JOIN public.glove_products g ON p.sku = g.sku
  LEFT JOIN public.product_glove_specs s ON s.product_id = p.id
  WHERE s.product_id IS NULL
    AND g.glove_type IN ('disposable', 'reusable');

  SELECT COUNT(*) INTO v_dup_legacy
  FROM (
    SELECT legacy_glove_product_id
    FROM public.product_glove_specs
    WHERE legacy_glove_product_id IS NOT NULL
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) z;

  SELECT string_agg(sku, ', ' ORDER BY sku)
  INTO v_sample
  FROM (
    SELECT g.sku
    FROM public.glove_products g
    WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.sku = g.sku)
    ORDER BY g.sku
    LIMIT 10
  ) t;

  RAISE NOTICE 'product_glove_specs row count: %', v_specs_total;
  RAISE NOTICE 'glove_products rows with matching products.sku (strict): %', v_glove_with_product;
  RAISE NOTICE 'glove_products rows with NO matching products.sku (strict): %', v_glove_unmatched;
  RAISE NOTICE 'pairs where normalized sku matches but strict sku differs (diagnostic): %', v_case_ws_only;
  RAISE NOTICE 'glove_products rows matched by sku but excluded (invalid glove_type): %', v_excluded_invalid_type;
  RAISE NOTICE 'sample skus excluded for invalid glove_type (up to 10): %', COALESCE(v_excluded_sample, '(none)');
  RAISE NOTICE 'strict sku match + valid glove_type but still missing product_glove_specs (expect 0): %', v_matched_missing_specs;
  RAISE NOTICE 'duplicate legacy_glove_product_id in product_glove_specs (expect 0): %', v_dup_legacy;
  RAISE NOTICE 'duplicate sku count (glove_products, strict): %', v_dup_glove_sku;
  RAISE NOTICE 'duplicate sku count (products, strict): %', v_dup_product_sku;
  RAISE NOTICE 'sample unmatched glove skus strict join (up to 10): %', COALESCE(v_sample, '(none)');
END $$;

-- ---------------------------------------------------------------------------
-- Pre-deploy / copy-paste validation SQL
--
-- A) Invalid glove_type on rows that would otherwise match a product by strict sku
-- SELECT g.id, g.sku, g.glove_type
-- FROM public.glove_products g
-- INNER JOIN public.products p ON p.sku = g.sku
-- WHERE g.glove_type IS DISTINCT FROM 'disposable' AND g.glove_type IS DISTINCT FROM 'reusable';
--
-- B) Case / whitespace-only mismatches (diagnostic; join stays p.sku = g.sku)
-- SELECT g.sku AS glove_sku, p.sku AS product_sku
-- FROM public.glove_products g
-- INNER JOIN public.products p ON lower(trim(p.sku)) = lower(trim(g.sku))
-- WHERE p.sku IS DISTINCT FROM g.sku
-- LIMIT 200;
--
-- C) Duplicate normalized SKUs (must be empty before backfill; also enforced above)
-- SELECT lower(trim(g.sku)) AS nsku, COUNT(*) AS n
-- FROM public.glove_products g
-- GROUP BY 1 HAVING COUNT(*) > 1;
-- SELECT lower(trim(p.sku)) AS nsku, COUNT(*) AS n
-- FROM public.products p
-- GROUP BY 1 HAVING COUNT(*) > 1;
--
-- D) Post-backfill: every strict match with valid glove_type has a spec row (expect 0 rows)
-- SELECT p.id, p.sku, g.id AS glove_id
-- FROM public.products p
-- INNER JOIN public.glove_products g ON p.sku = g.sku
-- LEFT JOIN public.product_glove_specs s ON s.product_id = p.id
-- WHERE s.product_id IS NULL
--   AND g.glove_type IN ('disposable', 'reusable');
--
-- E) Unmatched glove rows (strict)
-- SELECT * FROM public.v_audit_glove_products_unmatched_public_product_sku ORDER BY sku LIMIT 200;
--
-- F) Duplicate legacy glove mapping (expect 0 rows)
-- SELECT legacy_glove_product_id, COUNT(*) AS n
-- FROM public.product_glove_specs
-- WHERE legacy_glove_product_id IS NOT NULL
-- GROUP BY 1 HAVING COUNT(*) > 1;
-- ---------------------------------------------------------------------------
