# Canonical product ID — final verification (post–commerce write migration)

This audit answers: **Can any active NEW write path create carts, `order_items`, or inventory rows without a resolvable `canonical_product_id`?** It reflects the current implementation (`lib/resolve-canonical-product-id.js`, `server.js`, `services/dataService.js`, `lib/inventory.js`, `public/js/app.js`).

---

## Executive answer: is full checkout safe to launch?

**Order placement (`order_items`): yes, with an important dependency.**  
`createOrder` / `updateOrder` (when replacing line items) call `buildOrderItemRowsForInsert(..., { requireCanonical: true })`. Unmapped live SKUs (no UUID on the line and no `catalogos.products.live_product_id` match) produce **`MissingCanonicalProductIdError`** → **HTTP 422** (`MISSING_CANONICAL_PRODUCT_ID`), handled globally via `respondCommerceCanonicalError` on commerce routes.

**Carts going through normal Express routes:** **Yes — enforced before persist or checkout.**  
`POST /api/cart` resolves explicit UUID or `live_product_id` bridge and returns **422** if neither exists. Checkout (`POST /api/orders`, `POST /api/orders/create-payment-intent`) runs `ensureCommerceLinesHaveCanonical(cartItems, …)` first. Bulk cart runs `ensureCommerceLinesHaveCanonical` on the merged cart. Reorder and saved-list flows run the same helpers.

**Inventory rows:** **Partially.**  
New `order_items` always get a UUID when checkout succeeds (or the order path would have failed). **However**, `upsertInventory` and **new** `_ensureInventory` inserts can still persist a row **without** `canonical_product_id` if the bridge fails (warnings only). Stock **mutations** still **locate rows by `product_id` (BIGINT)** — UUID is additive metadata and backfill, not the primary key.

**Quote → legacy `public.orders`:** **N/A in-repo** — CatalogOS only records `won_order_id` on quotes; there is no automated path here that inserts `public.order_items` from quote lines.

**Bottom line:** **Checkout and order line creation are aligned with the “no unmapped catalog” rule.** Launch is **not** safe if **every** sellable `public.products` row is not linked in **`catalogos.products.live_product_id`** (customers will see **422** on add-to-cart or checkout). **Inventory UUID completeness** for admin/API upserts and some reserve paths on **pre-existing** rows is still **compatibility / follow-up**, not a duplicate of the order_items guarantee.

---

## 1. Fully migrated paths (hard requirement: UUID explicit or bridge-resolved)

| Path | Mechanism | Files |
|------|-----------|--------|
| **PDP add to cart** | Client sends `canonical_product_id` when product exposes it (`canonicalProductIdForCartPayload`); server still resolves via bridge on `POST /api/cart`. | `public/js/app.js`, `server.js` |
| **Cart `POST /api/cart`** | `resolveLineCanonicalProductId` + **422** if unmapped. | `server.js` |
| **Bulk cart `POST /api/cart/bulk`** | Lines built, then **`ensureCommerceLinesHaveCanonical(cartItems, 'cart_bulk')`** → **422** if any line unmapped. | `server.js` |
| **Reorder** | Lines from order; **`ensureCommerceLinesHaveCanonical(cartItems, 'reorder')`** before `setCart`. | `server.js` |
| **Saved list create/update** | **`ensureCommerceLinesHaveCanonical(listItems, …)`** | `server.js` |
| **Saved list → cart** | Source lines + full cart validated with **`ensureCommerceLinesHaveCanonical`**. | `server.js` |
| **Checkout (Net 30 + Stripe intent)** | **`ensureCommerceLinesHaveCanonical(cartItems, …)`** before building `orderPayload`. | `server.js` |
| **`createOrder` / `updateOrder` (items)** | **`buildOrderItemRowsForInsert(..., { requireCanonical: true })`** — throws if unmapped. | `services/dataService.js`, `lib/resolve-canonical-product-id.js` |
| **422 responses** | `respondCommerceCanonicalError` + cart/checkout explicit **422** payloads. | `server.js` |

**Tests (non-stale for resolver):** `tests/resolve-canonical-product-id.test.js`, `tests/commerce-line-resolve.test.js`.

---

## 2. Compatibility-only paths (bridge, BIGINT keys, or optional UUID)

| Path | Behavior | Risk |
|------|----------|------|
| **`resolveLineCanonicalProductId` / `resolveCanonicalProductIdsByLiveIds`** | UUID from `catalogos.products` where `live_product_id = public.products.id`. Logs **`[commerce-canonical] bridge_resolve`** when used. | **Silent dependency** on catalog linkage; if link missing → **422** on guarded paths. |
| **`createOrder` return value** | `order.items` is still the **request payload** array; resolved UUID used for **DB insert** may not be copied back onto each in-memory line. | **`reserveStockForOrder(order.id, order.items)`** may see lines **without** `canonical_product_id` even when DB rows have it. Reserve uses **`_ensureInventory`** (bridge on insert) and conditional **`canonical_product_id` patch** on update — **pre-existing inventory rows** may keep NULL UUID until deduct/adjust/bridge elsewhere. |
| **`upsertInventory`** | Sets UUID from payload or bridge; **`console.warn`** if still missing — **does not throw**. | **New/updated inventory row can lack UUID.** |
| **`_ensureInventory` (new row)** | Inserts **`canonical_product_id`** only when explicit or bridge succeeds. | **Insert without UUID** if unmapped. |
| **`getStock` / reserve / release / deduct targeting** | **`eq('product_id', productId)`** — BIGINT is still the **physical** row key. | By design for legacy `UNIQUE(product_id)`; UUID is not the join key for these updates. |
| **`stock_history`** | Still **`product_id` BIGINT** only. | No UUID column on history in this audit scope. |
| **CatalogOS quotes** | **`won_order_id`** only — UUID quote lines do not create Express `order_items` here. | Future bridge must set **`canonical_product_id`** explicitly. |

---

## 3. Remaining blockers and sharp edges

| # | Item | Severity |
|---|------|----------|
| 1 | **Data prerequisite:** every checkout SKU must be mappable to **`catalogos.products`** via **`live_product_id`**, or carts/checkout return **422**. | **Launch process** — data/catalog readiness, not a code gap. |
| 2 | **`createOrder` should attach resolved UUIDs to `order.items` returned to callers** (or **`reserveStockForOrder` should load lines from `order_items`**) so reserve/dedupe logic always sees the same canonical as the DB. | **Medium** — inventory UUID backfill consistency. |
| 3 | **`upsertInventory` does not require UUID** — admin/Fishbowl-style paths can write **NULL** `canonical_product_id`. | **Medium** for reporting/inventory_resolved cleanliness. |
| 4 | **Pre-existing inventory rows** with NULL UUID may not get UUID on **reserve** if in-memory order lines lack it after create. **Deduct** can patch from **`order_items.canonical_product_id`**. | **Low–medium** — eventual consistency. |
| 5 | **Analytics** that join **`order_items` → `products` on BIGINT only** (e.g. some admin dashboards) remain **semantically legacy**; prefer **`order_items_resolved`** or UUID joins for catalog truth. | **Follow-up** (see `docs/canonical-product-id-write-path-audit.md`). |
| 6 | **Optional/guest carts** with **very old JSON** in `carts.items`: first **guarded** mutation or **checkout** runs resolver; until then, stored JSON might omit UUID — **checkout still blocks** if unmapped. | **Low** |

---

## 4. Client payloads — still omitting `canonical_product_id`?

| Client | Behavior |
|--------|----------|
| **Legacy PDP (`public/js/app.js`)** | Sends UUID **when** `state.product` / page product includes **`canonical_product_id`** (`canonicalProductIdForCartPayload`). Otherwise relies on **server bridge** on cart POST / ensures. |
| **Bulk CSV / SKU list** | May omit UUID per row; **bulk route** runs **`ensureCommerceLinesHaveCanonical`** on the full cart. |
| **API consumers** | Any client that bypasses Express or writes **`carts` / `order_items` directly** (service role) can still omit UUID — **out of scope** for this Express audit. |

---

## 5. Admin / manual order entry

- **`PUT /api/admin/orders/:id`** only updates status/tracking — **does not** replace line items through this handler, so it does not hit **`updateOrder` with `items`** in the common path.
- If a future admin UI sends **`items`** to **`dataService.updateOrder`**, **`requireCanonical: true`** applies — unmapped lines **throw** → should be wrapped with **`respondCommerceCanonicalError`** if exposed via HTTP.

---

## 6. Quote conversion (applicable?)

- **In this repository:** quote win only sets **`won_order_id`** on CatalogOS quote records (`catalogos/src/lib/quotes/service.ts`). **No** verified path creates **`public.order_items`** from quote lines with or without UUID.
- **Future:** any automation must map **`catalogos.quote_line_items.product_id` (UUID)** → **`order_items.canonical_product_id`** (and decide legacy **`product_id`**).

---

*Verification performed against the repo’s current `server.js`, `services/dataService.js`, `lib/inventory.js`, `lib/resolve-canonical-product-id.js`, and `public/js/app.js`. Re-run after any commerce or catalog schema change.*
