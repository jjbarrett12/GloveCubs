-- =============================================================================
-- Preflight: run BEFORE applying 20260730100000_structural_final_cleanup.sql
-- Safe on post-migration DBs (no-op when product_id columns already dropped).
-- Expect NOTICE lines: inventory_orphans=0, stock_history_orphans=0
-- =============================================================================

DO $$
DECLARE
  orphan_inv integer := 0;
  orphan_sh integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'product_id'
  ) THEN
    SELECT COUNT(*)::integer INTO orphan_inv
    FROM public.inventory i
    WHERE i.product_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM catalog_v2.catalog_products cp
        WHERE cp.legacy_public_product_id = i.product_id
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_history' AND column_name = 'product_id'
  ) THEN
    SELECT COUNT(*)::integer INTO orphan_sh
    FROM public.stock_history sh
    WHERE sh.product_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM catalog_v2.catalog_products cp
        WHERE cp.legacy_public_product_id = sh.product_id
      );
  END IF;

  RAISE NOTICE 'preflight structural cleanup: inventory_orphans=% (must be 0 before migrate)', orphan_inv;
  RAISE NOTICE 'preflight structural cleanup: stock_history_orphans=% (must be 0 before migrate)', orphan_sh;
END $$;
