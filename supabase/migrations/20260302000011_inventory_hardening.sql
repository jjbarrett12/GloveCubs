-- =============================================================================
-- Inventory Hardening Migration
-- Adds missing columns, user tracking, and idempotency fields
--
-- Lexicographic order runs this file (20260302) before public.inventory,
-- public.stock_history, and public.orders are created (20260330). Unguarded
-- ALTERs would fail on a fresh bootstrap. Conditional blocks skip until tables
-- exist; 20260630150000_inventory_bootstrap_deferred_hardening.sql re-applies
-- the same steps idempotently after base schema exists.
--
-- check_reserved_lte_onhand is deferred: quantity_reserved is added in
-- 20260330000005_inventory_stock_reserved_history.sql (runs after this file).
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
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    EXECUTE $i$
      CREATE INDEX IF NOT EXISTS idx_orders_inventory_reserved ON public.orders (inventory_reserved_at)
      WHERE status IN ('pending_payment', 'payment_failed', 'cancelled', 'expired')
    $i$;
  END IF;
END $$;
