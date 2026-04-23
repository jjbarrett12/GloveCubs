# GloveCubs production launch runbook (engineering + ops)

**Audience:** Engineers deploying the stack and operators supporting live orders.  
**Scope:** Locked in [`LAUNCH_SCOPE_LOCK.md`](./LAUNCH_SCOPE_LOCK.md).  
**Smoke / reconciliation:** [`SMOKE_TEST_E2E_CHECKLIST.md`](./SMOKE_TEST_E2E_CHECKLIST.md), `scripts/smoke-staging.mjs`.

---

## 1. Pre-launch checklist

Run all items in **staging** first; repeat critical subsets in **production** before traffic.

### 1.1 Environment variables and secrets

| Variable / secret | Required | Notes |
|-------------------|----------|--------|
| `SUPABASE_URL` | Yes | Production project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only; never in client bundles. |
| `JWT_SECRET` | Yes | Strong random; not default in production (server enforces). |
| `STRIPE_SECRET_KEY` | Yes (card/ACH) | **Live** keys for prod; test keys only on staging. |
| `STRIPE_WEBHOOK_SECRET` | Yes (card/ACH) | From Stripe Dashboard → webhook endpoint; must match signing secret. |
| `STRIPE_PUBLISHABLE_KEY` | Yes (card/ACH) | Exposed via `/api/config` to client. |
| `DOMAIN` or `BASE_URL` | Yes | Links in email / redirects. |
| `OWNER_EMAIL` (or `SITE_OWNER_EMAIL`) | Recommended | Owner admin bypass; comma-separated if multiple. |
| `SMTP_*` / `ADMIN_EMAIL` | Recommended | Order / payment emails; ops visibility. |
| `INTERNAL_CRON_SECRET` | If using | `POST /api/internal/import/run` and similar. |
| `PRODUCTS_READ_SOURCE` | Optional | Only if using `catalog_v2_compat` view; default `public.products`. |

**Verify:** No `.env` committed; host secrets match staging parity checklist.

### 1.2 Migrations and database

- [ ] All Supabase migrations for **production** applied (including payment integrity index, inventory RPCs, `canonical_products`, catalogos schema as used by your project).
- [ ] **No** pending destructive migration without backup.
- [ ] RLS policies reviewed for **public read** surfaces (`canonical_products`, etc.).

### 1.3 Smoke test and reconciliation

- [ ] `node scripts/smoke-staging.mjs --reconcile-only` → **exit 0** against prod DB (read-only; use CI or jump host with service role).
- [ ] `npm run smoke:staging` or full manual checklist in staging; prod subset: config, auth, one product, operational alerts (admin).
- [ ] Document in ticket: smoke run ID / time / operator.

### 1.4 Operational alerts empty (or explained)

With **admin** JWT:

- [ ] `GET /api/admin/orders/operational-alerts` → `payment_integrity_holds`, `shipped_without_inventory_deduct`, `cancelled_still_reserved` arrays **empty** (or each row ticketed).
- [ ] `GET /api/admin/inventory/verify` → `ok: true` (or each issue ticketed).

### 1.5 Stripe

- [ ] **Live** webhook endpoint URL registered; events include at least `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`.
- [ ] Test **live-mode** micro-charge or Stripe test flow on **staging** already passed; prod: smallest real card test in maintenance window if policy allows.
- [ ] Dashboard: no unexpected failed webhook deliveries backlog.

### 1.6 Publish → sellable bridge

- [ ] At least one SKU published via **canonical** path; verified:
  - `catalogos.products.live_product_id` **NOT NULL**
  - `public.canonical_products.id` = catalog product UUID, `is_active`
  - `POST /api/cart` + checkout path resolves `canonical_product_id` (no `MISSING_CANONICAL_PRODUCT_ID`).

See [`PUBLISH_SELLABLE_PIPELINE.md`](./PUBLISH_SELLABLE_PIPELINE.md).

### 1.7 Admin permissions

- [ ] `usersService.isAdmin` / `app_admins` / `OWNER_EMAIL` matches real on-call.
- [ ] Non-admin users receive **403** on `PUT /api/admin/orders/:id`, inventory admin routes.

### 1.8 Backups and recovery

- [ ] Supabase **PITR** or scheduled backup enabled.
- [ ] Last restore test date documented (quarterly minimum).
- [ ] Runbook owner knows how to open Supabase SQL editor / support ticket path.

### 1.9 Launch go / no-go

**NO-GO** if any: unresolved payment integrity holds, shipped-without-deduct rows, published catalog masters missing `live_product_id` for SKUs sold on legacy checkout, inventory verify critical mass failures, Stripe webhooks unsigned or wrong URL.

---

## 2. Deploy-day runbook

### 2.1 Before deploy (T−60 to T−0)

| Step | Action | Acceptable result |
|------|--------|-------------------|
| 1 | Announce maintenance window if needed (email/chat). | Stakeholders aware. |
| 2 | Snapshot confirmation: Supabase backup recent. | Backup < 24h old or policy met. |
| 3 | Merge/release: tag matches **LAUNCH_SCOPE_LOCK** sign-off. | Tag recorded. |
| 4 | Run `node scripts/smoke-staging.mjs --reconcile-only` against **current prod** (pre-deploy). | Exit 0 or blockers ticketed. |
| 5 | Stripe: note current webhook version; no pending Dashboard changes. | Clean. |

### 2.2 During deploy

| Step | Action | Acceptable result |
|------|--------|-------------------|
| 1 | Deploy API (Express) + static assets per `DEPLOYMENT_GUIDE.md`. | Health endpoint or `/api/config` 200. |
| 2 | Deploy CatalogOS / storefront if in scope. | App builds; env vars set. |
| 3 | Run **new** DB migrations **before** or **with** deploy per your ordering. | Migrations succeed; no half-applied state. |
| 4 | Flip traffic / DNS if blue-green. | Only one active production API for webhooks. |

### 2.3 Immediately after deploy (T+0 to T+30m)

| Step | Action | Acceptable result |
|------|--------|-------------------|
| 1 | `curl -sS "$API/api/config"` | 200, `stripePublishableKey` present if card enabled. |
| 2 | `GET /api/admin/supabase/health` (if exposed) | `ok: true` or documented limitation. |
| 3 | Admin: `GET /api/admin/orders/operational-alerts` | Same as pre-launch (empty or known). |
| 4 | `node scripts/smoke-staging.mjs --all` with prod `API_BASE` + `SMOKE_ADMIN_JWT` (or admin login). | Exit 0. |
| 5 | Stripe Dashboard → Webhooks → recent delivery **200** for test event or first real event. | No 5xx spike. |
| 6 | Place **one** internal test order (card or Net 30) on prod or canary. | Order row correct; inventory timestamps consistent. |

### 2.4 First 24 hours

| Time | Action |
|------|--------|
| +1h | Re-run operational alerts + inventory verify. |
| +4h | Check Stripe webhook failure rate; scan logs for `stripe.critical_*` / `legacy_commerce_bridge_failed`. |
| +24h | Full `smoke-staging --reconcile-only`; review `pending_payment` age; confirm no growth in `sync_failed` publish rows. |

**Acceptable:** Transient 429/502 on edge; **not acceptable:** sustained webhook failures, new integrity holds, new shipped-without-deduct.

---

## 3. Incident playbook (operators)

Use Supabase SQL or admin APIs. **Ticket** every production change; prefer smallest fix.

### 3.1 `payment_integrity_hold = true`

**Symptom:** Order stuck unpaid; customer charged wrong amount vs `orders.total` or currency mismatch.

**Do:**

1. Open `orders.payment_integrity_notes` (JSON/text).
2. In Stripe: find PaymentIntent id from `stripe_payment_intent_id`; compare `amount_received` / currency to `orders.total` (cents = `round(total*100)`).
3. If Stripe wrong: refund/void in Stripe; set order to cancelled per policy **after** restock workflow if stock was affected (usually not yet deducted).
4. If DB wrong: **do not** silently edit totals without finance sign-off; document correction.
5. Clear hold only after reconciliation: update `payment_integrity_hold`, `payment_integrity_notes` with resolution reference.

**Escalate:** Engineering if webhook or pricing bug suspected.

---

### 3.2 Shipped without inventory deduct

**Symptom:** `orders.status = shipped` AND `inventory_deducted_at` IS NULL (reconciliation query).

**Do:**

1. Confirm whether deduct RPC failed after partial admin update (should be rare after deduct-before-status fix).
2. **Do not** re-ship; coordinate with engineering for **one-off** deduct or data repair.
3. Verify `stock_history` for deduct rows for this `order_id`.

**Launch blocker** until count returns to zero or rows are reconciled.

---

### 3.3 Cancelled but still reserved

**Symptom:** `cancelled` + `inventory_reserved_at` set + `inventory_released_at` NULL + `inventory_deducted_at` NULL.

**Do:**

1. Try admin transition to `cancelled` again **only if** guards allow; else call engineering to run `tryReleaseReservedStockForNonFulfillment` safely.
2. After release, verify `inventory_released_at` and reserved quantities on SKUs.

---

### 3.4 Publish succeeded but product not sellable

**Symptom:** Search shows product or staging says synced, but cart/checkout fails or `live_product_id` NULL.

**Do:**

1. Check `catalogos.products.live_product_id` and `public.products` row for SKU.
2. Check `search_publish_status` on normalized row (`published_synced` vs `sync_failed`).
3. Re-run canonical sync path: CatalogOS retry queue or `sync_canonical_products` per ops procedure—not ad-hoc partial inserts.
4. See [`PUBLISH_SELLABLE_PIPELINE.md`](./PUBLISH_SELLABLE_PIPELINE.md) **remaining bridge risks**.

---

### 3.5 Webhook failures (Stripe)

**Symptom:** Stripe Dashboard shows failed deliveries; orders stuck `pending_payment` after successful payment.

**Do:**

1. Confirm URL is **exact** production API + raw body route `/api/webhooks/stripe`.
2. Verify `STRIPE_WEBHOOK_SECRET` matches endpoint.
3. **Replay** failed events from Dashboard after fix.
4. Idempotency: replays should not double-email or corrupt state; if unsure, escalate.

---

### 3.6 Stale `pending_payment` orders

**Symptom:** Old unpaid card checkouts holding reservation.

**Do:**

1. `GET /api/admin/orders/stale?minutes=60` (admin).
2. `POST /api/admin/orders/cleanup-stale` with appropriate `minutes` after policy review (releases + `expired`).
3. Monitor inventory after batch cleanup.

---

## 4. Quick command reference

```bash
# Reconciliation (service role in .env)
npm run smoke:reconcile

# Reconciliation + API checks (set API_BASE, SMOKE_* )
npm run smoke:staging

# Full E2E (staging URL)
node scripts/e2e-test.js --url=https://staging.example.com
```

**Admin APIs (Bearer token):**

- `GET /api/admin/orders/operational-alerts`
- `GET /api/admin/inventory/verify`
- `GET /api/admin/orders/stale?minutes=60`

---

## 5. Related documents

| Doc | Use |
|-----|-----|
| [`LAUNCH_SCOPE_LOCK.md`](./LAUNCH_SCOPE_LOCK.md) | What is IN / CAUTION / OUT |
| [`SMOKE_TEST_E2E_CHECKLIST.md`](./SMOKE_TEST_E2E_CHECKLIST.md) | End-to-end smoke steps |
| [`PUBLISH_SELLABLE_PIPELINE.md`](./PUBLISH_SELLABLE_PIPELINE.md) | Publish + bridge + search |
| [`ADMIN_ORDER_INVENTORY_TRANSITIONS.md`](./ADMIN_ORDER_INVENTORY_TRANSITIONS.md) | Admin transition matrix |
| [`STRIPE_PAYMENT_FLOW.md`](./STRIPE_PAYMENT_FLOW.md) | Stripe flow |
| [`STRIPE_PAYMENT_REFUND_LIFECYCLE.md`](./STRIPE_PAYMENT_REFUND_LIFECYCLE.md) | Refund planning |
| [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md) | Host-specific deploy |
