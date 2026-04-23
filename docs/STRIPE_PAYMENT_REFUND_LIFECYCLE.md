# Stripe refund, void, and inventory lifecycle (planning)

This document defines **intended** behavior for refunds and voids after payment integrity hardening. Implementation may be incremental; ops should follow these rules when building admin tools and webhook handlers.

## Baseline (current model)

- Card/ACH orders start as `pending_payment` with **stock reserved** (not deducted).
- On `payment_intent.succeeded`, when amount/currency match `orders.total`, status moves to **`pending`** (paid/processing); **reservation stays** until shipment deducts stock.
- **`payment_integrity_hold`** means the webhook saw a mismatch: do not treat the order as paid until ops reconcile Stripe and the order row.

## Payment void / cancel before shipment

**Definition:** The charge never settles or the PaymentIntent is canceled before fulfillment (e.g. `payment_intent.canceled`, voided auth, or dispute won as void—exact Stripe object depends on flow).

**Target behavior:**

1. Order should **not** remain in a “paid” path: status → `cancelled` or a dedicated `voided` if you add one; align with existing cancel flow.
2. **Release reserved inventory** if still reserved and not deducted (same guards as payment failure/cancel today).
3. Clear or annotate `stripe_payment_intent_id` only if you have a strict replacement flow; otherwise keep it for audit and create a new PI for re-checkout.
4. Log and notify customer if the order was visible as placed.

## Full refund after payment, before shipment

**Definition:** Customer paid; order is `pending` (or equivalent paid state) but nothing shipped.

**Target behavior:**

1. **Money:** Full Stripe refund; store refund id and timestamp on the order (future column or ledger).
2. **Order:** Status → `refunded` or `cancelled` with `refund_full_at` (naming TBD); do not leave the order in a shippable queue without manual review.
3. **Inventory:** **Release reservation** (stock was never deducted). If you already deducted on “paid” in some alternate flow, restore on_hand instead—today deduction is on ship, so release is correct.
4. **Idempotency:** Webhook handlers for `charge.refunded` / `refund.*` must be idempotent so retries do not double-release.

## Full refund after shipment

**Definition:** Order was shipped (stock deducted).

**Target behavior:**

1. **Money:** Full refund per policy (may include restocking fees—business rule).
2. **Inventory:** **Do not** automatically put stock back unless you run a formal return/RMA flow; optional `restock` flag on refund handling.
3. **Order:** Status → `refunded` or keep `shipped` with refund flags; finance and ops need a single source of truth.

## Partial refund

**Definition:** Refund amount is less than the original charge (goodwill, single line adjustment, tax correction, etc.).

**Target behavior:**

1. **Money:** Stripe partial refund; persist amount and reason.
2. **Order:** Keep fulfillment status unless the partial refund **voids** the remainder of the sale (business rule). If the order remains valid to ship, status stays; if not, move to a terminal “partially_refunded / closed” state.
3. **Integrity:** Partial refunds **do not** satisfy `amount_received === order.total` on the original `payment_intent.succeeded` event—that check is only for the success transition. Future work: listen to refund webhooks and maintain `net_paid_cents` vs `order.total` for ongoing reconciliation alerts.
4. **Inventory:** Only adjust stock when tied to explicit line cancellations or returns.

## Operational notes

- **`payment_integrity_hold`:** Resolve by comparing Stripe Dashboard charge/PI to `orders.total` and `stripe_payment_intent_id`; either fix data with extreme care or refund/void in Stripe and cancel the order.
- **One PI ↔ one order:** Enforced by partial unique index on `orders.stripe_payment_intent_id`; never attach the same PI to a second order.
