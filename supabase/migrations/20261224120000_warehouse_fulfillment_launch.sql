-- =============================================================================
-- Warehouse + dropship launch (stocked | dropship only).
-- Canonical warehouse stock: catalog_v2.variant_inventory + variant_stock_history.
-- Quantities are sellable CASE units unless a conversion model is added later.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Normalize legacy purchase_order statuses before constraint
-- -----------------------------------------------------------------------------
UPDATE public.purchase_orders
SET status = CASE
  WHEN lower(btrim(status)) IN ('open', 'pending', 'submitted', 'ordered') THEN 'sent'
  WHEN lower(btrim(status)) IN ('partial', 'partially received', 'partial_received') THEN 'partially_received'
  WHEN lower(btrim(status)) IN ('complete', 'completed', 'closed', 'fulfilled') THEN 'received'
  WHEN lower(btrim(status)) IN ('canceled', 'void', 'voided') THEN 'cancelled'
  WHEN lower(btrim(status)) IN ('draft', 'sent', 'partially_received', 'received', 'cancelled') THEN lower(btrim(status))
  ELSE 'draft'
END
WHERE status IS NULL
   OR lower(btrim(status)) NOT IN ('draft', 'sent', 'partially_received', 'received', 'cancelled');

-- -----------------------------------------------------------------------------
-- 1) Variant fulfillment configuration (stocked | dropship)
-- -----------------------------------------------------------------------------
ALTER TABLE catalog_v2.catalog_variants
  ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NOT NULL DEFAULT 'dropship',
  ADD COLUMN IF NOT EXISTS inventory_visibility TEXT NOT NULL DEFAULT 'hidden',
  ADD COLUMN IF NOT EXISTS stock_enforcement BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_location_code TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS default_bin_location TEXT,
  ADD COLUMN IF NOT EXISTS reorder_point INT NOT NULL DEFAULT 0;

ALTER TABLE catalog_v2.catalog_variants
  DROP CONSTRAINT IF EXISTS chk_catalog_variants_fulfillment_mode;

ALTER TABLE catalog_v2.catalog_variants
  ADD CONSTRAINT chk_catalog_variants_fulfillment_mode
  CHECK (fulfillment_mode IN ('dropship', 'stocked'));

ALTER TABLE catalog_v2.catalog_variants
  DROP CONSTRAINT IF EXISTS chk_catalog_variants_inventory_visibility;

ALTER TABLE catalog_v2.catalog_variants
  ADD CONSTRAINT chk_catalog_variants_inventory_visibility
  CHECK (inventory_visibility IN ('hidden', 'status', 'quantity'));

-- Coerce any legacy hybrid values before generated column
UPDATE catalog_v2.catalog_variants
SET fulfillment_mode = 'dropship'
WHERE fulfillment_mode NOT IN ('dropship', 'stocked');

ALTER TABLE catalog_v2.catalog_variants
  DROP COLUMN IF EXISTS inventory_tracking;

ALTER TABLE catalog_v2.catalog_variants
  ADD COLUMN inventory_tracking BOOLEAN
    GENERATED ALWAYS AS (fulfillment_mode = 'stocked') STORED;

COMMENT ON COLUMN catalog_v2.catalog_variants.fulfillment_mode IS
  'stocked = GloveCubs warehouse (case units); dropship = third-party fulfillment, no local stock.';
COMMENT ON COLUMN catalog_v2.catalog_variants.inventory_tracking IS
  'Generated: true only when fulfillment_mode is stocked.';

-- Backfill: GloveCubs-manufactured / explicitly stocked only
UPDATE catalog_v2.catalog_variants cv
SET fulfillment_mode = 'stocked'
WHERE cv.fulfillment_mode = 'dropship'
  AND (
    COALESCE(cv.metadata->>'fulfillment_mode', cv.metadata->>'inventory_mode', '') IN ('stocked', 'warehouse', 'stock')
    OR COALESCE(cv.metadata->>'glovecubs_manufactured', cv.metadata->>'glovecubs_manufactured', '') IN ('true', '1', 'yes')
  );

UPDATE catalog_v2.catalog_variants cv
SET inventory_visibility = 'quantity'
WHERE COALESCE(cv.metadata->>'inventory_visibility', '') = 'quantity'
  AND cv.inventory_visibility = 'hidden';

UPDATE catalog_v2.catalog_variants cv
SET stock_enforcement = true
WHERE COALESCE(cv.metadata->>'stock_enforcement', '') IN ('true', '1', 'yes')
  AND cv.stock_enforcement = false;

CREATE INDEX IF NOT EXISTS idx_catalog_variants_fulfillment_mode
  ON catalog_v2.catalog_variants (fulfillment_mode)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_catalog_variants_inventory_tracking
  ON catalog_v2.catalog_variants (inventory_tracking)
  WHERE is_active = true AND inventory_tracking = true;

-- -----------------------------------------------------------------------------
-- 2) Variant inventory (case UOM)
-- -----------------------------------------------------------------------------
ALTER TABLE catalog_v2.variant_inventory
  ADD COLUMN IF NOT EXISTS reorder_point INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bin_location TEXT,
  ADD COLUMN IF NOT EXISTS incoming_quantity INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_count_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quantity_uom TEXT NOT NULL DEFAULT 'case';

COMMENT ON COLUMN catalog_v2.variant_inventory.quantity_on_hand IS
  'Sellable case units on hand (launch UOM).';
COMMENT ON COLUMN catalog_v2.variant_inventory.quantity_reserved IS
  'Sellable case units reserved for confirmed orders.';
COMMENT ON COLUMN catalog_v2.variant_inventory.quantity_uom IS
  'Launch inventory UOM; case only.';

ALTER TABLE catalog_v2.variant_inventory
  DROP CONSTRAINT IF EXISTS variant_inventory_quantity_reserved_lte_onhand;

ALTER TABLE catalog_v2.variant_inventory
  ADD CONSTRAINT variant_inventory_quantity_reserved_lte_onhand
  CHECK (quantity_reserved <= quantity_on_hand);

ALTER TABLE catalog_v2.variant_inventory
  DROP CONSTRAINT IF EXISTS chk_variant_inventory_quantity_uom;

ALTER TABLE catalog_v2.variant_inventory
  ADD CONSTRAINT chk_variant_inventory_quantity_uom
  CHECK (quantity_uom = 'case');

-- -----------------------------------------------------------------------------
-- 3) Variant stock ledger
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_v2.variant_stock_history (
  id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  catalog_variant_id UUID NOT NULL REFERENCES catalog_v2.catalog_variants(id) ON DELETE CASCADE,
  location_code TEXT NOT NULL DEFAULT 'default',
  delta INT NOT NULL,
  type TEXT NOT NULL,
  reference_type TEXT,
  reference_id BIGINT,
  notes TEXT,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  balance_after INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_variant_stock_history_variant
  ON catalog_v2.variant_stock_history (catalog_variant_id, created_at DESC);

ALTER TABLE catalog_v2.variant_stock_history ENABLE ROW LEVEL SECURITY;

-- Fulfillment change audit
CREATE TABLE IF NOT EXISTS catalog_v2.variant_fulfillment_audit (
  id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  catalog_variant_id UUID NOT NULL REFERENCES catalog_v2.catalog_variants(id) ON DELETE CASCADE,
  operator_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_variant_fulfillment_audit_variant
  ON catalog_v2.variant_fulfillment_audit (catalog_variant_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4) Purchase orders: type + dropship fulfillment fields
-- -----------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS purchase_order_type TEXT NOT NULL DEFAULT 'inbound_stock',
  ADD COLUMN IF NOT EXISTS supplier_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supplier_confirmed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS chk_purchase_orders_type;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT chk_purchase_orders_type
  CHECK (purchase_order_type IN ('inbound_stock', 'dropship_fulfillment'));

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS chk_purchase_orders_fulfillment_status;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT chk_purchase_orders_fulfillment_status
  CHECK (fulfillment_status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled'));

-- Order-linked POs are dropship fulfillment by default (order_id removed in 20260730104900)
UPDATE public.purchase_orders
SET purchase_order_type = 'dropship_fulfillment'
WHERE customer_order_number IS NOT NULL
  AND btrim(customer_order_number) <> ''
  AND purchase_order_type = 'inbound_stock';

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS chk_purchase_orders_status;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT chk_purchase_orders_status
  CHECK (status IN ('draft', 'sent', 'partially_received', 'received', 'cancelled'));

CREATE TABLE IF NOT EXISTS public.purchase_order_receipts (
  id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  purchase_order_id BIGINT NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  idempotency_key TEXT,
  operator_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_po_receipt_idempotency UNIQUE (purchase_order_id, idempotency_key)
);

-- -----------------------------------------------------------------------------
-- 5) Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION catalog_v2._po_line_variant_uuid(p_line jsonb)
RETURNS uuid
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE v_text text;
BEGIN
  v_text := NULLIF(TRIM(COALESCE(p_line->>'catalog_variant_id', '')), '');
  IF v_text IS NULL THEN RETURN NULL; END IF;
  BEGIN RETURN v_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION catalog_v2._count_active_purchasable_variants(p_product_id uuid)
RETURNS int
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)::int
  FROM catalog_v2.catalog_variants cv
  WHERE cv.catalog_product_id = p_product_id
    AND cv.is_active = true
$$;
