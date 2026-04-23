# GloveCubs launch scope lock (v1)

**Purpose:** Engineering and ops agreement on what production is **allowed** to do at launch. This reflects **current** behavior in repo, not a future roadmap.

**Companion:** Operational steps live in [`LAUNCH_RUNBOOK.md`](./LAUNCH_RUNBOOK.md).

---

## Legend

| Label | Meaning |
|-------|---------|
| **IN** | Supported for v1 launch; tested path; failures are incidents. |
| **CAUTION** | Allowed only with runbook awareness; extra verification; higher blast radius. |
| **OUT** | Not a launch commitment; may exist in code but **must not** be relied on without follow-up work. |

---

## Launch scope table

| Area | Scope | Notes (system reality) |
|------|--------|-------------------------|
| **Catalog ingest** | **IN** | Batches → `supplier_products_normalized`; AI-assisted paths are review-first, not auto-live. |
| **Review / approve / link master** | **IN** | Required before publish; `evaluatePublishReadiness` / `isPublishBlocked` gate obvious bad rows. |
| **Publish (canonical)** | **IN** | `runPublish` + attribute sync + supplier offers + **`ensureLegacyCommerceBridge`** + `finalizePublishSearchSync`. Fail-closed if search sync or bridge fails. |
| **Publish (legacy service)** | **OUT** | `publishStagingCatalogos` — can set `live_product_id` **without** full canonical attribute pipeline; **do not** use as primary publish path for launch. |
| **Search visibility** | **IN** | `public.canonical_products` via `catalogos.sync_canonical_products()`; staging `search_publish_status` must reach `published_synced` for “live & searchable.” |
| **Legacy storefront / Express catalog read** | **IN** | `public.products` (or compat view via `PRODUCTS_READ_SOURCE`); cart uses numeric `product_id` + canonical bridge. |
| **Net 30 checkout** | **IN** | **Approved B2B accounts only** (`is_approved`); creates `pending` order + reservation. |
| **Card / ACH checkout** | **IN** | `create-payment-intent` → Stripe → webhook; server totals only; duplicate PI blocked by DB index. |
| **Stripe webhooks** | **IN** | Signed `/api/webhooks/stripe`; idempotent by event id; amount/currency verified vs `orders.total`; mismatch → `payment_integrity_hold`, no auto-paid. |
| **Admin ship** | **IN** | Guarded: no ship on integrity hold / unpaid card path / invalid state; **deduct before** status persisted as shipped. |
| **Admin cancel / abandon** | **IN** | Release reserved stock when moving to cancelled / payment_failed / expired **if not** already deducted; **blocked** if `inventory_deducted_at` set (no silent cancel-after-ship). |
| **Admin status edits** | **CAUTION** | Arbitrary status changes are constrained; regressing `shipped` blocked; invalid transitions return 4xx with codes. |
| **Inventory reservation / release / deduct** | **IN** | RPC-backed; idempotent at order level; aligned with order timestamps. |
| **Admin inventory PUT / adjust / cycle** | **CAUTION** | Requires catalog `canonical_product_id` policy; `on_hand < reserved` blocked; qty changes go through `adjustStock` + `stock_history` (not raw silent upsert for qty). |
| **Fishbowl sync** | **CAUTION** | `POST /api/fishbowl/sync-inventory` bulk-updates `public.products` **without** per-line `stock_history` like admin adjust; use only with ops understanding and post-sync reconciliation. |
| **Bulk CSV / admin import** | **CAUTION** | Powerful; can widen blast radius; run in maintenance window or with validation + smoke after. |
| **Refunds / partial refunds** | **OUT** (ops) | **Documented** in `STRIPE_PAYMENT_REFUND_LIFECYCLE.md`; **not** fully automated in app for v1—process in Stripe Dashboard + manual order/inventory alignment. |
| **Payment void before ship** | **OUT** (automated) | Partially covered by webhooks (cancel/fail); full RMA/void workflow is manual + docs. |
| **Distributor staging → publish** | **CAUTION** | `publish-distributor-approved` and related flows may be partial; verify against same canonical publish path before relying on launch. |
| **Direct SQL / Supabase SQL editor** | **OUT** | Bypasses all guards; emergency only with change control. |
| **CatalogOS internal retry queue** | **IN** | `canonical_sync_retry_queue` / internal retry routes—ops must monitor until `published_synced`. |

---

## Explicit “disable or avoid” for v1 (recommended)

1. **Do not** treat **`publishStagingCatalogos`** as equivalent to **review UI / `runPublish` / POST CatalogOS `/api/publish`** for customer-facing SKUs.
2. **Do not** run **Fishbowl sync** immediately before peak order volume without a **reconciliation** pass (`smoke-staging`, `GET /api/admin/inventory/verify`).
3. **Do not** promise **automated partial refunds** or **inventory restock from refund webhooks** at launch—handle in Stripe + manual order state.
4. **Restrict** `OWNER_EMAIL` / `app_admins` to named people; **no** shared admin passwords.

---

## Sign-off block (copy for change control)

| Role | Name | Date | Scope version |
|------|------|------|----------------|
| Engineering | | | v1 |
| Operations | | | v1 |
| Product (optional) | | | v1 |

**Scope version:** pin git tag / release name: `________________`
