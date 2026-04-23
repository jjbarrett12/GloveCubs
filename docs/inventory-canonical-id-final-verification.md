# Inventory `canonical_product_id` — final verification (post–hardening pass)

This audit checks whether **active NEW inventory mutations** still **rely only on legacy BIGINT `product_id`** when a catalog UUID **could** be resolved, and how that compares to the **checkout / `order_items` hard bar** (422 when unmapped).

**Primary code:** `lib/inventory.js`, `lib/inventory-canonical.js`, `lib/resolve-canonical-product-id.js`, `services/dataService.js` (`upsertInventory`), `server.js` (admin inventory, Fishbowl sync, order-triggered calls).

**Schema:** `public.inventory.canonical_product_id`, `public.stock_history.canonical_product_id` (`supabase/migrations/20260626100000_order_inventory_catalog_product_uuid.sql`, `20260628100000_stock_history_canonical_product_id.sql`), view `public.inventory_resolved` (from order/inventory alignment migration).

---

## 1. Fully migrated paths (UUID-aware reads + writes where intended)

| Path | What hardened | Mechanism |
|------|----------------|-----------|
| **Stock reads for cart/order lines** | Prefer catalog identity when the line carries a UUID | `_resolveInventoryRowForRead` → `.eq('canonical_product_id', canon)` first, else `.eq('product_id', …)`; mismatch logged (`read_row_product_id_mismatch`). |
| **`checkAvailability`** | Same as line-shaped reads | Uses `getStockForLineItem(item)` (not BIGINT-only `getStock(id)` for arbitrary lines). |
| **`reserveStockForOrder`** | Patch + ensure + history | `_ensureInventory` uses `resolveCanonicalForInventoryEvent`; `reservePatch.canonical_product_id` when row lacked UUID; `_logStockHistory` with hints → **`stock_history.canonical_product_id`** when resolvable; `logInventoryWriteWithoutCanonical` if row still empty after update. |
| **`releaseStockForOrder` / `deductStockForOrder`** | Patch from order line + bridge | `resolveCanonicalForInventoryEvent` for `releasePatch` / `deductPatch`; post-update checks + logging. |
| **`adjustStock`** | Backfill UUID on row when missing | Bridge via `resolveCanonicalForInventoryEvent` into `adjustPatch`; stock_history insert gets UUID from hints/bridge. |
| **`receivePurchaseOrder`** | Line + row hints | `_ensureInventory(productId, line.canonical_product_id)`; patch when inv row missing UUID; `_logStockHistory` with hints. |
| **`setIncomingQuantity`** | Patch when inv row missing UUID | Same resolver pattern; post-update guard log. |
| **`_logStockHistory`** | New audit rows catalog-aligned when possible | Inserts **`canonical_product_id`** when `resolveCanonicalForInventoryEvent` returns a UUID (line/row/bridge). |
| **`getStockHistory`** | Reporting by UUID or BIGINT | Optional filter `options.canonical_product_id`; else legacy `product_id`. |
| **`upsertInventory` (dataService)** | Payload + bridge + explicit logging | Sets UUID from payload or `live_product_id` bridge; **`logInventoryWriteWithoutCanonical`** if still missing (does not throw). |
| **Admin `PUT /api/admin/inventory/:product_id`** | Passes UUID into upsert | Accepts body `canonical_product_id`; else uses `product.canonical_product_id` when present. |
| **Admin cycle count `POST /api/admin/inventory/cycle`** | Row / product UUID | Validates row UUID; falls back to `product.canonical_product_id`. |
| **Admin history `GET /api/admin/inventory/history`** | Query by UUID | `canonical_product_id` query param forwarded. |
| **Fishbowl sync** | Upsert with product UUID when known | `normalizeCanonicalUuidInput(product.canonical_product_id)` passed into `upsertInventory` when set. |

**Tests (non-stale for this layer):** `tests/inventory-canonical.test.js`, `tests/inventory-mutations.test.js`, `tests/inventory.test.js` (verify scope in each file after changes).

---

## 2. Compatibility-only paths (BIGINT remains primary key; bridge is best-effort)

| Topic | Behavior |
|-------|----------|
| **All `UPDATE` / `upsert` filters** | Still **`.eq('product_id', productId)`** (and `onConflict: 'product_id'`). UUID is **not** the physical row key for mutations. |
| **`resolveCanonicalForInventoryEvent` “bridge”** | Uses `catalogos.products.live_product_id` → UUID; logs **`[commerce-canonical] bridge_resolve`**. Same dependency as checkout. |
| **`upsertInventory` without mapping** | **No throw** — row can persist with **`canonical_product_id` NULL** after warn (`logInventoryWriteWithoutCanonical`). **Softer than checkout.** |
| **`_ensureInventory` new row** | Insert **without** `canonical_product_id` if bridge fails — logged via `logInventoryWriteWithoutCanonical`. |
| **`stock_history.reference_id`** | Still **numeric** for order ids, etc.; only **`canonical_product_id`** is catalog-aligned. |
| **`getStock(productId)`** | Admin paths that only pass BIGINT still read **by `product_id`** unless callers pass `options.canonical_product_id` (see `getStock` signature). |
| **`applyInventoryToProducts` (listing)** | Maps **`inventoryList` by `product_id`** only — storefront listing is legacy-keyed (acceptable for PDP/in_stock display, not catalog analytics). |

---

## 3. Remaining blockers and defects

| # | Issue | Severity |
|---|--------|----------|
| 1 | **Launch bar mismatch:** Inventory mutations **do not** enforce “must have UUID” like **`createOrder` + `requireCanonical`**. Unmapped SKUs can still get **inventory rows / upserts** with **NULL** `canonical_product_id` (warn-only). | **Process / product decision** — if launch requires parity with checkout, add **422 or hard fail** to `upsertInventory` / selected admin paths. |
| 2 | ~~**`getInventoryIssues()`** omitted **`canonical_product_id`** in `.select` while using it on rows~~ **Fixed:** select now includes **`canonical_product_id`**. | **Resolved** in `lib/inventory.js`. |
| 3 | **Dual lookup semantics:** Reads can target **UUID**; writes always **target `product_id`**. If data ever diverged (theoretical bad data), canonical-first read might not hit the row the writer updates. Code logs **product_id mismatch** on read when both ids present. | **Low** under normal FK + unique constraints. |
| 4 | **Owner cockpit / other services** | `services/ownerCockpitService.js` still selects inventory **without** emphasizing `canonical_product_id` in list UIs — reporting identity may stay BIGINT-oriented until updated. |

---

## 4. `stock_history` — blocker, follow-up, or acceptable holdout?

| Aspect | Verdict |
|--------|---------|
| **Schema** | **`canonical_product_id` added** + backfill from `inventory` where possible (`20260628100000_stock_history_canonical_product_id.sql`). **Not a launch blocker** for schema. |
| **New writes** | **`_logStockHistory`** sets UUID when resolver succeeds. **Acceptable** for new events if catalog mapping exists. |
| **Legacy rows** | May still have **NULL** UUID after backfill where inventory had no UUID — **acceptable compatibility**. |
| **Analytics** | Prefer filtering **`canonical_product_id`** (or join via **`inventory_resolved`**) for catalog-true reporting; **BIGINT-only** queries are **legacy-compatible**, not catalog-primary. |

**Conclusion:** **`stock_history` is follow-up / dual-read**, not a hard blocker, provided new mutations keep populating UUID where mapping exists and BI migrates to UUID filters over time.

---

## 5. Stale DTOs / helpers / tests

| Item | Notes |
|------|--------|
| **`getInventoryIssues`** | Select now includes **`canonical_product_id`** (aligned with issue payload). |
| **`verifyInventoryConsistency(productId)`** | BIGINT-only entry point; fine for “one legacy row” checks, not canonical-first. |
| **Tests** | **`inventory-canonical.test.js`** covers resolver/logging contract; keep **`inventory-mutations.test.js`** in sync when changing reserve/patch behavior. |

---

## 6. Is inventory safe to launch at the **same bar** as checkout?

**No — by design today it is a softer bar.**

- **Checkout / cart / `order_items`:** Unmapped catalog → **422** / **`MissingCanonicalProductIdError`** (hard stop).
- **Inventory:** Unmapped catalog → **warnings** (`logInventoryWriteWithoutCanonical`, `bridge_resolve` logs), **writes may still commit** with **NULL** `canonical_product_id` on **`inventory`** (and thus some **`stock_history`** rows may also lack UUID if resolver returns null).

**Recommendation:** Treat inventory as **aligned in implementation** (canonical-first reads, patch-on-write, history UUID when known) but **not equivalent in policy** until product chooses to **fail closed** on admin/sync upserts the same way as checkout, and **`getInventoryIssues`** is fixed for accurate UUID reporting.

---

*Verification reflects the repo state of `lib/inventory.js`, `lib/inventory-canonical.js`, `services/dataService.js`, and `server.js` inventory-related routes.*
