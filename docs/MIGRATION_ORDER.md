# GloveCubs — Database migration order

Productionization: deterministic migration order so a fresh production DB can be set up without tribal knowledge.

## Rule

1. **Apply root migrations first.**  
   Run all migrations in `supabase/migrations/` (repo root) in filename order against your Supabase (or Postgres) database.

2. **Then apply storefront migrations.**  
   Run all migrations in `storefront/supabase/migrations/` in filename order against the **same** database.

## Why this order

- **Root** defines:
  - `catalogos` schema (products, product_attributes, supplier_offers, staging, etc.)
  - RPCs: `catalogos.commit_feed_upload`, `catalogos.create_quote_with_lines`, `catalogos.sync_canonical_products`
  - `public.canonical_products` table and initial sync
  - `catalog_v2` additive schema (`20260331100001_catalog_v2_additive_schema.sql`) — long-term products/variants/suppliers; requires `catalogos.suppliers`, `catalogos.import_batches`, `catalogos.brands`, and `public.products` / `public.manufacturers` for FKs
  - `catalog_v2` legacy backfill prereqs (`20260331100002_catalog_v2_legacy_migration_prereqs.sql`), backfill function (`20260331100003_catalog_v2_backfill_public_products.sql`), compat views (`20260331100004_catalog_v2_legacy_compat_views.sql`) — see [catalog-migration-backfill.md](./catalog-migration-backfill.md)
  - Public views for storefront search: `public.supplier_offers`, `public.offer_trust_scores`, `public.suppliers` (over `catalogos.*`)
  - `public.error_telemetry` and `public.error_alerts` (shared by storefront and catalogos for production error logging)
  - `public.rate_limit_events` and `public.rate_limit_blocks` (shared rate limiting; multi-instance safe)
  - Quote lifecycle, orders/carts, Stripe webhook events, etc.

- **Storefront** migrations assume:
  - `catalogos` schema and RPCs exist (e.g. `commit_feed_upload` for supplier feed upload)
  - `catalogos.supplier_feed_uploads` and `catalogos.supplier_feed_upload_rows` (created in storefront)
  - `catalogos.supplier_users` (created in storefront supplier_portal migration)
  - `public.canonical_products` exists (created in root `20260404000001_canonical_products_table_and_sync.sql`)

If you apply only storefront migrations, the RPCs and `canonical_products` will be missing and feed commit / search will fail. If you apply only root migrations, supplier portal feed upload tables and supplier_users will be missing.

## Commands (example)

```bash
# From repo root, with Supabase CLI and link to your project:
supabase db push
# Or apply root migrations manually in order, then:
cd storefront && supabase db push
# (Ensure storefront is configured to use the same DB URL.)
```

## Single DB

All three apps (Express, CatalogOS, Storefront) use the **same** Supabase/Postgres database. There is no separate “storefront DB”; storefront migrations add tables and columns to the same database that root migrations populate.
