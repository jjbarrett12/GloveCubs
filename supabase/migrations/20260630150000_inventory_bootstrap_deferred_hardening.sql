-- =============================================================================
-- Deferred inventory / stock_history / orders hardening (bootstrap safety)
--
-- 20260302000011 runs before glovecubs base tables exist; its guarded blocks
-- no-op on a normal fresh chain. This migration repeats the same changes
-- idempotently once inventory, stock_history, and orders are present.
--
-- Also adds check_reserved_lte_onhand only after quantity_reserved exists
-- (20260330000005_inventory_stock_reserved_history.sql).
--
-- Order shipment tracking columns are first attempted in 20260302000010_product_favorites.sql
-- but that runs before public.orders exists; repeat here idempotently (same as inventory hardening).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inventory'
  ) THEN
    ALTER TABLE public.inventory
      ADD COLUMN IF NOT EXISTS bin_location TEXT,
      ADD COLUMN IF NOT EXISTS last_count_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS incoming_quantity INT NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stock_history'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.stock_history
      ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS balance_after INT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stock_history'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_stock_history_type ON public.stock_history (type)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_stock_history_reference ON public.stock_history (reference_type, reference_id)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS inventory_reserved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS inventory_released_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS inventory_deducted_at TIMESTAMPTZ;
    EXECUTE $i$
      CREATE INDEX IF NOT EXISTS idx_orders_inventory_reserved ON public.orders (inventory_reserved_at)
      WHERE status IN ('pending_payment', 'payment_failed', 'cancelled', 'expired')
    $i$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'quantity_reserved'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'quantity_on_hand'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_reserved_lte_onhand'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT check_reserved_lte_onhand
      CHECK (quantity_reserved <= quantity_on_hand);
  END IF;
END $$;

-- Shipment tracking on orders (deferred from 20260302000010_product_favorites.sql)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS carrier VARCHAR(50),
      ADD COLUMN IF NOT EXISTS estimated_delivery DATE,
      ADD COLUMN IF NOT EXISTS actual_delivery TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS tracking_events JSONB DEFAULT '[]';
  END IF;
END $$;
