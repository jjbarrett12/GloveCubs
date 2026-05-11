-- =============================================================================
-- catalog_v2.catalog_products — active-product publish guard (trigger)
-- =============================================================================
-- Purpose:
--   A product may not become status='active' unless all of:
--     1. ≥1 active variant exists (catalog_v2.catalog_variants is_active=true)
--     2. ≥1 non-placeholder image exists in catalog_v2.catalog_product_images
--        (image_provenance != 'placeholder')
--     3. metadata.category_id is set
--     4. metadata.category_id resolves to a valid catalogos.categories row
--
-- Trigger choice — INITIALLY DEFERRED CONSTRAINT TRIGGER:
--   CatalogOS promotion writes the product graph (parent → variants → images
--   → attributes → publish_state) inside one transaction. A non-deferred
--   BEFORE-trigger would fire on the parent INSERT before children exist and
--   reject the entire transaction.
--
--   Postgres lets us declare a CONSTRAINT TRIGGER as INITIALLY DEFERRED so it
--   fires at COMMIT (or earlier with SET CONSTRAINTS IMMEDIATE), giving the
--   ingestion writer one transaction-shaped window to assemble everything.
--
--   Tradeoff: deferred triggers cannot run BEFORE; they run AFTER. We therefore
--   enforce by RAISE EXCEPTION at COMMIT — any violation aborts the whole
--   transaction. The CatalogOS writer sees a single failure rather than
--   partially-applied rows.
--
-- Storefront visibility today:
--   Storefront filters by catalog_products.status='active' only
--   (catalog_publish_state is unused by the read path). This trigger therefore
--   protects the live customer surface directly, without requiring a
--   storefront code change.
--
-- Idempotency:
--   DROP TRIGGER IF EXISTS / CREATE OR REPLACE FUNCTION; safe to re-run.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_catalog_products_active_guard
--     ON catalog_v2.catalog_products;
--   DROP FUNCTION IF EXISTS catalog_v2.fn_catalog_products_active_guard();
-- =============================================================================

CREATE OR REPLACE FUNCTION catalog_v2.fn_catalog_products_active_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_category_id_text TEXT;
  v_category_uuid UUID;
  v_active_variants INT;
  v_real_images INT;
  v_category_exists BOOLEAN;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  -- 1. ≥1 active variant
  SELECT COUNT(*)::INT INTO v_active_variants
  FROM catalog_v2.catalog_variants v
  WHERE v.catalog_product_id = NEW.id
    AND v.is_active = true;

  IF v_active_variants < 1 THEN
    RAISE EXCEPTION
      'catalog_v2 active-product guard: product % cannot be active without ≥1 active variant',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. ≥1 non-placeholder image
  SELECT COUNT(*)::INT INTO v_real_images
  FROM catalog_v2.catalog_product_images i
  WHERE i.catalog_product_id = NEW.id
    AND COALESCE(i.metadata->>'image_provenance', '') <> 'placeholder';

  IF v_real_images < 1 THEN
    RAISE EXCEPTION
      'catalog_v2 active-product guard: product % cannot be active without ≥1 non-placeholder image',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. metadata.category_id present
  v_category_id_text := NEW.metadata->>'category_id';
  IF v_category_id_text IS NULL OR v_category_id_text = '' THEN
    RAISE EXCEPTION
      'catalog_v2 active-product guard: product % cannot be active without metadata.category_id',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. metadata.category_id resolves to a real catalogos.categories row
  BEGIN
    v_category_uuid := v_category_id_text::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION
      'catalog_v2 active-product guard: product % has non-UUID metadata.category_id (%)',
      NEW.id, v_category_id_text
      USING ERRCODE = 'check_violation';
  END;

  SELECT EXISTS (
    SELECT 1 FROM catalogos.categories c WHERE c.id = v_category_uuid
  ) INTO v_category_exists;

  IF NOT v_category_exists THEN
    RAISE EXCEPTION
      'catalog_v2 active-product guard: product % references unknown catalogos.categories.id (%)',
      NEW.id, v_category_uuid
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION catalog_v2.fn_catalog_products_active_guard IS
  'Phase 1 publish integrity: blocks status=''active'' without ≥1 active variant + ≥1 non-placeholder image + valid catalogos.categories link. Runs DEFERRED so CatalogOS can build the product graph in one transaction.';

DROP TRIGGER IF EXISTS trg_catalog_products_active_guard ON catalog_v2.catalog_products;

CREATE CONSTRAINT TRIGGER trg_catalog_products_active_guard
  AFTER INSERT OR UPDATE OF status, metadata
  ON catalog_v2.catalog_products
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION catalog_v2.fn_catalog_products_active_guard();

COMMENT ON TRIGGER trg_catalog_products_active_guard ON catalog_v2.catalog_products IS
  'Active-product publish integrity. CatalogOS writer should keep the entire promotion in one transaction; this trigger fires at COMMIT.';
