# Canonical product ID write-path implementation (final state)

This document describes how **`canonical_product_id`** (UUID aligned with `catalogos.products.id` / `public.canonical_products.id`) is enforced for **new** commerce writes, while **`product_id`** (BIGINT, `public.products`) remains the compatibility join key. See **`docs/canonical-product-id-write-path-audit.md`** for history.

## Source of truth

| Identity | Role |
|----------|------|
| **`canonical_product_id`** | Required for every **new** cart line, saved-list line, and `order_items` row created through the Express API. Prefer explicit client/PDP UUID; otherwise resolve via **`catalogos.products.live_product_id`** (bridge). |
| **`product_id`** | Legacy live SKU row; **retained** on `order_items`, `inventory`, and cart JSON for fulfillment, admin tools, and historical data. Not removed until downstream systems are off BIGINT. |

Invalid or unknown catalog mappings produce **`422`** with `code: MISSING_CANONICAL_PRODUCT_ID` where enforcement runs (checkout, cart mutations, saved lists).

## Core module: `lib/resolve-canonical-product-id.js`

| Export | Purpose |
|--------|---------|
| `resolveCanonicalProductIdsByLiveIds(liveIds)` | Batch map `public.products.id` → catalog UUID via Supabase `catalogos.products`. |
| `normalizeCanonicalUuidInput(raw)` | Strict RFC-style UUID v1–v5 validation (regex); returns lowercase or `null`. |
| `resolveLineCanonicalProductId(line, map, context)` | Prefer line `canonical_product_id`; else bridge from `map`. Logs **`[commerce-canonical] bridge_resolve`** when the bridge is used. |
| `ensureCommerceLinesHaveCanonical(lines, context)` | Mutates each line to set `canonical_product_id` or throws **`MissingCanonicalProductIdError`**. |
| `buildOrderItemRowsForInsert(orderId, items, preMap, { requireCanonical, context })` | Builds DB rows; with **`requireCanonical: true`** throws if UUID cannot be resolved. |
| `MissingCanonicalProductIdError` | `statusCode` **422**; used by route-level `respondCommerceCanonicalError` in `server.js`. |

## Express `server.js` (enforced paths)

| Route / flow | Behavior |
|--------------|----------|
| **`POST /api/orders`** (Net 30 / pending) | `ensureCommerceLinesHaveCanonical(cartItems, 'checkout_post_orders')` before totals; each `orderPayload.items[]` includes **`canonical_product_id`** (and **`product_id`**). |
| **`POST /api/orders/create-payment-intent`** | Same with context `checkout_create_payment_intent`; wrapped in `try/catch` for canonical errors. |
| **`POST /api/cart`** | Resolves UUID per line (merge + new); **`422`** if unmapped. |
| **`POST /api/cart/bulk`** | `ensureCommerceLinesHaveCanonical` on full cart before `setCart`. |
| **`POST /api/saved-lists`**, **`PUT ...`**, **`POST .../add-to-cart`**, **`POST /api/orders/:id/reorder`** | Lists and carts normalized with `ensureCommerceLinesHaveCanonical` (or per-line resolve) so persisted JSON always carries UUID when mapping exists. |

**`respondCommerceCanonicalError`** maps `MissingCanonicalProductIdError` to a JSON **422** body.

## `services/dataService.js`

- **`createOrder` / `updateOrder`** call `buildOrderItemRowsForInsert(..., { requireCanonical: true, context: 'createOrder' | 'updateOrder' })` so **`order_items` inserts always include `canonical_product_id`** when resolvable; otherwise the request fails before insert.
- **`upsertInventory`**: sets UUID from payload or bridge; logs **`[commerce-canonical] bridge_resolve`** on bridge; logs **`[inventory-canonical] write_without_resolved_canonical`** when no UUID can be set (row may still upsert for legacy SKUs).

## Inventory + stock history (hardened)

See **`docs/inventory-canonical-id-hardening.md`** for the full audit.

- **`lib/inventory-canonical.js`**: `resolveCanonicalForInventoryEvent` (line → row → bridge) and **`logInventoryWriteWithoutCanonical`** for consistent **`[inventory-canonical]`** warnings.
- **`lib/inventory.js`**: **`getStockForLineItem`** / **`checkAvailability`** / **`reserveStockForOrder`** read **`inventory`** **canonical-first** when a line UUID is present; **`getStock(productId, { canonical_product_id })`** does the same when callers pass a UUID. Mutations (**reserve / release / deduct / adjust / receive / incoming**) use the resolver to **patch `inventory.canonical_product_id`** when missing; **`_ensureInventory`** delegates to **`resolveCanonicalForInventoryEvent`**; **`_logStockHistory`** stores **`stock_history.canonical_product_id`** when resolved. **`getStockHistory(productId, limit, { canonical_product_id })`** can filter audit rows by UUID.
- **`public.stock_history`**: additive nullable **`canonical_product_id`** (migration **`20260628100000_stock_history_canonical_product_id.sql`**) with optional FK to **`catalogos.products`**; historical rows backfilled from **`inventory`** where possible.
- Row **uniqueness / updates** remain on **`inventory.product_id`** (BIGINT); UUID is required-at-quality-bar, not a second PK.
- **Admin / Fishbowl**: **`PUT /api/admin/inventory/:id`**, cycle count, Fishbowl sync, and **`GET /api/admin/inventory`** pass or surface **`canonical_product_id`** where available (see **`docs/inventory-canonical-id-hardening.md`**).

## Cart contract: `lib/contracts/cart-line.js`

- **`CartLinePersistSchema`**: `canonical_product_id` still **optional** in Zod so **legacy JSON** in `carts.items` can load.
- **`CartLineWithCanonicalSchema`**: strict shape (**UUID required**) for documentation / optional validation of normalized lines.
- Runtime guarantee: **server routes** call `ensureCommerceLinesHaveCanonical` or `resolveLineCanonicalProductId` before **`setCart`** for authenticated flows that must checkout.

## Legacy / not migrated in this pass

| Area | Notes |
|------|--------|
| **`public.stock_history`** | **`product_id`** retained; **`canonical_product_id`** added for new audit rows (see migration **`20260628100000_stock_history_canonical_product_id.sql`**). |
| **Guest session carts** | Same enforcement on **`POST /api/cart`**; lines without catalog mapping cannot be normalized to UUID (422 on add). |
| **Quote won → `public.order_items`** | Not implemented in Express; CatalogOS snapshot stores **`product_snapshot.canonical_product_id`** (see migration `20260627140000_quote_line_snapshot_canonical_product_id.sql`) for a future bridge. |
| **Owner cockpit (`ownerCockpitService`)** | Still BIGINT-first on **`inventory`** reads; documented in **`docs/inventory-canonical-id-hardening.md`**. |
| **Per-SKU verify in `server.js`** | Uses **`getStock(productId)`** without line UUID until the UI supplies **`canonical_product_id`**. |

## CatalogOS quotes (`catalogos` app)

- Basket + RPC carry **`canonicalProductId`**; SQL stores it in **`product_snapshot`** (see prior implementation summary in repo).

## Storefront analytics

- Admin buyer spend and buyer-intelligence dashboards prefer **`canonical_product_id`** / **`canonical_products`** with legacy **`products`** fallback (see `storefront` code paths referenced in earlier revisions).

## Tests

| Suite | Path |
|--------|------|
| Resolver, `buildOrderItemRowsForInsert`, `ensureCommerceLinesHaveCanonical` | `tests/resolve-canonical-product-id.test.js` |
| Sync line resolution | `tests/commerce-line-resolve.test.js` |
| Inventory canonical resolution | `tests/inventory-canonical.test.js` |
| Inventory reads + mutations (mocked Supabase) | `tests/inventory-mutations.test.js` |
| CatalogOS quote lines | `catalogos/src/lib/quotes/*.test.ts` (Vitest) |

Run root: `node --test "tests/*.test.js"` (see `package.json`).

## Operations

- **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** required for catalog bridge queries.
- Every **`public.products`** row that must sell online needs a matching **`catalogos.products.live_product_id`** (or clients must send **`canonical_product_id`** explicitly).

## References

- `docs/canonical-product-id-write-path-audit.md`
- `supabase/migrations/20260626100000_order_inventory_catalog_product_uuid.sql`
- `docs/order-inventory-id-alignment.md`
