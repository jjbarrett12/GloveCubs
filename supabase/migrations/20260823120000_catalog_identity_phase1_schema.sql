-- =============================================================================
-- Phase 1: catalog / commerce identity (schema only).
-- - catalogos.products.catalog_product_id → catalog_v2.catalog_products (nullable)
-- - Verify public.inventory FK to catalog_v2 (already applied in structural cleanup)
-- - gc_commerce.sellable_products.catalog_product_id → catalog_v2 (FK NOT VALID)
-- - Deprecate live_product_id: block new non-null writes via trigger
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) catalogos.products: canonical v2 product link (nullable until backfill/write path)
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.products
  ADD COLUMN IF NOT EXISTS catalog_product_id UUID;

COMMENT ON COLUMN catalogos.products.catalog_product_id IS
  'catalog_v2.catalog_products.id — canonical commerce/inventory identity. Populated by publish/write path; NOT NULL enforced in a later migration.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'catalogos'
      AND t.relname = 'products'
      AND c.conname = 'fk_catalogos_products_catalog_v2_product'
  ) THEN
    ALTER TABLE catalogos.products
      ADD CONSTRAINT fk_catalogos_products_catalog_v2_product
      FOREIGN KEY (catalog_product_id)
      REFERENCES catalog_v2.catalog_products (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalogos_products_catalog_product_id
  ON catalogos.products (catalog_product_id)
  WHERE catalog_product_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) public.inventory: ensure FK to catalog_v2 (idempotent if already present)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'fk_inventory_canonical_catalog_v2_product'
      AND n.nspname = 'public'
      AND t.relname = 'inventory'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT fk_inventory_canonical_catalog_v2_product
      FOREIGN KEY (canonical_product_id)
      REFERENCES catalog_v2.catalog_products (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

COMMENT ON CONSTRAINT fk_inventory_canonical_catalog_v2_product ON public.inventory IS
  'canonical_product_id must be catalog_v2.catalog_products.id for stock truth.';

-- -----------------------------------------------------------------------------
-- 3) gc_commerce.sellable_products: FK to catalog_v2 (NOT VALID until rows are v2-backed)
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN gc_commerce.sellable_products.catalog_product_id IS
  'catalog_v2.catalog_products.id — canonical commerce product identity.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'fk_gc_sellable_products_catalog_v2_product'
      AND n.nspname = 'gc_commerce'
      AND t.relname = 'sellable_products'
  ) THEN
    ALTER TABLE gc_commerce.sellable_products
      ADD CONSTRAINT fk_gc_sellable_products_catalog_v2_product
      FOREIGN KEY (catalog_product_id)
      REFERENCES catalog_v2.catalog_products (id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT fk_gc_sellable_products_catalog_v2_product ON gc_commerce.sellable_products IS
  'FK added NOT VALID so existing dev rows can be repaired; run VALIDATE CONSTRAINT after data backfill.';

-- -----------------------------------------------------------------------------
-- 4) live_product_id: deprecated — reject new bridge writes (clearing to NULL allowed)
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN catalogos.products.live_product_id IS
  'DEPRECATED: legacy bridge to public.products.id. Do not set on INSERT or change on UPDATE; use catalog_product_id → catalog_v2 instead.';

CREATE OR REPLACE FUNCTION catalogos.enforce_live_product_id_deprecated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = catalogos, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.live_product_id IS NOT NULL THEN
      RAISE EXCEPTION
        'catalogos.products.live_product_id is deprecated (no new bridge to public.products). Leave NULL and set catalog_product_id via catalog_v2.';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.live_product_id IS NOT NULL
       AND (OLD.live_product_id IS NULL OR NEW.live_product_id IS DISTINCT FROM OLD.live_product_id) THEN
      RAISE EXCEPTION
        'catalogos.products.live_product_id is deprecated. Cannot set or change to non-null; clear with NULL only.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalogos_products_live_product_id_deprecated ON catalogos.products;

CREATE TRIGGER trg_catalogos_products_live_product_id_deprecated
  BEFORE INSERT OR UPDATE ON catalogos.products
  FOR EACH ROW
  EXECUTE PROCEDURE catalogos.enforce_live_product_id_deprecated();

COMMENT ON FUNCTION catalogos.enforce_live_product_id_deprecated() IS
  'Blocks INSERT/UPDATE that set or change live_product_id to a non-null value; allows clearing to NULL.';
