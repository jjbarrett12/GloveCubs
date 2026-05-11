-- =============================================================================
-- catalog_v2.catalog_variants — identity hardening (GTIN + attribute signature)
-- =============================================================================
-- Purpose:
--   Prevent silent duplicate sellable identities at the DB level.
--   Adds two partial UNIQUE constraints:
--     1. gtin must be unique when present
--     2. (catalog_product_id, attribute_signature) must be unique when present
--
-- Doctrine:
--   Product identity must remain stable. Duplicates must be observable
--   internally and routed to catalog_v2.catalog_match_reviews, never silently
--   inserted. CatalogOS (ingestion authority) is responsible for computing
--   attribute_signature deterministically.
--
-- Idempotency:
--   Safe to re-run; CREATE UNIQUE INDEX IF NOT EXISTS skips when present.
--
-- Pre-flight audit (run BEFORE applying; recommended in CatalogOS / SQL editor):
--
--   -- Existing duplicate GTINs (must be zero or routed to review):
--   SELECT gtin, COUNT(*) AS dupes,
--          array_agg(id ORDER BY created_at) AS variant_ids
--   FROM catalog_v2.catalog_variants
--   WHERE gtin IS NOT NULL
--   GROUP BY gtin
--   HAVING COUNT(*) > 1
--   ORDER BY dupes DESC;
--
--   -- Existing duplicate (parent, signature) pairs:
--   SELECT catalog_product_id, attribute_signature, COUNT(*) AS dupes,
--          array_agg(id ORDER BY created_at) AS variant_ids
--   FROM catalog_v2.catalog_variants
--   WHERE attribute_signature IS NOT NULL
--   GROUP BY catalog_product_id, attribute_signature
--   HAVING COUNT(*) > 1
--   ORDER BY dupes DESC;
--
-- Rollback:
--   DROP INDEX IF EXISTS catalog_v2.uq_catalog_variants_gtin_nn;
--   DROP INDEX IF EXISTS catalog_v2.uq_catalog_variants_product_signature_nn;
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_variants_gtin_nn
  ON catalog_v2.catalog_variants (gtin)
  WHERE gtin IS NOT NULL;

COMMENT ON INDEX catalog_v2.uq_catalog_variants_gtin_nn IS
  'Identity hardening: one variant per GTIN/UPC. NULL gtin allowed. Collisions must be routed to catalog_match_reviews by CatalogOS.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_variants_product_signature_nn
  ON catalog_v2.catalog_variants (catalog_product_id, attribute_signature)
  WHERE attribute_signature IS NOT NULL;

COMMENT ON INDEX catalog_v2.uq_catalog_variants_product_signature_nn IS
  'Identity hardening: one variant per (parent, attribute_signature). attribute_signature is computed deterministically by CatalogOS from material/color/size_code/thickness_mil/powder/grade/pack_size.';
