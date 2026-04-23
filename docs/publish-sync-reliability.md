# Publish ↔ canonical ↔ storefront sync reliability

This document describes how GloveCubs ensures **publish is not treated as fully successful** unless **`public.canonical_products`** (storefront search and filters) reflects the live **`catalogos.products`** row.

## State machine (`search_publish_status`)

Column: **`catalogos.supplier_products_normalized.search_publish_status`**  
Type: **`catalogos.publish_search_sync_status`** (PostgreSQL enum).

| State | Meaning |
|--------|---------|
| **`staged`** | Default for ingested rows; not accepted for publish, or reset on reject / mark-for-review. |
| **`approved`** | Review accepted (approved/merged with master); ready to run **`runPublish`**; live catalog write not yet completed for this row. |
| **`published_pending_sync`** | Live product/offer/event writes have started the sync finalizer; **`sync_canonical_products`** running or about to run. |
| **`published_synced`** | **`sync_canonical_products`** succeeded **and** the product id is visible in **`public.canonical_products`** (active). **This is “fully published” for customer search.** |
| **`sync_failed`** | RPC failed after retries **or** row missing in **`public.canonical_products`** after RPC. Row is enqueued for background retry. **Publish is not considered successful** in API/UI terms. |

Review workflow **`status`** (`pending` / `approved` / `merged` / `rejected`) is separate from **`search_publish_status`**; both are shown in the admin UI where relevant.

## Pipeline (canonical path)

1. **`runPublish`** (`catalogos/src/lib/publish/publish-service.ts`) writes **`catalogos.products`**, **`product_attributes`**, **`supplier_offers`**, **`publish_events`**, then calls **`finalizePublishSearchSync`**.
2. **`finalizePublishSearchSync`** (`canonical-sync-service.ts`):
   - Sets **`published_pending_sync`** on affected normalized rows.
   - Calls **`sync_canonical_products`** with **in-process retries** (backoff).
   - Verifies each **`product_id`** in **`public.canonical_products`** (`is_active`).
   - On success: **`published_synced`**. On failure: **`sync_failed`**, **`canonical_sync_retry_queue`** upsert, structured logs (**`normalizedIds`**, **`productIds`**, **`batchIds`**).
3. **`runPublish`** returns **`success: false`** if sync/verification fails — **no silent success**. Message states that live catalog may be updated but storefront search is **not** synced.
4. **`runPublishVariantGroup`** uses the same finalizer and the same **`success: false`** behavior when sync fails.

## Background retries

- **Queue**: **`catalogos.canonical_sync_retry_queue`** (unique **`normalized_id`**).
- **Processor**: **`processCanonicalSyncRetryQueue`** → **`POST /api/internal/retry-canonical-sync`** (`catalogos/src/app/api/internal/retry-canonical-sync/route.ts`).
- **Operations**: Run cron or a worker against that route with a service secret (see route file). Backoff and max attempts are defined in **`canonical-sync-service.ts`**.

## Admin UI

- **Publish-ready** table: **Storefront sync** column with **`SearchPublishStatusBadge`**.
- **Review** sheet (staged detail): **Storefront search** line + badge; success toast copy when **`published_synced`**.
- **Ingestion console**: summary card **Storefront sync** (batches with pending/failed sync rows); batch table column **Search sync**; batch detail metrics **Sync failed** / **Sync pending**.

## Logging

- **`sync_canonical_products_failure`**, **`publish_failure`**, admin action failures — see **`catalogos/src/lib/observability.ts`**.
- Immediate failures include **`batchIds`** derived from normalized rows for ingestion correlation.

## Tests

| Suite | Location |
|--------|----------|
| CatalogOS: RPC + **`listLiveProducts`** | `catalogos/src/lib/publish/publish-search-sync.integration.test.ts` |
| Storefront: **`searchProducts`** after RPC | `storefront/src/lib/search/publish-storefront-sync.integration.test.ts` |

Both require real Supabase + migrations (including **`20260627120000_publish_search_sync_status.sql`** and **`20260325120000_publish_search_sync_status_approved.sql`** for **`approved`**).

## Related docs

- `docs/publish-search-sync.md`
- `docs/catalogos/PUBLISHING_AND_STOREFRONT_ARCHITECTURE.md`
