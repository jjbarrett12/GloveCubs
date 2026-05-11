-- =============================================================================
-- catalog_v2 image governance — provenance + content_hash dedup
-- =============================================================================
-- Purpose:
--   Make catalog imagery operationally trustworthy at the DB level:
--     1. Backfill metadata so legacy rows pass the new CHECK.
--     2. Require metadata.image_provenance ∈
--        (supplier_feed, manufacturer, manual_upload, editorial, placeholder).
--     3. Index metadata.content_hash for dedup audits.
--     4. Block exact-duplicate uploads per parent via a partial UNIQUE index
--        on (catalog_product_id, content_hash).
--   Same pattern is applied to catalog_variant_images.
--
-- Doctrine:
--   Active products may not rely solely on placeholder images (enforced by the
--   active-product guard in the next migration, not here). This file only
--   guarantees provenance is recorded and uploads cannot collide silently.
--
-- Idempotency:
--   All steps use IF NOT EXISTS / NOT VALID + VALIDATE so re-runs are safe.
--
-- Backfill choice:
--   Legacy image rows missing image_provenance are tagged 'manual_upload'.
--   This is the safest default: it does NOT mark anything as 'placeholder',
--   so the active-product guard will not retroactively demote products. If
--   CatalogOS later proves provenance for these rows, it can rewrite to
--   'supplier_feed' / 'manufacturer' / 'editorial'.
--
-- Rollback:
--   ALTER TABLE catalog_v2.catalog_product_images
--     DROP CONSTRAINT IF EXISTS chk_catalog_product_images_provenance;
--   DROP INDEX IF EXISTS catalog_v2.idx_catalog_product_images_content_hash;
--   DROP INDEX IF EXISTS catalog_v2.uq_catalog_product_images_product_content_hash;
--   ALTER TABLE catalog_v2.catalog_variant_images
--     DROP CONSTRAINT IF EXISTS chk_catalog_variant_images_provenance;
--   DROP INDEX IF EXISTS catalog_v2.idx_catalog_variant_images_content_hash;
--   DROP INDEX IF EXISTS catalog_v2.uq_catalog_variant_images_variant_content_hash;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- catalog_product_images
-- -----------------------------------------------------------------------------

ALTER TABLE catalog_v2.catalog_product_images
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE catalog_v2.catalog_product_images
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('image_provenance', 'manual_upload')
WHERE metadata IS NULL
   OR NOT (metadata ? 'image_provenance')
   OR COALESCE(metadata->>'image_provenance', '') NOT IN
        ('supplier_feed','manufacturer','manual_upload','editorial','placeholder');

ALTER TABLE catalog_v2.catalog_product_images
  DROP CONSTRAINT IF EXISTS chk_catalog_product_images_provenance;

ALTER TABLE catalog_v2.catalog_product_images
  ADD CONSTRAINT chk_catalog_product_images_provenance
  CHECK (
    metadata ? 'image_provenance'
    AND metadata->>'image_provenance' IN
      ('supplier_feed','manufacturer','manual_upload','editorial','placeholder')
  ) NOT VALID;

ALTER TABLE catalog_v2.catalog_product_images
  VALIDATE CONSTRAINT chk_catalog_product_images_provenance;

CREATE INDEX IF NOT EXISTS idx_catalog_product_images_content_hash
  ON catalog_v2.catalog_product_images ((metadata->>'content_hash'))
  WHERE metadata ? 'content_hash';

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_product_images_product_content_hash
  ON catalog_v2.catalog_product_images (catalog_product_id, (metadata->>'content_hash'))
  WHERE metadata ? 'content_hash';

COMMENT ON CONSTRAINT chk_catalog_product_images_provenance
  ON catalog_v2.catalog_product_images IS
  'Image governance: every parent image declares provenance. Active products may not rely solely on placeholder (enforced by active-product trigger).';

COMMENT ON INDEX catalog_v2.uq_catalog_product_images_product_content_hash IS
  'Image dedup: same content_hash cannot be uploaded twice for the same parent product. content_hash is sha-1 of the fetched image bytes, written by CatalogOS during media validation.';

-- -----------------------------------------------------------------------------
-- catalog_variant_images (parallel governance)
-- -----------------------------------------------------------------------------

ALTER TABLE catalog_v2.catalog_variant_images
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE catalog_v2.catalog_variant_images
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('image_provenance', 'manual_upload')
WHERE metadata IS NULL
   OR NOT (metadata ? 'image_provenance')
   OR COALESCE(metadata->>'image_provenance', '') NOT IN
        ('supplier_feed','manufacturer','manual_upload','editorial','placeholder');

ALTER TABLE catalog_v2.catalog_variant_images
  DROP CONSTRAINT IF EXISTS chk_catalog_variant_images_provenance;

ALTER TABLE catalog_v2.catalog_variant_images
  ADD CONSTRAINT chk_catalog_variant_images_provenance
  CHECK (
    metadata ? 'image_provenance'
    AND metadata->>'image_provenance' IN
      ('supplier_feed','manufacturer','manual_upload','editorial','placeholder')
  ) NOT VALID;

ALTER TABLE catalog_v2.catalog_variant_images
  VALIDATE CONSTRAINT chk_catalog_variant_images_provenance;

CREATE INDEX IF NOT EXISTS idx_catalog_variant_images_content_hash
  ON catalog_v2.catalog_variant_images ((metadata->>'content_hash'))
  WHERE metadata ? 'content_hash';

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_variant_images_variant_content_hash
  ON catalog_v2.catalog_variant_images (catalog_variant_id, (metadata->>'content_hash'))
  WHERE metadata ? 'content_hash';

COMMENT ON CONSTRAINT chk_catalog_variant_images_provenance
  ON catalog_v2.catalog_variant_images IS
  'Image governance (variant-level): same enum and dedup rules as catalog_product_images.';
