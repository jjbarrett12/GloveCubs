-- =============================================================================
-- Order / inventory alignment with CatalogOS UUID catalog (launch blocker).
-- Additive: new UUID columns, backfill from catalogos.products.live_product_id,
-- FK to catalogos.products(id), compatibility views. Legacy BIGINT columns kept.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) order_items: catalog product UUID (same id as public.canonical_products.id)
-- -----------------------------------------------------------------------------
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS canonical_product_id UUID;

COMMENT ON COLUMN public.order_items.canonical_product_id IS
  'catalogos.products.id / canonical_products.id. Populated for new writes; backfilled from legacy product_id via catalogos.products.live_product_id. Legacy product_id BIGINT retained for history.';

CREATE INDEX IF NOT EXISTS idx_order_items_canonical_product
  ON public.order_items (canonical_product_id)
  WHERE canonical_product_id IS NOT NULL;

-- Backfill: legacy public.products.id stored on order_items.product_id -> catalogos.products.live_product_id
UPDATE public.order_items oi
SET canonical_product_id = p.id
FROM catalogos.products p
WHERE oi.canonical_product_id IS NULL
  AND p.live_product_id IS NOT NULL
  AND p.live_product_id = oi.product_id;

-- FK (deferrable so batch loads can reorder; normal app paths satisfy immediately)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_items_canonical_catalog_product'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT fk_order_items_canonical_catalog_product
      FOREIGN KEY (canonical_product_id)
      REFERENCES catalogos.products (id)
      ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) inventory: parallel UUID column (same mapping)
-- -----------------------------------------------------------------------------
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS canonical_product_id UUID;

COMMENT ON COLUMN public.inventory.canonical_product_id IS
  'catalogos.products.id for joins to canonical_products / storefront. Legacy product_id BIGINT FK to public.products retained.';

UPDATE public.inventory inv
SET canonical_product_id = p.id
FROM catalogos.products p
WHERE inv.canonical_product_id IS NULL
  AND p.live_product_id IS NOT NULL
  AND p.live_product_id = inv.product_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_canonical_product
  ON public.inventory (canonical_product_id)
  WHERE canonical_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_canonical_product
  ON public.inventory (canonical_product_id)
  WHERE canonical_product_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_canonical_catalog_product'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT fk_inventory_canonical_catalog_product
      FOREIGN KEY (canonical_product_id)
      REFERENCES catalogos.products (id)
      ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3) Compatibility views (public schema; join-friendly for PostgREST)
-- Resolved UUID = explicit column OR bridge via live_product_id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.order_items_resolved AS
SELECT
  oi.id,
  oi.order_id,
  oi.product_id AS legacy_product_id,
  oi.canonical_product_id AS stored_canonical_product_id,
  COALESCE(
    oi.canonical_product_id,
    (SELECT p.id FROM catalogos.products p
     WHERE p.live_product_id = oi.product_id
     ORDER BY p.updated_at DESC NULLS LAST
     LIMIT 1)
  ) AS catalog_product_id,
  oi.quantity,
  oi.unit_price,
  oi.size,
  oi.created_at
FROM public.order_items oi;

COMMENT ON VIEW public.order_items_resolved IS
  'Use catalog_product_id for joins to public.canonical_products / catalogos.products. Nullable when no catalog mapping exists.';

CREATE OR REPLACE VIEW public.inventory_resolved AS
SELECT
  inv.id,
  inv.product_id AS legacy_product_id,
  inv.canonical_product_id AS stored_canonical_product_id,
  COALESCE(
    inv.canonical_product_id,
    (SELECT p.id FROM catalogos.products p
     WHERE p.live_product_id = inv.product_id
     ORDER BY p.updated_at DESC NULLS LAST
     LIMIT 1)
  ) AS catalog_product_id,
  inv.quantity_on_hand,
  inv.quantity_reserved,
  inv.reorder_point,
  inv.updated_at
FROM public.inventory inv;

COMMENT ON VIEW public.inventory_resolved IS
  'Resolved UUID for inventory rows; prefer writes to inventory.canonical_product_id going forward.';

-- -----------------------------------------------------------------------------
-- 4) Carts (JSONB): document-only in migration; no schema change required.
-- Application should persist canonical_product_id (UUID string) inside items[] alongside legacy product_id when present.
-- -----------------------------------------------------------------------------
