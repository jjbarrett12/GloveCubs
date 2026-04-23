# Canonical product ID write-path audit (commerce)

Audit scope: paths that **create or mutate** `carts`, `orders`, `order_items`, `inventory`, quote-to-order linkages, or **analytics-style reads** that assume BIGINT `product_id` joins—verified against `canonical_product_id` (UUID → `catalogos.products.id` / `public.canonical_products.id`).

**Authoritative DDL and strategy:** `supabase/migrations/20260626100000_order_inventory_catalog_product_uuid.sql` and `docs/order-inventory-id-alignment.md`.

---

## Summary

| Area | Writes `canonical_product_id`? | Notes |
|------|-------------------------------|--------|
| Checkout → `order_items` insert | **No** | `orderPayload.items` still only `{ product_id, quantity, size, unit_price }`; `createOrder` does not map UUID onto DB rows. |
| `services/dataService.js` `createOrder` / `updateOrder` | **No** | Inserts still `{ order_id, product_id, quantity, size, unit_price }` only. |
| Cart JSON (selected routes) | **Partial** | `POST /api/cart`, `/api/cart/bulk`, reorder from order: accept and persist **`canonical_product_id`** when the client sends it (`lib/contracts/cart-line.js`, `server.js`). `GET /api/cart` spreads stored lines, so UUID is returned if present. |
| Cart: saved lists → cart | **No** | `POST /api/saved-lists/:id/add-to-cart` still pushes `{ id, product_id, size, quantity }` only. |
| `lib/inventory.js` | **No** | Reserve/release/deduct/`_ensureInventory` keyed by BIGINT `product_id`; inserts omit UUID. |
| `services/dataService.js` `upsertInventory` | **No** | Upsert on `product_id` only. |
| Order API **reads** (enrichment) | **Partial** | `_enrichOrderWithItems`, `getOrderByIdAdmin`, `getAllOrdersAdmin` **pass through** `canonical_product_id` when the row has it (`services/dataService.js`). |
| DB backfill + views | **N/A (DB)** | Backfill sets UUID where `live_product_id` maps; `order_items_resolved` / `inventory_resolved` expose `catalog_product_id`. |
| Storefront jobs / buyer spend | **Read + resolve** | Prefer `canonical_product_id`; bridge via `live_product_id` map when not. |

**Verdict:** **Writes** of `canonical_product_id` on **`order_items` and `inventory` at checkout/inventory mutation time** remain the **launch blocker**. Cart can now **carry** UUID if the **client** supplies it; the **legacy `public/js/app.js` PDP** still does not send it, and **checkout never copies cart UUID into `orderPayload.items`**. Database backfill + resolved views mitigate **read** gaps for historical rows where mapping exists.

---

## 1. Safe paths (correct or intentionally resilient)

| Path | File(s) | Behavior |
|------|---------|----------|
| Resolved UUID helper | `storefront/src/lib/commerce/resolve-catalog-product-id.ts` (+ tests) | `canonical_product_id` first, else `live_product_id` → catalog UUID map. |
| Buyer spend / rollups | `storefront/src/lib/buyer-intelligence/dashboard.ts` | Selects `order_items(..., canonical_product_id, product_id, ...)`, `resolveOrderItemCatalogProductId`, `canonical_products` names. |
| Daily price guard | `storefront/src/lib/jobs/handlers/dailyPriceGuard.ts` | Selects `canonical_product_id` + `product_id`; groups by resolved catalog UUID. |
| Pricing recommendation | `storefront/src/lib/jobs/handlers/pricingRecommendation.ts` | Catalog-scoped tables (not a substitute for fixing `order_items` inserts). |
| DB views | `public.order_items_resolved`, `public.inventory_resolved` (migration) | `catalog_product_id` for SQL/BI. |
| Quote lines (CatalogOS) | `catalogos/src/lib/quotes/service.ts`, `catalogos/src/lib/quotes/types.ts` | Quote line `product_id` is UUID in CatalogOS; distinct from `public.order_items`. |
| API DTO / mapper (Express order line shape) | `storefront/src/lib/contracts/map-commerce.ts`, `legacy-express-api.ts` | Documents and maps **`canonical_product_id`** on legacy order line DTOs. |
| Cart line contract (Express) | `lib/contracts/cart-line.js` | Validates/persists optional **`canonical_product_id`** on cart lines where routes use it. |

---

## 2. Broken or incomplete paths

### 2.1 Launch blockers (wrong or missing UUID on new commerce writes)

| Issue | Details | Files |
|-------|---------|--------|
| `order_items` insert omits UUID | `createOrder` / `updateOrder` map items to `product_id` only. | `services/dataService.js` (`createOrder`, `updateOrder`) |
| Checkout does not pass cart UUID to orders | `orderItems` / `orderPayload.items` built from cart with **`product_id` only** (Net 30 + Stripe `pending_payment`). | `server.js` (`POST /api/orders`, `POST /api/orders/create-payment-intent`) |
| Inventory mutations ignore UUID | Reserve/release/deduct; `_ensureInventory` insert. | `lib/inventory.js` |
| Admin inventory API | `upsertInventory` / `getInventoryByProductId` by BIGINT only. | `services/dataService.js` |
| PDP → cart (typical path) | If `public/js/app.js` only posts `product_id`, cart lines never gain UUID until client is updated. | `public/js/app.js` (call sites for `POST /api/cart`) |

### 2.2 Incomplete / follow-up

| Issue | Details | Files |
|-------|---------|--------|
| Saved lists → cart | No `canonical_product_id` on pushed lines. | `server.js` (`POST /api/saved-lists/:id/add-to-cart`) |
| Spend analytics BIGINT join | `order_items` → `products!inner` on `product_id`; not `order_items_resolved` / UUID-first. | `storefront/src/app/admin/buyer/page.tsx` (`getSpendAnalytics`) |
| Market intelligence | `getMarketIntelligence`: `order_items` + `canonical_products` embed + `buyer_id` filter—verify FK/schema vs repo migrations. | `storefront/src/lib/buyer-intelligence/dashboard.ts` |
| Owner cockpit | Inventory listing by legacy `product_id` only. | `services/ownerCockpitService.js` |
| `stock_history` | BIGINT `product_id` only until a parallel UUID column exists. | `lib/inventory.js` (`_logStockHistory`) |
| Quote → `public.order_items` | No audited bridge from `catalogos.quote_line_items` to `public.order_items` setting `canonical_product_id`. | `catalogos/src/lib/quotes/service.ts` |
| `APPLY_MIGRATIONS.sql` drift | May define `order_items` without `canonical_product_id`. | `APPLY_MIGRATIONS.sql` |

---

## 3. Exact files to update (recommended order)

1. **`server.js`** — When assembling `orderPayload.items`, include **`canonical_product_id`** from each cart line (and validate UUID). Same for both checkout endpoints.
2. **`services/dataService.js`** — Extend `createOrder` / `updateOrder` item rows with **`canonical_product_id`** from payload; extend **`upsertInventory`** (and optional lookup by UUID).
3. **`lib/inventory.js`** — Thread **`canonical_product_id`** on reserve/release/deduct and `_ensureInventory` when known.
4. **`public/js/app.js`** — Pass **`canonical_product_id`** on add-to-cart when the product/detail view has a catalog UUID (if exposed by API).
5. **`server.js`** — Saved-list add-to-cart: copy **`canonical_product_id`** from list items when stored.
6. **`storefront/src/app/admin/buyer/page.tsx`** — Spend query: `order_items_resolved` or UUID + `canonical_products`.
7. **`storefront/src/lib/buyer-intelligence/dashboard.ts`** — Fix **`getMarketIntelligence`** / filters to match real schema and UUID joins.
8. **`services/ownerCockpitService.js`** — Optional: select **`canonical_product_id`** for catalog UX.
9. **`APPLY_MIGRATIONS.sql`** — Align with `20260626100000_order_inventory_catalog_product_uuid.sql` or warn operators.

**Shared helper:** Mirror **`resolveOrderItemCatalogProductId`** on the Node side or resolve UUID server-side from `catalogos.products` / `live_product_id` before insert.

---

## 4. Launch blockers vs follow-up

| Priority | Item |
|----------|------|
| **Launch blocker** | **`order_items` and inventory rows** must persist **`canonical_product_id` on write** from checkout and stock mutations if launch criteria require UUID at source (not only backfill + views). |
| **Launch blocker** | **Checkout** must propagate cart **`canonical_product_id`** into **`createOrder`** item payloads (today it does not). |
| **Follow-up** | Saved-list → cart UUID; admin buyer spend BIGINT join; `getMarketIntelligence`; owner cockpit; **`stock_history`** UUID; quote-won bridge; **`APPLY_MIGRATIONS.sql`**. |
| **Ops** | Regenerate types / keep migrations authoritative (`docs/types-and-contract-audit.md`). |

---

## 5. Background jobs touching commerce records

| Job / handler | Touches | `canonical_product_id` |
|---------------|---------|-------------------------|
| `dailyPriceGuard` | `order_items` read | Yes (selected + resolved) |
| `pricingRecommendation` | `canonical_products`, recommendations | Yes (catalog-scoped) |
| Stripe webhook (`server.js`) | `orders` status | Does not mutate `order_items` |
| Stale `pending_payment` cleanup | `orders` | N/A for line items |

No other job **inserts** `order_items` or **`inventory`**; writes concentrate in **`services/dataService.js`**, **`server.js`**, **`lib/inventory.js`**.

---

*Re-audited against repo state; re-grep `order_items`, `canonical_product_id`, `setCart`, `createOrder` after fixes.*
