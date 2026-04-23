# Inventory canonical ID hardening

This document describes how **`canonical_product_id`** is applied across **inventory mutations** and **`stock_history`** after commerce checkout began enforcing UUIDs on **`order_items`**.

## Decision: `stock_history.canonical_product_id`

**Yes — additive column now.**

- **Rationale:** Audit rows should align with the same catalog identity as orders and inventory when possible, without breaking historical **`product_id`** joins.
- **Shape:** Nullable **`UUID`**, optional FK to **`catalogos.products(id)`**, `ON DELETE SET NULL`, deferrable (same pattern as **`inventory.canonical_product_id`**).
- **Backfill:** One-time `UPDATE` from **`public.inventory`** where **`inventory.canonical_product_id`** is already set.
- **New writes:** `lib/inventory.js` **`_logStockHistory`** resolves UUID (order line → inventory row → `live_product_id` bridge) and sets **`canonical_product_id`** on insert when resolved.

Migration: **`supabase/migrations/20260628100000_stock_history_canonical_product_id.sql`**.

## Tables touched

| Table | `product_id` (BIGINT) | `canonical_product_id` (UUID) |
|-------|----------------------|-------------------------------|
| **`public.inventory`** | Primary compatibility key; **`ON CONFLICT (product_id)`** for admin upsert | Preferred for catalog alignment; unique when non-null (existing migration) |
| **`public.stock_history`** | Retained; FK to **`products`** | Additive; nullable; populated on new inserts when resolvable |

## Reads (canonical-first)

| Helper | Behavior |
|--------|-----------|
| **`getStockForLineItem(item)`** | Selects **`inventory`** by **`canonical_product_id`** when the line includes a valid UUID, else by **`product_id`**. Returns stock fields plus **`product_id`** / **`canonical_product_id`** when present. |
| **`getStock(productId, { canonical_product_id })`** | Delegates to **`getStockForLineItem`**; optional UUID opts into the same canonical-first path (e.g. admin tools that know the catalog id). |
| **`checkAvailability(items)`** | Uses **`getStockForLineItem`** per line so carts/order-shaped lines with UUIDs resolve stock against the canonical row. |
| **`reserveStockForOrder`** | Availability checks and per-line stock reads use **`getStockForLineItem`**; atomic **`UPDATE … WHERE product_id = ?`** is unchanged. |

If a canonical-keyed row’s **`product_id`** differs from the line’s legacy id, a warning is logged: **`[inventory-canonical] read_row_product_id_mismatch`** (data integrity follow-up).

## Admin / integrations

| Path | Change |
|------|--------|
| **`GET /api/admin/inventory`** | Each row includes **`canonical_product_id`** (from **`inventory`**, else normalized from **`product`** when present). |
| **`PUT /api/admin/inventory/:product_id`** | Accepts optional **`canonical_product_id`** (validated); otherwise passes through **`product.canonical_product_id`** into **`upsertInventory`**. |
| **`POST /api/admin/inventory/cycle`** | Each count may include **`canonical_product_id`**; otherwise uses **`product.canonical_product_id`** when set. Invalid UUID in a row is skipped with a console warning. |
| **`GET /api/admin/inventory/history`** | Supports **`canonical_product_id`** query param (validated). When set, filters **`stock_history`** by UUID; otherwise **`product_id`** or unfiltered. |
| **`POST /api/fishbowl/sync-inventory`** | **`upsertInventory`** receives **`canonical_product_id`** from **`product`** when present (still bridges inside **`upsertInventory`** if missing). |

## Module layout

| File | Role |
|------|------|
| **`lib/inventory-canonical.js`** | `resolveCanonicalForInventoryEvent(productId, { explicitLine, explicitRow }, context)` — order **explicit_line** → **inventory_row** → **bridge**; logs **`[commerce-canonical] bridge_resolve`** or **`[inventory-canonical] write_without_resolved_canonical`**. |
| **`lib/inventory.js`** | Canonical-first reads (**`getStockForLineItem`**); mutations call the resolver where needed; **`_ensureInventory`** uses **`resolveCanonicalForInventoryEvent`** (no duplicate bridge logic); **`_logStockHistory`** attaches UUID to **`stock_history`** when resolved. |
| **`services/dataService.js`** | **`upsertInventory`** uses **`logInventoryWriteWithoutCanonical`** when payload + bridge yield no UUID. |

## Write paths (behavior summary)

| Path | Canonical behavior |
|------|-------------------|
| **`_ensureInventory`** | Hint from caller (e.g. order line); else bridge; **`logInventoryWriteWithoutCanonical`** if new row inserted without UUID. |
| **`reserveStockForOrder`** | Resolver fills **`reservePatch.canonical_product_id`** when row lacked UUID; post-update check logs if still missing. |
| **`releaseStockForOrder`** | Select row canonical; patch from **line or row**; **`stock_history`** gets resolved UUID; post-update warning if row still lacks UUID. |
| **`deductStockForOrder`** | Resolver backfills patch when row lacked UUID; same logging pattern. |
| **`adjustStock`** | Resolver for patch; post-update warning if still missing. |
| **`receivePurchaseOrder`** | **`_ensureInventory`** with **`line.canonical_product_id`** hint when present; resolver on patch; post-receive warning if row still missing UUID. |
| **`setIncomingQuantity`** | Resolver on patch; post-update warning if still missing. |
| **`upsertInventory`** (dataService) | Payload → bridge → **`logInventoryWriteWithoutCanonical`** if still no UUID. |

Physical stock movement and atomic conditions remain keyed by **`inventory.product_id`** — no change to **`UNIQUE (product_id)`** semantics.

## Paths not fully migrated (explicit)

| Location | Reason |
|----------|--------|
| **`services/ownerCockpitService.js`** | Dashboard reads **`inventory`** by legacy **`product_id`** / listing only; no commerce line context. Low risk; can adopt **`canonical_product_id`** in selects when the cockpit UI needs catalog alignment. |
| **Internal `verifyInventoryConsistency` / admin verify endpoints** | Still keyed by **`product_id`** in **`server.js`**; they call **`inventory.getStock(productId)`** without a line UUID. Acceptable for per-SKU admin drills until the UI passes **`canonical_product_id`**. |

## Logging conventions

| Prefix | Meaning |
|--------|---------|
| **`[commerce-canonical] bridge_resolve`** | UUID obtained only via **`catalogos.products.live_product_id`**. |
| **`[inventory-canonical] write_without_resolved_canonical`** | Mutation completed (or row exists) without a resolvable catalog UUID — investigate catalog mapping or data entry. |

## Tests

- **`tests/inventory-canonical.test.js`** — `resolveCanonicalForInventoryEvent` (explicit line, row, bridge) with mocked Supabase admin client.
- **`tests/inventory-mutations.test.js`** — canonical-first **`getStockForLineItem`**, **`getStockHistory`** filter, **`upsertInventory`**, **`reserveStockForOrder`**, **`releaseStockForOrder`**, **`deductStockForOrder`**, **`receivePurchaseOrder`** / **`_ensureInventory`** (mocked Supabase).

## Operations

1. Apply **`20260628100000_stock_history_canonical_product_id.sql`** after existing order/inventory UUID migrations.
2. Ensure service role can read **`catalogos.products`** for bridge resolution (same as checkout).
3. Monitor **`[inventory-canonical]`** logs for SKUs missing **`live_product_id`** mapping.

## References

- `docs/canonical-product-id-write-path-implementation.md`
- `supabase/migrations/20260626100000_order_inventory_catalog_product_uuid.sql`
- `lib/inventory.js`, `lib/inventory-canonical.js`
