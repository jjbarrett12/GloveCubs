# Root cause — STAGE-P0-001 pg_trgm

## ROOT CAUSE

`MISSING EXTENSION MIGRATION`

## Evidence

1. Grep of `supabase/migrations`: only `CREATE EXTENSION` usages are `pgcrypto` (`20260311000001`, `20260331100001`). **No** `pg_trgm` enable migration existed.
2. First `gin_trgm_ops` use: `20260422103000_storefront_search_catalogos_products.sql` line 14.
3. Same file + `20260701100000` use `similarity()`.
4. Staging push error: `operator class "gin_trgm_ops" does not exist for access method "gin" (SQLSTATE 42704)`.
5. Production/V2 almost certainly relied on dashboard/default extension enablement — blank projects do not.

## Fix

New migration `20260422102000_enable_pg_trgm.sql` sorts after applied `20260404000011` and before failing `20260422103000`, using `CREATE EXTENSION IF NOT EXISTS pg_trgm` (same pattern as `pgcrypto`).
