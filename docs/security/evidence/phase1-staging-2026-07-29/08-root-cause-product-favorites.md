# Root cause — product_favorites missing

## ROOT CAUSE

`MIGRATION ORDER ERROR`

## Exact failure

- File: `20260422120000_product_favorites_catalog_uuid.sql`
- Statement: `TRUNCATE TABLE public.product_favorites;`
- Error: `relation "public.product_favorites" does not exist (SQLSTATE 42P01)`

## Why

1. `20260302000010_product_favorites.sql` is a placeholder (`SELECT 1`) — creation removed because it sorted before `public.users`.
2. Real create is `20260630150100_product_favorites_after_users.sql` (bigint `user_id` / `product_id`).
3. Alter to catalog UUID is `20260422120000` — **before** the deferred create.
4. Feature still active: Express `/api/favorites*` uses `product_favorites` via service role.

## Fix

`20260422115000_create_product_favorites.sql` — create table (same shape as deferred create) + RLS own-user policies, before the UUID alter.
