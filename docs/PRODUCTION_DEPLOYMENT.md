# GloveCubs — Production deployment

Single reference for production topology, env, migrations, and startup. (Productionization audit.)

## Topology

| App | Port (dev) | Purpose |
|-----|------------|--------|
| **Express** (`server.js`) | 3004 | B2B API: auth, cart, orders, Stripe, products, admin, AI |
| **CatalogOS** (Next.js) | 3010 | Catalog admin, ingestion, staging, publish, catalog API, quotes |
| **Storefront** (Next.js) | 3004 (or other) | Buyer dashboard, supplier portal, AI, jobs/cron, product search |

All three use the **same** Supabase (Postgres) database. Apply migrations in order: see [MIGRATION_ORDER.md](./MIGRATION_ORDER.md).

## Migration order

1. Apply **root** `supabase/migrations/` in filename order.
2. Apply **storefront** `storefront/supabase/migrations/` in filename order.

Do not apply storefront migrations alone; root defines `catalogos`, RPCs, and `public.canonical_products`.

## Environment variables

### Root (Express)

- `PORT`, `NODE_ENV`, `JWT_SECRET` (required in prod)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_CRON_SECRET` (for `/api/internal/import/run`)
- `DOMAIN`, SMTP (optional), Stripe keys (optional), OpenAI (optional)

See `.env.example` at repo root.

### CatalogOS

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CATALOGOS_ADMIN_SECRET` — when set, dashboard and `/api/ingest`, `/api/publish`, `/api/staging`, `/api/openclaw` require Bearer or cookie auth.

See `catalogos/.env.example`.

### Storefront

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_GLOVECUBS_API` (Express API URL)
- `GLOVECUBS_ADMIN_API_ORIGIN` (optional)
- Cron: `CRON_SECRET` for `/api/internal/cron/*`
- AI: `OPENAI_API_KEY` / `AI_PROVIDER` as needed

See `storefront/.env.example`.

## App startup

- **Express:** `npm run start` or `node server.js` (root).
- **CatalogOS:** `cd catalogos && npm run build && npm run start` (e.g. port 3010).
- **Storefront:** `cd storefront && npm run build && npm run start` (e.g. port 3004).

No single “start all” script; deploy each app separately (e.g. Vercel, Railway, or Docker per app).

## Workers / cron

- **Express:** `/api/internal/import/run` — call with `INTERNAL_CRON_SECRET` header for bulk import.
- **Storefront:** `/api/internal/cron/daily`, `weekly`, `nightly` — call with `CRON_SECRET`; `/api/internal/worker` for job queue.
- **CatalogOS:** No cron; ingestion is on-demand via dashboard or `POST /api/ingest`. After publish, `sync_canonical_products` runs to refresh `public.canonical_products` for storefront search.

## Canonical products sync

`public.canonical_products` is the live-product table for storefront search. It is:

- Created and initially backfilled by root migration `20260404000001_canonical_products_table_and_sync.sql`.
- Refreshed after each publish via `catalogos.sync_canonical_products()` (called from publish-service).
- Optional: run `SELECT catalogos.sync_canonical_products();` on a schedule if you need periodic full refresh.

## Security

- CatalogOS admin and OpenClaw: require `CATALOGOS_ADMIN_SECRET` when set; rate-limited per IP via shared DB tables (expensive 10/min, others 60/min). Multi-instance safe.
- Storefront: rate limits use `rate_limit_events` / `rate_limit_blocks` (DB-backed); supplier auth uses same tables.
- Quote submission: rate-limited by email (15/hour).

## Observability

- **Error telemetry:** `public.error_telemetry` (both apps write). Storefront: `lib/hardening/telemetry`. CatalogOS: `lib/observability` + DB write.
- **Sentry:** Set `SENTRY_DSN` (and optionally `NEXT_PUBLIC_SENTRY_DSN` for client) to enable. Server/edge init via `instrumentation.ts`; client via `SentryLoader`. High/critical errors are also sent to Sentry. No-op when DSN unset.
- Logs: ensure stdout/stderr are captured by your host (e.g. Vercel, Railway).

## Startup validation

- CatalogOS and Storefront run `assertCriticalEnv()` in `instrumentation.ts` (Node runtime). In **production**, missing `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` will fail startup. In development, no throw.
