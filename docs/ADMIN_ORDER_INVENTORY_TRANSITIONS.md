# Admin order & inventory guardrails

This document matches server enforcement in `lib/adminOrderGuards.js`, `PUT /api/admin/orders/:id`, inventory admin routes, and `POST /api/admin/orders/:id/create-po`.

## Admin order mutation surface (audited)

| Route | Effect |
|--------|--------|
| `PUT /api/admin/orders/:id` | Tracking, status; release on abandon statuses; deduct-then-set shipped |
| `POST /api/admin/orders/cleanup-stale` | `pending_payment` → `expired` + release (existing) |
| `POST /api/admin/orders/:id/create-po` | Creates PO from order (now gated on payment) |

Customer checkout and Stripe webhooks are unchanged; they are not admin mutations.

## Operational visibility (API)

| Need | Endpoint / query |
|------|------------------|
| Payment integrity holds | `GET /api/admin/orders?payment_integrity_hold=true` |
| Filter by status | `GET /api/admin/orders?status=pending_payment` (etc.) |
| Bundled anomaly lists | `GET /api/admin/orders/operational-alerts?limit=80` |
| Stale `pending_payment` | `GET /api/admin/orders/stale?minutes=60` |

`operational-alerts` returns:

- `payment_integrity_holds`
- `shipped_without_inventory_deduct`
- `cancelled_still_reserved`
- `pending_payment_stale_over_1h`

## Admin order status transition matrix

Legend: **Abandon** = `cancelled` \| `payment_failed` \| `expired`.  
**Online pay** = `payment_method` is `credit_card` or `ach`, or `stripe_payment_intent_id` is set.  
**Shippable-from** = `pending`, `processing`, `invoiced`.

| Current | Target | Allowed? | Preconditions | Side effects (automatic) |
|---------|--------|----------|---------------|---------------------------|
| any | same as current | yes | — | none |
| any | not in admin whitelist | no | — | — |
| any | `pending_payment` | no | — | — |
| `shipped` | `pending` / `processing` / `cancelled` / … | no | — | — |
| `shipped` | `delivered` / `completed` | yes | — | none (no second deduct) |
| any | abandon status | yes* | *no* if `inventory_deducted_at` set | release reserved stock (existing RPC) before status update |
| `pending_payment` | `shipped` / `pending` / `processing` / … | no | — | — |
| `pending_payment` | abandon | yes | — | release if reserved |
| `pending` / `processing` / `invoiced` | `shipped` | yes | `payment_integrity_hold` false; not `pending_payment`; if online pay then `payment_confirmed_at` set | **deduct** inventory **before** row updated to `shipped`; then email |
| `payment_failed` / `cancelled` / `expired` | `shipped` | no | — | — |
| any with `payment_integrity_hold` | `shipped` | no | — | — |
| online pay, `pending`, no `payment_confirmed_at` | `shipped` | no | — | — |
| `pending` (Net 30, no Stripe) | `shipped` | yes | hold false | deduct then status |

## Inventory admin paths (audited)

| Route | Guardrails added / behavior |
|-------|-----------------------------|
| `PUT /api/admin/inventory/:product_id` | Requires resolvable `canonical_product_id` when writing the row; `quantity_on_hand` changes go through `adjustStock` (writes `stock_history`); rejects `on_hand < reserved` |
| `POST /api/admin/inventory/adjust` | Requires product `canonical_product_id`; passes `req.user.id` into `adjustStock` |
| `POST /api/admin/inventory/cycle` | Skips rows without valid canonical; uses `adjustStock` for deltas; rejects count below reserved; returns `updated_product_ids`, `skipped`, `errors` |
| `POST /api/fishbowl/sync-inventory` | **Unchanged** — still bulk `upsertInventory` without per-change `stock_history` (see risks below) |

## Dangerous or fragile actions (known)

1. **Fishbowl sync** — Overwrites `quantity_on_hand` without an `adjust`-style `stock_history` row per product; acceptable for external source of truth only if ops understand the audit gap.
2. **Direct SQL / Supabase dashboard** — Bypasses all guards.
3. **`updateOrderStatus` from jobs** — Stale cleanup uses `expired` + release; does not ship; OK.
4. **Legacy orders** — Very old rows may lack `payment_confirmed_at` even for paid card orders; shipping may be blocked until data is repaired or payment fields align.

## Manual tests (blocked transitions)

1. **Ship with payment integrity hold** — Set `payment_integrity_hold = true` on a fulfillable order; `PUT` status `shipped` → **409** `PAYMENT_INTEGRITY_HOLD`.
2. **Ship unpaid card order** — Order in `pending_payment` with Stripe PI; `PUT` `shipped` → **409** `SHIP_REQUIRES_PAYMENT` or `PENDING_PAYMENT_FULFILLMENT_BLOCKED`.
3. **Ship without `payment_confirmed_at` (Stripe path)** — Order `pending`, has `stripe_payment_intent_id`, null `payment_confirmed_at`; `PUT` `shipped` → **409** `SHIP_REQUIRES_PAYMENT_CONFIRMATION`.
4. **Cancel after deduct** — Order with `inventory_deducted_at` set; `PUT` status `cancelled` → **409** `POST_DEDUCT_ABANDON_BLOCKED`.
5. **Regress shipped** — `PUT` status from `shipped` to `pending` → **409** `CANNOT_REGRESS_SHIPPED`.
6. **Create PO on hold / unpaid** — `POST .../create-po` on held or `pending_payment` order → **409** with `PAYMENT_INTEGRITY_HOLD` / `ORDER_AWAITING_PAYMENT`.
7. **Inventory PUT below reserved** — Set reserved > 0; `PUT` `quantity_on_hand` less than reserved → **400** `ON_HAND_BELOW_RESERVED`.
8. **Adjust / cycle without canonical** — Product with no `canonical_product_id`; `POST /adjust` or cycle row → **422** / skipped with `missing_canonical_product_id`.
