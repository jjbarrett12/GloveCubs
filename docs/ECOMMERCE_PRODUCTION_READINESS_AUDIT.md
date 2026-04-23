# GloveCubs Ecommerce Production Readiness Audit

**Date:** 2025-03-02  
**Evaluator:** Senior Ecommerce Architect  
**Scope:** B2B ecommerce platform for bulk gloves and safety supplies

---

## EXECUTIVE SUMMARY

**Production Readiness Score: 4.5 / 10**

The platform has core ecommerce flows (catalog, cart, checkout, orders, payments) but contains **critical gaps** that make it unsuitable for real customer transactions:

1. **Overselling** — No inventory deduction; stock check uses boolean only; race conditions possible  
2. **Pricing inconsistency** — Cart shows cost-based prices; checkout charges list+discount; customers can be overcharged or undercharged  
3. **Shipping address** — No validation; orders can ship to empty/invalid addresses  
4. **Payment confirmation** — Card/ACH customers do not receive order confirmation emails  
5. **Shipping notification** — No email when order ships or tracking is added  

**Verdict:** Do not launch to paying customers until P0 items are addressed.

---

## SYSTEM AUDIT TABLE

| System | Status | Missing Features |
|--------|--------|------------------|
| **1. Product Catalog** | Partially Implemented | Categories/filters OK; cost-based pricing only in cart enrichment, not product API by default |
| **2. Pricing** | Partially Implemented | Cart uses cost-based pricing; checkout uses list+discount; **critical mismatch** |
| **3. Inventory Management** | Partially Implemented | Table and Fishbowl sync exist; **no deduction on order**; **no quantity check**; race conditions |
| **4. Cart and Checkout** | Partially Implemented | Cart storage OK; no cart merge on login; no cart expiration; checkout lacks validation |
| **5. Orders** | Partially Implemented | Create/read OK; order state naming odd (`pending` = paid); no refund/cancel flow |
| **6. Customer Accounts** | Complete | JWT auth, company scoping, login, password reset |
| **7. Shipping and Fulfillment** | Partially Implemented | Ship-to addresses OK; flat shipping ($25/free $500+); **no address validation** |
| **8. Payments** | Partially Implemented | Stripe PaymentIntent OK; webhook no idempotency; no confirmation email for card/ACH |
| **9. Admin Operations** | Partially Implemented | Order list, status/tracking update; no shipping notification on status change |
| **10. Customer Portal** | Complete | Order history, tier progress, budget, saved lists, ship-to |
| **11. Email Notifications** | Partially Implemented | Net 30 confirmation OK; card/ACH **no confirmation**; **no shipping email** |
| **12. Security and Fraud** | Partially Implemented | Auth, tenant isolation OK; rate limits; no RLS; no fraud scoring |

---

## PRIORITIZED ROADMAP

### CRITICAL BEFORE LAUNCH (P0)

| # | Item | Implementation |
|---|------|----------------|
| 1 | **Inventory deduction** | On order creation (Net 30) or on `payment_intent.succeeded` (card/ACH): decrement `quantity_on_hand` per `order_items`; use atomic UPDATE with `WHERE quantity_on_hand >= quantity` |
| 2 | **Quantity-based stock check** | Replace `!product.in_stock` with `(inv?.quantity_on_hand ?? product.in_stock ? 999 : 0) >= item.quantity`; aggregate by product_id for multi-line |
| 3 | **Pricing consistency** | Use same pricing source for cart GET and checkout: either both cost-based (`getEffectiveMargin`/`computeSellPrice`) or both list+tier; unify in `server.js` |
| 4 | **Shipping address validation** | Reject order if `finalShippingAddress` empty/invalid; require address, city, state, zip when not using `ship_to_id`; basic US format (5/9-digit ZIP, valid state) |
| 5 | **Order confirmation for card/ACH** | Send confirmation email in Stripe webhook when `payment_intent.succeeded` and status → `pending`; include order summary and shipping address |

### HIGH PRIORITY (P1)

| # | Item | Implementation |
|---|------|----------------|
| 6 | **Shipping notification** | On `PUT /api/admin/orders/:id` when status becomes `shipped` or tracking added: send email to customer with tracking link |
| 7 | **Stripe webhook idempotency** | Store `stripe_events(id, event_id)`; skip if `event_id` seen; return 200 quickly |
| 8 | **Oversell prevention (atomic)** | Use `UPDATE inventory SET quantity_on_hand = quantity_on_hand - :qty WHERE product_id = :id AND quantity_on_hand >= :qty RETURNING id`; rollback order if any product insufficient |
| 9 | **Webhook await** | `await` order status update in webhook handler; log failures; consider retry queue |

### POST LAUNCH (P2)

| # | Item | Implementation |
|---|------|----------------|
| 10 | Cart merge on login | When user logs in, merge `session_*` cart into `user_*` cart |
| 11 | Cart expiration | Add `updated_at`; cron/job to delete carts older than 30 days |
| 12 | RLS on core tables | Add Supabase RLS for `orders`, `order_items`, `carts`, `inventory` |
| 13 | Order cancellation/refund | Admin cancel; Stripe refund; update order status; restore inventory |
| 14 | Tax calculation | Replace 8% hardcode with tax service (Avalara, TaxJar) for multi-state |

---

## CODE AREAS TO IMPLEMENT NEXT

1. **`server.js` POST /api/orders** — Add shipping address validation; use cost-based pricing when `companyId` present; add inventory deduction (or defer to webhook for card path)  
2. **`server.js` POST /api/orders/create-payment-intent** — Same pricing + validation; consider moving order create to after PaymentIntent confirm (or keep as-is and deduct in webhook)  
3. **`server.js` webhook** — Add `stripe_events` idempotency; send order confirmation email on success; add inventory deduction  
4. **`services/dataService.js`** — Add `deductInventoryForOrder(orderId)` with atomic per-product updates; `restoreInventoryForOrder(orderId)` for refunds  
5. **`server.js` PUT /api/admin/orders/:id** — On status `shipped` or tracking set: send `sendMail` to customer  
6. **`lib/pricing.js`** — Already correct; ensure checkout uses it via a shared `computeOrderTotals(cartItems, user, ctx)` helper  
7. **New migration** — `stripe_events(event_id UNIQUE)` for idempotency  

---

## CRITICAL BUGS & ARCHITECTURAL RISKS

### 1. Cart vs Checkout Pricing Mismatch (Revenue/Legal Risk)

- **Cart** (`GET /api/cart`): Uses `getEffectiveMargin` + `computeSellPrice` when `companyId` set  
- **Checkout** (`POST /api/orders`, `create-payment-intent`): Uses `product.bulk_price` or `product.price` + tier discount  
- **Impact:** Customers with company pricing see one price in cart, charged differently at checkout. Overcharge = legal; undercharge = margin loss  

### 2. No Inventory Deduction (Overselling)

- `quantity_on_hand` is never decremented on order create  
- **Impact:** Unlimited orders regardless of stock; fulfillment impossible  

### 3. Boolean-Only Stock Check (Overselling)

- Checkout checks `product.in_stock` (0/1) only  
- **Impact:** User orders 1000, stock is 5; check passes; order created  

### 4. Race Condition (Overselling)

- Two users checkout last unit simultaneously; both pass `in_stock`; both get orders  
- **Fix:** Atomic `quantity_on_hand - qty WHERE quantity_on_hand >= qty`  

### 5. No Order Confirmation for Card/ACH

- Net 30 sends email on create; card/ACH does not  
- **Impact:** Customer pays, gets no confirmation; support burden; perceived fraud  

### 6. PaymentIntent Before Order (Orphan PI)

- PI created, then order inserted; if insert fails, PI exists without order  
- **Mitigation:** Update PI metadata with order_id after insert (done); add order_id to PI early would require two-step flow  

### 7. Webhook Fire-and-Forget

- `dataService.updateOrderStatus(...).catch(...)` — not awaited  
- **Impact:** Webhook returns 200 before DB update; Stripe won't retry; order may stay `pending_payment`  

### 8. Shipping Address Unvalidated

- `finalShippingAddress` can be `undefined` or invalid when `ship_to_id` missing and `shipping_address` bad  
- **Impact:** Orders ship to wrong/empty addresses; chargebacks; wasted freight  

### 9. No Cart Expiration

- Carts persist indefinitely  
- **Impact:** Stale carts; potential pricing drift; DB bloat  

### 10. Order State Semantics

- `pending` = paid (Net 30) or post-webhook (card/ACH); `pending_payment` = awaiting Stripe  
- **Recommendation:** Rename to `confirmed`/`awaiting_payment` for clarity  

---

## SCHEMA COMPLETENESS

| Table | Ecommerce Needs | Status |
|-------|-----------------|--------|
| `orders` | status, payment_method, shipping_address, stripe_payment_intent_id, tracking | OK |
| `order_items` | product_id, quantity, unit_price | OK |
| `inventory` | quantity_on_hand, reorder_point | OK; missing reserved/allocated |
| `carts` | cart_key, items, updated_at | OK; no TTL |
| `products` | cost, price, bulk_price, in_stock, manufacturer_id | OK |
| `customer_manufacturer_pricing` | company_id, manufacturer_id, margin | OK |

**Missing:** `stripe_events(event_id)` for webhook idempotency; optional `order_status_history` for audit.

---

## STRIPE WEBHOOK HANDLING

| Aspect | Current | Required |
|--------|---------|----------|
| Signature verification | Yes | Keep |
| Idempotency | No | Store event.id; skip if seen |
| Await DB update | No | Await `updateOrderStatus` |
| Email on success | No | Send confirmation |
| Inventory deduction | No | Deduct on payment_intent.succeeded |
| Error handling | Log only | Return 500 on failure so Stripe retries |

---

## CART EXPIRATION

- **Current:** None  
- **Recommendation:** `updated_at` exists; add scheduled job or Supabase cron to `DELETE FROM carts WHERE updated_at < NOW() - INTERVAL '30 days'`  

---

## PRICING CALCULATION CORRECTNESS

- **Cost-based formula:** `sell = cost / (1 - margin/100)` — correct  
- **Tier discount:** `price * (1 - pct/100)` — correct  
- **Bug:** Checkout never calls `getEffectiveMargin`/`computeSellPrice`; only cart does  

---

## FINAL VERDICT

| Criteria | Ready? |
|----------|--------|
| Checkout reliability | No — pricing mismatch, no inventory |
| Order state management | Partial — works but naming confusing |
| Payment confirmation | No — missing for card/ACH |
| Inventory deduction | No |
| Overselling prevention | No |
| Shipping address validation | No |
| Admin order tools | Partial — no shipping email |
| Customer order history | Yes |

**Recommendation:** Address all P0 items before accepting real payments. P1 items within first 2 weeks post-launch.
