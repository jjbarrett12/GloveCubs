# Publish → sellable product pipeline

## Operator-facing entrypoints

| Entry | Location | Path |
|--------|-----------|------|
| Review UI — publish one | `catalogos` dashboard | `StagedProductDetail` → server action `publishStagedToLive` (`catalogos/src/app/actions/review.ts`) |
| Review UI — bulk publish | Ingestion console | `bulkPublishStaged` / `publishAllApprovedInBatch` → `publishStagedToLive` |
| Variant family publish | Review / batch | `publishVariantGroup` → `runPublishVariantGroup` |
| HTTP API | Next route | `POST /api/publish` (`catalogos/src/app/api/publish/route.ts`) |
| Legacy (avoid for new work) | Service | `publishStagingCatalogos` — upserts `public.products` and sets `live_product_id` but **does not** run `runPublish` / attribute sync; API comment says not canonical |

**Canonical path:** `evaluatePublishReadiness` (UI/API) → `buildPublishInputFromStaged` → **`runPublish`** (`publish-service.ts`) → **`ensureLegacyCommerceBridge`** → `finalizePublishSearchSync` (`canonical-sync-service.ts`).

## Trace: what happens on publish (`runPublish`)

1. **Guards** — Case-cost (case sell unit), `publishSafe` (required attributes per category).
2. **catalogos.products** — Update existing master (`masterProductId`) or insert from `newProductPayload`; set `published_at`.
3. **product_attributes** — `syncProductAttributesFromStaged`.
4. **supplier_offers** — Upsert active offer (cost, sell_price, raw/normalized ids).
5. **Legacy commerce bridge** — `ensureLegacyCommerceBridge` (`commerce-live-bridge.ts`): upsert **`public.products`** by `sku`, set **`catalogos.products.live_product_id`** (required for `resolveCanonicalProductIdsByLiveIds` at checkout).
6. **publish_events** — Audit row (warnings if insert fails).
7. **Lifecycle** — `catalog_sync_item_results` → `setLifecycleStatus(..., published, ...)`.
8. **Search** — `finalizePublishSearchSync`: staging `search_publish_status` → pending; `catalogos.sync_canonical_products()` RPC; verify row in **`public.canonical_products`** (`is_active`); set `published_synced` or `sync_failed` + retry queue.

**Variant group** (`runPublishVariantGroup`): creates/uses `product_families`, inserts N **catalogos.products**, offers, publish_events per row, then **bridge per variant**, then **one** `finalizePublishSearchSync` for all normalized ids + product ids.

## Multiple paths / divergence

- **`runPublish` + review/API** — Full attributes, offers, search sync, **and** (now) live bridge. **Preferred.**
- **`publishStagingCatalogos`** — Older path; creates public row + `live_product_id` but **no** `runPublish` attribute pipeline or the same search finalize. Can diverge from canonical catalog quality.
- **Direct SQL / dashboard** — Can desync `canonical_products`, `live_product_id`, or offers.

## Definition: “sellable” (minimum)

A SKU is **sellable** in this stack when all of the following hold:

1. **Catalog master** — `catalogos.products` row exists, `is_active`, `published_at` set, non-empty `sku`, `category_id` present.
2. **Canonical identity** — UUID `catalogos.products.id` is the same id synced to **`public.canonical_products`** (search surface).
3. **Legacy checkout bridge** — `catalogos.products.live_product_id` points to a real **`public.products.id`** (so cart lines with `product_id` resolve `canonical_product_id` via `resolveCanonicalProductIdsByLiveIds`).
4. **Offer & pricing** — At least one active **`supplier_offers`** row with finite cost (and sell_price when used for legacy `price`).
5. **Publish-safe attributes** — Dictionary `publishSafe` satisfied for the category (and case-cost rule when selling by case).
6. **Search contract** — `supplier_products_normalized.search_publish_status = 'published_synced'` after successful `finalizePublishSearchSync` (or operator follows retry queue until synced).

**Browse-only (searchable but not buyable)** is **not** a supported first-class mode today: if it appears in `canonical_products` with `is_active`, operators should treat it as intended for sale once bridge + offers exist.

## Sellable-readiness checklist (operator)

- [ ] Staging status `approved` or `merged`
- [ ] `master_product_id` linked
- [ ] Normalized `name`, no blocking `validation_errors`
- [ ] Required category attributes pass **Publish** validation (review panel / readiness)
- [ ] Case pricing resolved when `sell_unit` is `case`
- [ ] After publish: staging shows **Live & searchable** (`published_synced`) or retry queue clearing
- [ ] Spot-check: `catalogos.products.live_product_id` **not null** for the master UUID
- [ ] Spot-check: `public.products` row exists for that live id with non-zero or intentional `price`/`cost`
- [ ] Smoke: add to cart with legacy `product_id` → checkout does not throw `MissingCanonicalProductIdError`

## Smoke test: ingest → review → publish → search → cart → checkout

1. **Ingest** a batch (CatalogOS ingestion UI or importer) so rows land in `supplier_products_normalized`.
2. **Review** — Approve / link master; confirm readiness shows no blockers.
3. **Publish** — Single publish or bulk; confirm success JSON / UI (no `publishError`).
4. **Search** — Storefront or Supabase: `select id, sku from public.canonical_products where id = '<catalogos.products.id>' and is_active`.
5. **Storefront** — Open product URL if wired to canonical slug/UUID (per storefront routes).
6. **Cart** — Add using **`public.products.id`** (legacy app); cart payload should include or resolve `canonical_product_id`.
7. **Checkout** — `POST /api/orders` or create-payment-intent: must pass `ensureCommerceLinesHaveCanonical`.

## Where the bridge can still fail today

1. **`publishStagingCatalogos` only** — If anything still calls it without `runPublish`, you can get `live_product_id` without aligned `product_attributes` / `publish_safe` quality or without the same search finalize semantics.
2. **`public.products` upsert failures** — RLS, unique constraints other than `sku`, or schema drift (missing columns on `products`).
3. **`live_product_id` FK** — Orphan cleanup or invalid `public.products.id` leaves null `live_product_id` until bridge runs again.
4. **SKU collisions** — Upsert by `sku` merges into an existing live row; wrong if two catalog masters share SKU.
5. **`sync_canonical_products` / RPC** — Fails → publish fails closed (already); retry queue may need ops/cron (`processCanonicalSyncRetryQueue` / internal retry route).
6. **No active offer** — Bridge still runs with `cost`/`price` 0 if offer missing (should not happen after successful offer upsert in `runPublish`).
7. **Storefront-only UUID paths** — If a client adds to cart with only canonical UUID without a mapped `product_id`, behavior depends on storefront implementation; legacy Node checkout expects numeric `product_id` + bridge or explicit UUID on the line.
8. **Inventory** — Sellable ≠ in-stock; reservation/checkout can still fail on stock rules even when identity is correct.

## Code references

- `catalogos/src/lib/publish/publish-service.ts` — `runPublish`
- `catalogos/src/lib/publish/commerce-live-bridge.ts` — `ensureLegacyCommerceBridge`
- `catalogos/src/lib/publish/canonical-sync-service.ts` — `finalizePublishSearchSync`
- `catalogos/src/lib/publish/publish-variant-group.ts` — variant pipeline
- `catalogos/src/lib/review/publish-guards.ts` — `evaluatePublishReadiness`
- `lib/resolve-canonical-product-id.js` — runtime bridge lookup
- `supabase/migrations/*canonical_products*` — `catalogos.sync_canonical_products()`
