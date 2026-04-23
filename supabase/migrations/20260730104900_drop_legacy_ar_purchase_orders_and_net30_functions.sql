-- =============================================================================
-- Prerequisites before dropping legacy bigint stock RPCs and public.orders:
-- purchase_orders FK to legacy orders, legacy AR table, net30 payment RPCs.
-- Split from former 20260730105000_drop_legacy_orders_and_alias.sql batch.
-- =============================================================================

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_order_id_fkey;
ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS order_id;

DROP TABLE IF EXISTS public.ar_invoice_payments CASCADE;

DROP FUNCTION IF EXISTS public.glovecubs_apply_net30_order_ar(BIGINT, BIGINT, NUMERIC, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.glovecubs_record_invoice_payment(BIGINT, BIGINT, NUMERIC, TEXT, BIGINT);
