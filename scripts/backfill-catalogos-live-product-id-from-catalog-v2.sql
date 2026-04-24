-- =============================================================================
-- Backfill catalogos.products.live_product_id → public.products.id bridge
--
-- Resolver contract (see lib/resolve-catalog-v2-product-id.js):
--   live_product_id = catalog_v2.catalog_products.legacy_public_product_id
--   (BIGINT FK to public.products.id).
--
-- SAFETY
--   1) Listings with ANY ambiguous match (multiple candidate legacy ids) are
--      REPORTED and EXCLUDED from all UPDATE phases — never silently picked.
--   2) Updates run ONLY if you opt in (same session) — default is dry-run.
--
-- Dry-run (default): reporting + exclusion list + zero updates
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backfill-catalogos-live-product-id-from-catalog-v2.sql
--
-- Apply (after reviewing output): same connection, then re-run file:
--   SELECT set_config('app.backfill_catalogos_live_product_id_apply', 'on', false);
--   \\i scripts/backfill-catalogos-live-product-id-from-catalog-v2.sql
-- (In Supabase SQL editor: run the set_config line, then run the rest in one batch.)
--
-- Re-runnable: active rows with live_product_id IS NULL only.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Opt-in: unset or any value other than 'on' => no UPDATE (dry-run).
-- ---------------------------------------------------------------------------
SELECT 'config: apply_updates' AS section,
       coalesce(current_setting('app.backfill_catalogos_live_product_id_apply', true), '(unset)') AS value,
       CASE
         WHEN coalesce(current_setting('app.backfill_catalogos_live_product_id_apply', true), '') = 'on' THEN 'UPDATES ENABLED'
         ELSE 'DRY RUN — no live_product_id writes (set app.backfill_catalogos_live_product_id_apply = on)'
       END AS mode;

-- ---------------------------------------------------------------------------
-- 0) Baseline
-- ---------------------------------------------------------------------------
SELECT 'before: active catalogos.products with live_product_id NULL' AS section,
       count(*)::bigint AS cnt
  FROM catalogos.products p
 WHERE p.is_active = true
   AND p.live_product_id IS NULL;

-- ---------------------------------------------------------------------------
-- 0c) Build exclusion set: ambiguous listings are NEVER auto-updated
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE backfill_catalogos_ambiguous_listing (
  catalogos_product_id UUID PRIMARY KEY,
  reasons TEXT NOT NULL
);

WITH
p1 AS (
  SELECT p.id AS catalogos_product_id,
         'phase1:multiple_distinct_legacy_from_internal_sku_match'::text AS r
    FROM catalogos.products p
   INNER JOIN catalog_v2.catalog_products cp
      ON lower(trim(both from coalesce(p.sku, ''))) = lower(trim(both from coalesce(cp.internal_sku, '')))
     AND cp.legacy_public_product_id IS NOT NULL
   INNER JOIN public.products pp ON pp.id = cp.legacy_public_product_id
   WHERE p.is_active = true
     AND p.live_product_id IS NULL
     AND trim(both from coalesce(cp.internal_sku, '')) <> ''
   GROUP BY p.id
  HAVING count(DISTINCT cp.legacy_public_product_id) > 1
),
p2 AS (
  SELECT p.id AS catalogos_product_id,
         'phase2:multiple_public_products_id_for_same_normalized_sku'::text AS r
    FROM catalogos.products p
   INNER JOIN public.products pp
      ON lower(trim(both from coalesce(p.sku, ''))) = lower(trim(both from coalesce(pp.sku, '')))
   WHERE p.is_active = true
     AND p.live_product_id IS NULL
   GROUP BY p.id
  HAVING count(DISTINCT pp.id) > 1
),
p3 AS (
  SELECT p.id AS catalogos_product_id,
         'phase3:multiple_distinct_legacy_from_variant_sku_match'::text AS r
    FROM catalogos.products p
   INNER JOIN catalog_v2.catalog_variants cv
      ON lower(trim(both from coalesce(p.sku, ''))) = lower(trim(both from coalesce(cv.variant_sku, '')))
   INNER JOIN catalog_v2.catalog_products cp
      ON cp.id = cv.catalog_product_id
     AND cp.legacy_public_product_id IS NOT NULL
   INNER JOIN public.products pp ON pp.id = cp.legacy_public_product_id
   WHERE p.is_active = true
     AND p.live_product_id IS NULL
     AND trim(both from coalesce(cv.variant_sku, '')) <> ''
   GROUP BY p.id
  HAVING count(DISTINCT cp.legacy_public_product_id) > 1
),
p4_alt AS (
  SELECT p.id AS product_id,
         nullif(
           trim(both from coalesce(
             p.attributes->>'supplier_sku',
             p.attributes->>'vendor_sku',
             p.attributes->>'supplier_item_number',
             p.attributes->>'item_number',
             ''
           )),
           ''
         ) AS alt_sku
    FROM catalogos.products p
   WHERE p.is_active = true
     AND p.live_product_id IS NULL
),
p4 AS (
  SELECT a.product_id AS catalogos_product_id,
         'phase4:multiple_distinct_legacy_from_attributes_alt_sku'::text AS r
    FROM p4_alt a
   INNER JOIN catalog_v2.catalog_products cp
      ON a.alt_sku IS NOT NULL
     AND lower(trim(both from a.alt_sku)) = lower(trim(both from coalesce(cp.internal_sku, '')))
     AND cp.legacy_public_product_id IS NOT NULL
   INNER JOIN public.products pp ON pp.id = cp.legacy_public_product_id
   GROUP BY a.product_id
  HAVING count(DISTINCT cp.legacy_public_product_id) > 1
),
combined AS (
  SELECT * FROM p1
  UNION ALL
  SELECT * FROM p2
  UNION ALL
  SELECT * FROM p3
  UNION ALL
  SELECT * FROM p4
)
INSERT INTO backfill_catalogos_ambiguous_listing (catalogos_product_id, reasons)
SELECT catalogos_product_id,
       string_agg(DISTINCT r, ' | ' ORDER BY r)
  FROM combined
 GROUP BY catalogos_product_id;

SELECT 'excluded_ambiguous_listing_count' AS section,
       count(*)::bigint AS cnt
  FROM backfill_catalogos_ambiguous_listing;

SELECT m.catalogos_product_id,
       p.sku,
       p.name,
       m.reasons
  FROM backfill_catalogos_ambiguous_listing m
  JOIN catalogos.products p ON p.id = m.catalogos_product_id
 ORDER BY m.reasons, p.sku;

-- ---------------------------------------------------------------------------
-- Phase 1: sku = catalog_products.internal_sku (ambiguous listings excluded)
-- ---------------------------------------------------------------------------
WITH map AS (
  SELECT DISTINCT ON (p.id)
         p.id AS product_id,
         cp.legacy_public_product_id AS live_product_id
    FROM catalogos.products p
   INNER JOIN catalog_v2.catalog_products cp
      ON lower(trim(both from coalesce(p.sku, ''))) = lower(trim(both from coalesce(cp.internal_sku, '')))
     AND cp.legacy_public_product_id IS NOT NULL
   INNER JOIN public.products pp ON pp.id = cp.legacy_public_product_id
   WHERE p.is_active = true
     AND p.live_product_id IS NULL
     AND trim(both from coalesce(cp.internal_sku, '')) <> ''
     AND NOT EXISTS (SELECT 1 FROM backfill_catalogos_ambiguous_listing x WHERE x.catalogos_product_id = p.id)
   ORDER BY p.id, cp.legacy_public_product_id ASC
),
upd AS (
  UPDATE catalogos.products p
     SET live_product_id = m.live_product_id,
         updated_at = now()
    FROM map m
   WHERE p.id = m.product_id
     AND coalesce(current_setting('app.backfill_catalogos_live_product_id_apply', true), '') = 'on'
RETURNING p.id
)
SELECT 'phase1_updated (sku = catalog_products.internal_sku)' AS section,
       count(*)::bigint AS rows_updated
  FROM upd;

-- ---------------------------------------------------------------------------
-- Phase 2: sku = public.products.sku (excludes multi-public-id ambiguity)
-- ---------------------------------------------------------------------------
WITH map AS (
  SELECT DISTINCT ON (p.id)
         p.id AS product_id,
         pp.id AS live_product_id
    FROM catalogos.products p
   INNER JOIN public.products pp
      ON lower(trim(both from coalesce(p.sku, ''))) = lower(trim(both from coalesce(pp.sku, '')))
   INNER JOIN catalog_v2.catalog_products cp
      ON cp.legacy_public_product_id = pp.id
   WHERE p.is_active = true
     AND p.live_product_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM backfill_catalogos_ambiguous_listing x WHERE x.catalogos_product_id = p.id)
   ORDER BY p.id, pp.id ASC
),
upd AS (
  UPDATE catalogos.products p
     SET live_product_id = m.live_product_id,
         updated_at = now()
    FROM map m
   WHERE p.id = m.product_id
     AND coalesce(current_setting('app.backfill_catalogos_live_product_id_apply', true), '') = 'on'
RETURNING p.id
)
SELECT 'phase2_updated (sku = public.products.sku)' AS section,
       count(*)::bigint AS rows_updated
  FROM upd;

-- ---------------------------------------------------------------------------
-- Phase 3: sku = catalog_variants.variant_sku
-- ---------------------------------------------------------------------------
WITH map AS (
  SELECT DISTINCT ON (p.id)
         p.id AS product_id,
         cp.legacy_public_product_id AS live_product_id
    FROM catalogos.products p
   INNER JOIN catalog_v2.catalog_variants cv
      ON lower(trim(both from coalesce(p.sku, ''))) = lower(trim(both from coalesce(cv.variant_sku, '')))
   INNER JOIN catalog_v2.catalog_products cp
      ON cp.id = cv.catalog_product_id
     AND cp.legacy_public_product_id IS NOT NULL
   INNER JOIN public.products pp ON pp.id = cp.legacy_public_product_id
   WHERE p.is_active = true
     AND p.live_product_id IS NULL
     AND trim(both from coalesce(cv.variant_sku, '')) <> ''
     AND NOT EXISTS (SELECT 1 FROM backfill_catalogos_ambiguous_listing x WHERE x.catalogos_product_id = p.id)
   ORDER BY p.id, cp.legacy_public_product_id ASC, cv.id ASC
),
upd AS (
  UPDATE catalogos.products p
     SET live_product_id = m.live_product_id,
         updated_at = now()
    FROM map m
   WHERE p.id = m.product_id
     AND coalesce(current_setting('app.backfill_catalogos_live_product_id_apply', true), '') = 'on'
RETURNING p.id
)
SELECT 'phase3_updated (sku = catalog_variants.variant_sku)' AS section,
       count(*)::bigint AS rows_updated
  FROM upd;

-- ---------------------------------------------------------------------------
-- Phase 4: attributes alt sku → internal_sku
-- ---------------------------------------------------------------------------
WITH alt AS (
  SELECT p.id AS product_id,
         nullif(
           trim(both from coalesce(
             p.attributes->>'supplier_sku',
             p.attributes->>'vendor_sku',
             p.attributes->>'supplier_item_number',
             p.attributes->>'item_number',
             ''
           )),
           ''
         ) AS alt_sku
    FROM catalogos.products p
   WHERE p.is_active = true
     AND p.live_product_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM backfill_catalogos_ambiguous_listing x WHERE x.catalogos_product_id = p.id)
),
map AS (
  SELECT DISTINCT ON (a.product_id)
         a.product_id,
         cp.legacy_public_product_id AS live_product_id
    FROM alt a
   INNER JOIN catalog_v2.catalog_products cp
      ON a.alt_sku IS NOT NULL
     AND lower(trim(both from a.alt_sku)) = lower(trim(both from coalesce(cp.internal_sku, '')))
     AND cp.legacy_public_product_id IS NOT NULL
   INNER JOIN public.products pp ON pp.id = cp.legacy_public_product_id
   ORDER BY a.product_id, cp.legacy_public_product_id ASC
),
upd AS (
  UPDATE catalogos.products p
     SET live_product_id = m.live_product_id,
         updated_at = now()
    FROM map m
   WHERE p.id = m.product_id
     AND coalesce(current_setting('app.backfill_catalogos_live_product_id_apply', true), '') = 'on'
RETURNING p.id
)
SELECT 'phase4_updated (attributes → internal_sku)' AS section,
       count(*)::bigint AS rows_updated
  FROM upd;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
SELECT 'after: active listings still without live_product_id' AS section,
       count(*)::bigint AS cnt
  FROM catalogos.products p
 WHERE p.is_active = true
   AND p.live_product_id IS NULL;

SELECT p.id AS catalogos_product_id,
       p.sku,
       p.name,
       p.is_active,
       p.published_at,
       CASE WHEN EXISTS (SELECT 1 FROM backfill_catalogos_ambiguous_listing x WHERE x.catalogos_product_id = p.id)
            THEN 'AMBIGUOUS_EXCLUDED'
            ELSE 'UNMAPPED'
       END AS review_bucket,
       m.reasons AS ambiguous_reasons,
       p.attributes->>'supplier_sku' AS attr_supplier_sku,
       p.attributes->>'vendor_sku' AS attr_vendor_sku,
       p.attributes->>'supplier_item_number' AS attr_supplier_item_number
  FROM catalogos.products p
  LEFT JOIN backfill_catalogos_ambiguous_listing m ON m.catalogos_product_id = p.id
 WHERE p.is_active = true
   AND p.live_product_id IS NULL
 ORDER BY review_bucket DESC, p.sku;

COMMIT;
