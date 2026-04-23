# CatalogOS

Internal catalog ingestion and publishing system for GloveCubs. Ingests supplier feeds → normalizes → extracts attributes → matches to master catalog → review → publish to live storefront.

## Stack

- Next.js 14 App Router, TypeScript, Tailwind, Supabase (Postgres + Auth + Storage)
- Server Actions / Route handlers for ingestion and publish
- Zod validation; deterministic rules first, AI hooks second

## Setup

1. Copy `.env.example` to `.env.local` and set Supabase URL and keys (same project as GloveCubs).
2. Apply migrations from repo root: `supabase/migrate` or run the SQL in `supabase/migrations/20260310000001_catalogos_schema.sql` and `20260310000002_catalogos_seed_attributes.sql`.
3. `npm install && npm run dev` — app runs on port 3010.

## API (Phase 1)

- **POST /api/ingest** — Body: `{ supplier_id, source_type: "url"|"csv_upload", url?: string, csv_rows?: Record<string,unknown>[] }`. Runs full pipeline: raw → normalize → staging → match.
- **PATCH /api/staging/:id** — Body: `{ status: "pending"|"approved"|"rejected"|"merged", master_product_id?: number }`.
- **POST /api/publish** — Body: `{ staging_ids: number[] }`. Publishes approved staging to master_products, supplier_offers, and live `products` table.

## Dashboard

- `/dashboard` — Overview (counts, recent batches).
- `/dashboard/suppliers` — List suppliers.
- `/dashboard/feeds` — List feeds.
- `/dashboard/batches` — Import batches with links to staging.
- `/dashboard/staging` — Staging products (filter by batch or status).
- `/dashboard/review` — Pending review queue; link to detail.
- `/dashboard/review/[id]` — Staging detail (approve/reject via API).
- `/dashboard/master-products` — Master catalog.

## Architecture

See `docs/catalogos/ARCHITECTURE.md` and `docs/catalogos/PHASED_IMPLEMENTATION.md`.
