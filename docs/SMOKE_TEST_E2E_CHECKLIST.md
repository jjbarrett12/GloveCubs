# GloveCubs end-to-end smoke test checklist (staging / pre-release)

Use this after deployments to prove **ingest → publish → identity bridge → cart → checkout → payment → admin fulfillment → inventory** still works. Pair with `scripts/smoke-staging.mjs` for automated reconciliation and optional API checks.

---

## Environment prerequisites

| Requirement | Notes |
|-------------|--------|
| Staging URLs | CatalogOS app URL, Express API base (`PORT` default **3004**), storefront URL if used |
| Supabase | `SUPABASE_URL` + **service role** for reconciliation SQL (script); anon key insufficient for admin queries |
| Auth | Test buyer approved for Net 30 **or** use card-only path; admin user for ship / operational endpoints |
| Stripe test | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, test publishable key on client |
| Inventory | At least one **in-stock** `public.products` row with `canonical_product_id` bridge (`catalogos.products.live_product_id`) |

---

## Phase 0 — Baseline reconciliation (run first & last)

**UI / script:** `node scripts/smoke-staging.mjs --reconcile-only`  
**API (admin):** `GET /api/admin/orders/operational-alerts`, `GET /api/admin/inventory/verify`

| Check | Tables / fields | Pass criteria |
|--------|------------------|---------------|
| Payment integrity holds | `orders.payment_integrity_hold`, `payment_integrity_notes` | **0** rows (or known exceptions documented) |
| Shipped without deduct | `orders.status = shipped` AND `inventory_deducted_at` IS NULL | **0** rows |
| Cancelled still reserved | `orders.status = cancelled`, `inventory_reserved_at` set, `inventory_released_at` NULL, `inventory_deducted_at` NULL | **0** rows |
| Stale `pending_payment` | `orders.status = pending_payment`, old `created_at` | Investigate; cleanup job or ops |
| Inventory shape | `inventory.quantity_reserved` vs `quantity_on_hand` | **No** `reserved > on_hand`, **no** negative qty |
| Published without live bridge | `catalogos.products`: `published_at` NOT NULL, `live_product_id` NULL | **0** rows (launch blocker for checkout) |
| Search sync failures | `catalogos.supplier_products_normalized.search_publish_status = 'sync_failed'` | **0** or queued retries completing |
| Order lines identity | `order_items.canonical_product_id` on **new** orders | Non-null after hardened checkout |

**Launch blockers:** Any non-zero **payment_integrity_hold**, **shipped without deduct**, **published catalog row without `live_product_id`** (for SKUs meant to sell on legacy checkout), or **mass** `sync_failed` / NULL canonical on new order lines.

---

## Step 1 — Ingest product

| Item | Detail |
|------|--------|
| **UI action** | CatalogOS: ingestion batch upload / URL import → row appears in **Staging** (`/dashboard/staging` or batch detail). |
| **API (varies)** | Bulk import may use `POST /api/admin/import/bulk` (Express) — follow `docs/` for your pipeline. |
| **DB** | `catalogos.supplier_products_normalized`: new row, `status` typically `pending`, `batch_id` set. |
| **Logs** | Ingestion/orchestrator logs; no unhandled import errors. |
| **Failure signal** | Row missing, or stuck error state with no normalized payload. |

---

## Step 2 — Approve / link master

| Item | Detail |
|------|--------|
| **UI action** | Review queue: match to master or create master; **Approve** / **Merge**; `master_product_id` populated. |
| **DB** | `supplier_products_normalized.status` → `approved` or `merged`; `master_product_id` NOT NULL. |
| **Logs** | Optional `admin_catalog_audit` if your deployment logs actions. |
| **Failure signal** | `isPublishBlocked` true in UI (no master, no name, validation_errors). |

---

## Step 3 — Publish

| Item | Detail |
|------|--------|
| **UI action** | Publish from review detail or bulk publish / publish-ready dashboard. |
| **API** | `POST {catalogos}/api/publish` with `staging_ids` (server-side uses `runPublish`). |
| **DB** | `catalogos.products` updated (`published_at`); `supplier_offers` upserted; `catalogos.products.live_product_id` → `public.products.id`; `search_publish_status` → `published_synced`; `public.canonical_products` row visible for UUID. |
| **Logs** | On failure: `legacy_commerce_bridge_failed`, `publish_failure`, `sync_canonical_products` telemetry in CatalogOS. |
| **Failure signal** | Publish error JSON; `sync_failed` on staging row; **no** `live_product_id` after success path. |

---

## Step 4 — Verify canonical search visibility

| Item | Detail |
|------|--------|
| **UI / API** | Storefront search or Supabase: query `public.canonical_products` WHERE `id` = catalog product UUID AND `is_active`. |
| **DB** | Row exists; `sku`, `name` populated; `search_vector` updated (trigger). |
| **Failure signal** | Missing row while `published_synced` — RPC or RLS issue. |

---

## Step 5 — Verify legacy `public.products` bridge

| Item | Detail |
|------|--------|
| **DB** | `SELECT id, sku, price, cost FROM public.products WHERE id = (SELECT live_product_id FROM catalogos.products WHERE id = '<uuid>')`. |
| **DB** | `catalogos.products.live_product_id` NOT NULL for that master. |
| **Failure signal** | NULL `live_product_id` → checkout cannot resolve canonical from `product_id` alone. |

---

## Step 6 — Add to cart

| Item | Detail |
|------|--------|
| **Legacy UI** | Product page → Add to cart (uses `public.products.id`). |
| **API** | `POST /api/cart` with `product_id`, `quantity`, `size` (Bearer buyer token). |
| **DB** | `carts` row for `cart_key` = `user_{id}`; items include resolvable line. |
| **Logs** | `[commerce-canonical] bridge_resolve` if UUID inferred from live id (warn-level). |
| **Failure signal** | 422 `MISSING_CANONICAL_PRODUCT_ID`. |

---

## Step 7 — Net 30 checkout

| Item | Detail |
|------|--------|
| **UI** | Checkout → Net 30. |
| **API** | `POST /api/orders` with `payment_method: 'net30'`, valid `shipping_address`, `Idempotency-Key` optional. |
| **DB** | `orders.status` = `pending`; `inventory_reserved_at` set; `order_items.canonical_product_id` set; cart cleared. |
| **Logs** | `inventoryReserved`; no `inventory.reserve_failed`. |
| **Failure signal** | 400 not approved for Net 30 → use **approved** test account or card path. |

---

## Step 8 — Card checkout + Stripe test payment

| Item | Detail |
|------|--------|
| **UI** | Stripe Elements → pay with test card `4242…`. |
| **API** | `POST /api/orders/create-payment-intent` → client confirms PI with Stripe.js. |
| **DB** | Order `pending_payment` → after webhook → `pending`, `payment_confirmed_at`, `stripe_payment_intent_id` set. |
| **Logs** | `paymentIntentCreated`; webhook: `paymentIntentSucceeded`; **no** `stripe.critical_payment_amount_mismatch`. |
| **Failure signal** | `payment_integrity_hold` = true; order stuck `pending_payment` with succeeded charge. |

---

## Step 9 — Stripe webhook processing

| Item | Detail |
|------|--------|
| **Action** | Stripe Dashboard (event delivery) or **Stripe CLI**: `stripe listen --forward-to https://<api>/api/webhooks/stripe` then pay test card. |
| **DB** | Same as step 8; `webhook_events` / idempotency table if used — no duplicate side effects on replay. |
| **Logs** | Webhook 200; idempotent skip on duplicate `event.id`. |
| **Failure signal** | 4xx/5xx on webhook; infinite retries; amount/currency mismatch logs. |

---

## Step 10 — Admin ship → inventory deduct

| Item | Detail |
|------|--------|
| **UI** | Admin order modal: set tracking, status **Shipped**. |
| **API** | `PUT /api/admin/orders/:id` `{ "status": "shipped", "tracking_number": "…" }` (admin JWT). |
| **DB** | **Before** status row update: deduct RPC runs; `orders.inventory_deducted_at` set; `inventory.quantity_on_hand` / `quantity_reserved` consistent; `stock_history` **deduct** rows. |
| **Logs** | Deduct success; **no** `inventory.deduct_failed_admin_ship` after successful response. |
| **Failure signal** | 409 `PAYMENT_INTEGRITY_HOLD`, `SHIP_REQUIRES_PAYMENT`, etc.; or shipped row with NULL `inventory_deducted_at`. |

---

## Step 11 — Cancel another order → inventory release

| Item | Detail |
|------|--------|
| **Setup** | Second order in `pending_payment` or `pending` with **reservation**, not deducted. |
| **API** | Webhook `payment_intent.canceled` or admin `PUT` status `cancelled` / customer cancel if implemented. |
| **DB** | `inventory_released_at` set; reserved qty reduced; order terminal status. |
| **Logs** | `inventoryReleased` with reason. |
| **Failure signal** | Cancelled order still holding reservation (reconciliation query). |
| **Admin guard** | Cancel after **deduct** → **409** `POST_DEDUCT_ABANDON_BLOCKED` (expected). |

---

## Step 12 — Final reconciliation

Repeat **Phase 0**. Compare counts to baseline.

---

## Scripted automation (repo)

| Script | Command | What it does |
|--------|---------|----------------|
| **Reconciliation + API smoke** | `node scripts/smoke-staging.mjs --reconcile-only` | Supabase checks for critical anomaly rows + optional `catalogos` bridge gap. |
| | `node scripts/smoke-staging.mjs --api` | Login, optional cart/order/admin calls (requires env). |
| **Legacy E2E runner** | `node scripts/e2e-test.js --url=http://localhost:3004` | Catalog/cart/payment-intent/admin ship (uses `/api/auth/*`). |

**Stripe webhook** is not fully scripted in-repo (needs signed payloads). Use Stripe CLI against staging or pay with test card with listener attached.

---

## Quick reference: endpoints

| Step | Method + path |
|------|----------------|
| Login | `POST /api/auth/login` |
| Products | `GET /api/products` |
| Cart | `POST /api/cart`, `GET /api/cart` |
| Net 30 order | `POST /api/orders` |
| Card | `POST /api/orders/create-payment-intent` |
| Webhook | `POST /api/webhooks/stripe` (raw body) |
| Admin ship | `PUT /api/admin/orders/:id` |
| Operational alerts | `GET /api/admin/orders/operational-alerts` |
| Inventory verify | `GET /api/admin/inventory/verify` |

CatalogOS publish: `POST /api/publish` on the **catalogos** Next app base URL (not Express).

---

## Related docs

- `docs/PUBLISH_SELLABLE_PIPELINE.md` — publish → bridge → search  
- `docs/ADMIN_ORDER_INVENTORY_TRANSITIONS.md` — admin transition guards  
- `docs/STRIPE_PAYMENT_FLOW.md` / `docs/STRIPE_PAYMENT_REFUND_LIFECYCLE.md` — payments  
