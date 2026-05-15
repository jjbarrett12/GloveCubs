-- =============================================================================
-- Phase D1: Company-scoped customer glove quicklist (variant-first, no price truth).
-- Separate domain from procurement_reorder_memory, saved_lists, and order reorder.
-- =============================================================================

CREATE TABLE IF NOT EXISTS gc_commerce.company_quicklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES gc_commerce.companies (id) ON DELETE CASCADE,
  catalog_product_id UUID NOT NULL,
  catalog_variant_id UUID NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  admin_note TEXT,
  created_by_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  CONSTRAINT ck_gc_quicklist_sort_order_nonneg CHECK (sort_order >= 0)
);

COMMENT ON TABLE gc_commerce.company_quicklist_items IS
  'Admin-curated, company-scoped glove quicklist lines (variant-first). Not procurement reorder memory, not user favorites, not quote cart storage. No stored prices or quantity truth.';

COMMENT ON COLUMN gc_commerce.company_quicklist_items.catalog_product_id IS
  'Denormalized catalog_v2.catalog_products.id; must match catalog_variant_id parent (enforced by trigger).';

COMMENT ON COLUMN gc_commerce.company_quicklist_items.catalog_variant_id IS
  'Primary line identity: catalog_v2.catalog_variants.id. One active row per company + variant.';

COMMENT ON COLUMN gc_commerce.company_quicklist_items.admin_note IS
  'Optional internal ops note; not buyer-facing unless surfaced explicitly by application.';

COMMENT ON COLUMN gc_commerce.company_quicklist_items.valid_to IS
  'When set, row is archived (soft remove). NULL = active quicklist line.';

-- -----------------------------------------------------------------------------
-- Cross-schema FKs (same pattern as gc_commerce.order_lines.catalog_variant_id)
-- -----------------------------------------------------------------------------
DO $fk_product$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'gc_commerce'
      AND t.relname = 'company_quicklist_items'
      AND c.conname = 'fk_gc_quicklist_catalog_product'
  ) THEN
    ALTER TABLE gc_commerce.company_quicklist_items
      ADD CONSTRAINT fk_gc_quicklist_catalog_product
      FOREIGN KEY (catalog_product_id)
      REFERENCES catalog_v2.catalog_products (id)
      ON DELETE RESTRICT;
  END IF;
END
$fk_product$;

DO $fk_variant$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'gc_commerce'
      AND t.relname = 'company_quicklist_items'
      AND c.conname = 'fk_gc_quicklist_catalog_variant'
  ) THEN
    ALTER TABLE gc_commerce.company_quicklist_items
      ADD CONSTRAINT fk_gc_quicklist_catalog_variant
      FOREIGN KEY (catalog_variant_id)
      REFERENCES catalog_v2.catalog_variants (id)
      ON DELETE RESTRICT;
  END IF;
END
$fk_variant$;

-- Application rules (also enforced by trigger below):
-- - catalog_variant_id must belong to catalog_product_id (no product-only rows).
-- - No unit prices, currency, quantity defaults, user_id ownership, or payment fields.

CREATE OR REPLACE FUNCTION gc_commerce.enforce_company_quicklist_variant_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = gc_commerce, catalog_v2, pg_catalog
AS $fn$
DECLARE
  v_product_id UUID;
BEGIN
  SELECT v.catalog_product_id
  INTO v_product_id
  FROM catalog_v2.catalog_variants v
  WHERE v.id = NEW.catalog_variant_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'quicklist_variant_not_found' USING ERRCODE = '23503';
  END IF;

  IF v_product_id IS DISTINCT FROM NEW.catalog_product_id THEN
    RAISE EXCEPTION 'quicklist_variant_product_mismatch' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_gc_quicklist_variant_product ON gc_commerce.company_quicklist_items;

CREATE TRIGGER trg_gc_quicklist_variant_product
  BEFORE INSERT OR UPDATE OF catalog_product_id, catalog_variant_id
  ON gc_commerce.company_quicklist_items
  FOR EACH ROW
  EXECUTE FUNCTION gc_commerce.enforce_company_quicklist_variant_product();

CREATE UNIQUE INDEX IF NOT EXISTS uq_gc_quicklist_active_company_variant
  ON gc_commerce.company_quicklist_items (company_id, catalog_variant_id)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_gc_quicklist_active_company_sort
  ON gc_commerce.company_quicklist_items (company_id, sort_order)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_gc_quicklist_company
  ON gc_commerce.company_quicklist_items (company_id);

-- -----------------------------------------------------------------------------
-- RLS: buyers read own company rows; writes via service_role admin APIs only
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.company_quicklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_quicklist_items_select_member ON gc_commerce.company_quicklist_items;

CREATE POLICY gc_quicklist_items_select_member
  ON gc_commerce.company_quicklist_items
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id
      FROM gc_commerce.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated (deny by default).

GRANT SELECT ON TABLE gc_commerce.company_quicklist_items TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE gc_commerce.company_quicklist_items TO postgres, service_role;
