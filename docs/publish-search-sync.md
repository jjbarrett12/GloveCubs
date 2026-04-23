# Publish and storefront search synchronization

Publishing writes to `catalogos.products`, `product_attributes`, and `supplier_offers`. Storefront search (and any consumer of `public.canonical_products`) only sees products after **`catalogos.sync_canonical_products()`** has run successfully and the row appears in **`public.canonical_products`**.

This document describes the reliability model: retries, explicit status on staging rows, a background retry queue, admin alerting, and how to operate it.

**See also:** [`docs/publish-sync-reliability.md`](./publish-sync-reliability.md) for the full publish state machine, admin UI, logging fields (**`batchIds`**), and storefront **`searchProducts`** integration test.

## Requirements (implemented)

1. **After publish**, `sync_canonical_products` is invoked with **in-process retries** (backoff). If it still fails or the product row is **missing from `public.canonical_products`** after a successful RPC, the publish is treated as **incomplete** (`runPublish` returns `success: false`).
2. **`search_publish_status`** on `catalogos.supplier_products_normalized` records the search-sync lifecycle (see below).
3. **Retry job**: rows are enqueued in **`catalogos.canonical_sync_retry_queue`** and processed by **`POST /api/internal/retry-canonical-sync`** (cron-friendly).
4. **Admin alerts**: failures log to **`error_telemetry`** / **Sentry** via `logSyncCanonicalProductsFailure`, `logPublishFailure`, and **`logAdminActionFailure`** (especially when immediate retries fail or the queue is exhausted).
5. **Test**: `catalogos/src/lib/publish/publish-search-sync.integration.test.ts` (runs only when Supabase env is set) asserts that after `sync_canonical_products`, the product exists in **`public.canonical_products`** and is returned from **`listLiveProducts`** with `q` = SKU (same constraint logic as **`GET /api/catalog/products`**).

## Schema

Migrations: `supabase/migrations/20260627120000_publish_search_sync_status.sql`, `supabase/migrations/20260325120000_publish_search_sync_status_approved.sql`

- **Enum** `catalogos.publish_search_sync_status`: `staged`, **`approved`** (review accepted, pre-live publish), `published_pending_sync`, `published_synced`, `sync_failed`.
- **Column** `supplier_products_normalized.search_publish_status` (default **`staged`**).
- **Table** `catalogos.canonical_sync_retry_queue`: `normalized_id` (unique), `product_id`, `attempts`, `last_error`, `next_run_at`, timestamps.

## Status semantics

| `search_publish_status` | Meaning |
|-------------------------|--------|
| **staged** | Default / reset on reject or mark-for-review; not in the publish-to-search pipeline. |
| **approved** | Review accepted (approved/merged with master); **`runPublish`** not yet completed successfully for storefront sync. |
| **published_pending_sync** | Live catalog writes for this publish have started; `sync_canonical_products` is in progress (short window). |
| **published_synced** | RPC succeeded **and** the product id is visible in **`public.canonical_products`** (active). |
| **sync_failed** | Retries and/or verification failed; row may still be in **`canonical_sync_retry_queue`** until exhausted. |

**Note:** `supplier_products_normalized.status` (`pending` / `approved` / …) is unchanged; it remains the review/staging workflow. Search sync is orthogonal and stored in **`search_publish_status`**.

## Code paths

| Piece | Location |
|-------|----------|
| RPC + retry + canonical check + queue | `catalogos/src/lib/publish/canonical-sync-service.ts` (`finalizePublishSearchSync`, `processCanonicalSyncRetryQueue`) |
| Single-row publish | `catalogos/src/lib/publish/publish-service.ts` (`runPublish`) |
| Variant group publish | `catalogos/src/lib/publish/publish-variant-group.ts` (`runPublishVariantGroup`) |
| Retry HTTP entrypoint | `catalogos/src/app/api/internal/retry-canonical-sync/route.ts` |

### `PublishResult` extensions

`success: false` when search sync is incomplete **after retries**, even if the master product and offer were written. Check:

- `publishComplete` — `true` only when search sync succeeded.
- `searchPublishStatus` — `published_synced` | `sync_failed` | etc.

Server actions (e.g. review publish) already treat `success: false` as “not published” for the operator, while the DB may require a follow-up sync or manual fix.

## Retry job (cron)

- **Endpoint:** `POST /api/internal/retry-canonical-sync`
- **Auth:** Same as other internal routes: header **`x-api-key`** or **`Authorization: Bearer <INTERNAL_API_KEY>`** (`INTERNAL_API_KEY` env). In **development**, auth is relaxed (see route implementation).
- **Body (optional):** `{ "limit": 30 }` (1–200) — max rows to examine this run.
- **Behavior:** Loads due queue rows (`next_run_at <= now()`), runs **`syncCanonicalProductsWithRetry`**, then for each row verifies **`public.canonical_products`**. Resolves rows that become visible; otherwise increments **`attempts`** with exponential backoff; after **10** attempts, sets **`sync_failed`**, removes the queue row, and emits **admin** telemetry.

Schedule this every 1–5 minutes in production (Vercel cron, Cloud Scheduler, etc.).

## Operations

1. **Operator reports “published but not on site”**  
   - Check `supplier_products_normalized.search_publish_status` for the staging id.  
   - If `sync_failed`, inspect `error_telemetry` for `sync_canonical_products_failure` / `publish_failure` / `admin_action_failure`.  
   - Manually call `select catalogos.sync_canonical_products();` in SQL if needed, then confirm the row in `public.canonical_products`.

2. **Queue backlog**  
   - Query `catalogos.canonical_sync_retry_queue` ordered by `next_run_at`.  
   - Hit the retry endpoint or fix underlying DB/permission issues.

3. **Migrations**  
   - Apply `20260627120000_publish_search_sync_status.sql` before deploying code that writes `search_publish_status` or the queue.

## Tests

- **Unit:** `catalogos/src/lib/publish/canonical-sync-service.test.ts` — RPC error handling and retry loop (mocked client).
- **Integration:** `catalogos/src/lib/publish/publish-search-sync.integration.test.ts` — runs **only** when `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` are set; validates **canonical mirror + `listLiveProducts` search** (aligned with storefront listing API behavior).

Full **runPublish** end-to-end (approved staging row → `runPublish` → search) depends on fixture data; use staging QA with a real approved row, or extend tests with seeded IDs if you add a dedicated E2E project.

## Related

- Canonical table and RPC definition: `supabase/migrations/20260404000001_canonical_products_table_and_sync.sql` (and later migrations that alter `sync_canonical_products`).
- Ingestion performance doc (separate concern): `docs/ingestion-performance-refactor.md`.
