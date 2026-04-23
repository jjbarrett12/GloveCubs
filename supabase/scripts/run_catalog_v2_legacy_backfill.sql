-- Idempotent backfill: public.products → catalog_v2 (see migration 20260331100003).
-- Run in Supabase SQL editor or: psql -f supabase/scripts/run_catalog_v2_legacy_backfill.sql
SELECT catalog_v2.backfill_legacy_public_products() AS result;
