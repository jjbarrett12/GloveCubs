# GLOVECUBS B2B Ecommerce — Production Readiness Audit

**Date:** March 2026  
**Auditor:** Senior Ecommerce & Engineering Audit  
**Verdict:** NOT READY FOR LAUNCH

---

## Area-by-Area Assessment

### 1. Catalog and Product Data — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Product CRUD | ✅ Ready | Full admin create/read/update/delete |
| Product schema | ✅ Ready | Complete attributes (material, sizes, etc.) |
| Category structure | ✅ Ready | Category/subcategory taxonomy |
| CSV import | ✅ Ready | Bulk product upload works |
| Image management | ⚠️ Partial | URL-based only, no direct upload |
| Out-of-stock display | ❌ Missing | `in_stock` flag exists but UI shows "Add to Cart" for all |
| Product search | ✅ Ready | Full-text search implemented |

### 2. Pricing and Margin Logic — READY

| Component | Status | Notes |
|-----------|--------|-------|
| Base/bulk pricing | ✅ Ready | `price` and `bulk_price` fields |
| Discount tiers | ✅ Ready | Bronze/Silver/Gold/Platinum |
| Per-company overrides | ✅ Ready | Company-level margin settings |
| Server-side calculation | ✅ Ready | Never trusts client prices |
| Cost tracking | ✅ Ready | `cost` field for margin calculation |

### 3. Cart Behavior — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Cart persistence | ✅ Ready | User-scoped carts via `user_{id}` |
| Add/remove items | ✅ Ready | Works correctly |
| Cart merge on login | ❌ Missing | Session cart lost on login |
| Cart expiration | ❌ Missing | Stale carts never expire |
| Stock check on add | ❌ Missing | Can add out-of-stock items |
| Price recalculation | ✅ Ready | Prices recalculated server-side at checkout |

### 4. Checkout Flow — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Cart validation | ✅ Ready | Validates products exist and are in stock |
| Inventory check | ✅ Ready | Calls `checkAvailability()` |
| Price calculation | ✅ Ready | Server-side only |
| Shipping address | ⚠️ Partial | Accepts address but no validation |
| Ship-to selection | ✅ Ready | Can select saved addresses |
| Order idempotency | ❌ Missing | No duplicate prevention |
| Atomic operations | ❌ Missing | Order+items not transactional |

### 5. Payments — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Credit card (Stripe) | ✅ Ready | PaymentIntent flow works |
| ACH payments | ✅ Ready | Stripe ACH works |
| Net 30 terms | ✅ Ready | For approved customers |
| Webhook success | ✅ Ready | `payment_intent.succeeded` handled |
| Webhook failure | ❌ Missing | `payment_intent.payment_failed` not handled |
| Refunds | ❌ Missing | No refund API integration |
| Payment retry | ❌ Missing | No way to retry failed payments |

### 6. Inventory Logic — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Stock tracking | ✅ Ready | `quantity_on_hand`, `quantity_reserved` |
| Reservation system | ✅ Ready | `reserveStockForOrder()` |
| Deduction on ship | ✅ Ready | `deductStockForOrder()` |
| Race condition protection | ❌ Missing | Check-then-reserve not atomic |
| Orphan reservation cleanup | ❌ Missing | No expiry for failed orders |
| Stock release on cancel | ❌ Missing | Manual process only |
| Low stock alerts | ⚠️ Partial | Reorder suggestions exist, no notifications |

### 7. Orders and Fulfillment — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Order creation | ✅ Ready | Works for all payment types |
| Order status updates | ✅ Ready | Admin can update status |
| Status triggers fulfillment | ✅ Ready | "shipped" triggers deduction |
| Tracking number entry | ✅ Ready | Admin can add tracking |
| Order cancellation | ⚠️ Partial | Can set status, no stock release |
| Order editing | ❌ Missing | Cannot modify order items |
| Refund workflow | ❌ Missing | No Stripe refund integration |
| Partial shipments | ❌ Missing | All-or-nothing only |

### 8. Customer Portal — READY

| Component | Status | Notes |
|-----------|--------|-------|
| Order history | ✅ Ready | With pagination and filters |
| Order detail view | ✅ Ready | Full line items |
| Reorder | ✅ Ready | Adds items to cart |
| Invoice view/print | ✅ Ready | Modal with print |
| Invoice download | ✅ Ready | HTML download |
| Ship-to management | ✅ Ready | Full CRUD |
| Tracking view | ✅ Ready | Shows tracking info |
| Favorites/wishlist | ✅ Ready | Just implemented |
| Account details | ✅ Ready | View company info |

### 9. Admin Operations — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| View all orders | ✅ Ready | With user/company info |
| Update order status | ✅ Ready | Status + tracking |
| Cancel orders | ⚠️ Partial | Status only, no stock release |
| Refund orders | ❌ Missing | Must use Stripe dashboard |
| Edit orders | ❌ Missing | Cannot change items |
| User approval | ✅ Ready | Approve for B2B pricing |
| User management | ⚠️ Partial | Cannot delete or fully edit |
| Product management | ✅ Ready | Full CRUD + bulk import |
| Inventory management | ✅ Ready | Adjust, cycle count, history |
| Purchase orders | ✅ Ready | Create, send, receive |

### 10. Email Notifications — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Email infrastructure | ✅ Ready | Nodemailer SMTP |
| Order confirmation | ✅ Ready | Sent on Net30 order |
| Payment confirmation | ❌ Missing | Card/ACH webhook has no email |
| Shipping notification | ❌ Missing | Promised but not sent |
| Password reset | ✅ Ready | Works |
| RFQ confirmation | ✅ Ready | Works |
| Account approval | ❌ Missing | No notification when approved |
| Contact form | ✅ Ready | Works |

### 11. Shipping and Addresses — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Ship-to CRUD | ✅ Ready | Create, edit, delete, default |
| Company-scoped | ✅ Ready | Shared across company users |
| Address validation | ❌ Missing | No USPS/API verification |
| Shipping rates | ❌ Missing | Flat $15 or free over threshold |
| Carrier integration | ❌ Missing | Manual tracking entry only |
| Label generation | ❌ Missing | Not integrated |

### 12. Security and Abuse Prevention — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Authentication | ✅ Ready | JWT + bcrypt |
| Authorization | ✅ Ready | Company-scoped access |
| Rate limiting | ✅ Ready | API, auth, AI endpoints |
| Input sanitization | ⚠️ Partial | Basic escaping only |
| CSRF protection | ❌ Missing | No CSRF tokens |
| Helmet/security headers | ❌ Missing | No helmet.js |
| SQL injection | ✅ Ready | Supabase parameterized |
| Admin route protection | ✅ Ready | `requireAdmin` middleware |

### 13. Reliability and Edge Cases — PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Error handling | ✅ Ready | Try/catch on all routes |
| Logging | ⚠️ Partial | Console.error only |
| Webhook idempotency | ❌ Missing | Same webhook can process twice |
| Stale data cleanup | ❌ Missing | No cleanup jobs |
| Payment timeout handling | ❌ Missing | Orders stuck in pending_payment |
| Retry logic | ❌ Missing | No automatic retries |

---

## A. Top 10 Launch Blockers

| # | Issue | Impact | File/Route |
|---|-------|--------|------------|
| 1 | **No payment failure webhook** | Orders stay pending forever, stock locked | `server.js:99-110` |
| 2 | **Race condition in inventory** | Overselling on concurrent checkout | `lib/inventory.js:73-106` |
| 3 | **No orphan reservation cleanup** | Stock permanently reserved | No cleanup job exists |
| 4 | **Missing shipping notification email** | Customers not notified | `server.js:3199` |
| 5 | **Missing payment confirmation email** | No receipt for card/ACH | `server.js:99-110` |
| 6 | **No out-of-stock UI prevention** | Users add unavailable items | `public/js/app.js` product cards |
| 7 | **Order cancellation doesn't release stock** | Manual DB fix required | `server.js` admin routes |
| 8 | **No order idempotency** | Double-orders possible | `server.js:2087, 2210` |
| 9 | **Webhook success handling swallows errors** | Payment succeeds but order not updated | `server.js:107` |
| 10 | **No refund capability** | Must use Stripe dashboard | No endpoint exists |

---

## B. Top 10 Non-Blocking Improvements

| # | Improvement | Benefit |
|---|-------------|---------|
| 1 | Cart merge on login | Better UX for returning users |
| 2 | Cart expiration (30 days) | Database hygiene |
| 3 | Address validation API | Reduce shipping errors |
| 4 | Security headers (helmet.js) | Security hardening |
| 5 | Order editing capability | Fix customer mistakes |
| 6 | User deletion | Clean up test data |
| 7 | Structured logging (Winston) | Better debugging |
| 8 | Account approval email | Customer awareness |
| 9 | Direct image upload | Simpler product management |
| 10 | Partial shipment support | Better fulfillment flexibility |

---

## C. Files/Routes/Services Involved

### Critical Files to Fix

| File | Changes Needed |
|------|----------------|
| `server.js` | Add `payment_intent.payment_failed` handler; fix webhook error handling; add idempotency keys; add shipping email |
| `lib/inventory.js` | Add atomic reservation with `SELECT FOR UPDATE` or optimistic locking |
| `services/dataService.js` | Wrap order+items in transaction |
| `public/js/app.js` | Add stock check before "Add to Cart"; disable button for out-of-stock |
| `lib/email.js` | Add payment confirmation and shipping templates |

### New Files Needed

| File | Purpose |
|------|---------|
| `jobs/cleanup-stale-orders.js` | Cron job to cancel pending_payment orders > 1hr, release stock |
| `lib/refunds.js` | Stripe refund integration |

### Routes to Modify

| Route | Change |
|-------|--------|
| `POST /api/webhooks/stripe` | Handle failure events; don't swallow errors |
| `PUT /api/admin/orders/:id` | Release stock on cancellation |
| `POST /api/orders` | Add idempotency check |
| `POST /api/orders/create-payment-intent` | Add idempotency check |

---

## D. Can This Launch for Real Customers Today?

# NO

**Critical gaps:**
1. Customers will not receive payment confirmation emails
2. Customers will not receive shipping notifications
3. Failed payments leave orders and stock in limbo forever
4. Two users checking out simultaneously can oversell inventory
5. No way to refund customers
6. Webhook errors are silently ignored

---

## E. Shortest Path to Launch in 14 Days

### Week 1: Fix Checkout & Payment Flow

**Day 1-2: Payment Webhooks**
- [ ] Add `payment_intent.payment_failed` handler → cancel order, release stock
- [ ] Fix success handler to return 500 on DB error (so Stripe retries)
- [ ] Add payment confirmation email in success handler

**Day 3-4: Inventory Race Condition**
- [ ] Wrap `reserveStockForOrder()` in Supabase transaction
- [ ] Use `SELECT ... FOR UPDATE` or atomic UPDATE with WHERE check
- [ ] Test with concurrent requests

**Day 5: Cleanup Job**
- [ ] Create `jobs/cleanup-stale-orders.js`
- [ ] Find orders in `pending_payment` > 1 hour
- [ ] Cancel them, release stock, optionally notify customer
- [ ] Set up cron or Supabase scheduled function

**Day 6-7: Order Cancellation**
- [ ] Add stock release to admin cancel flow
- [ ] Add idempotency key support (check for recent duplicate orders)

### Week 2: Notifications & Polish

**Day 8-9: Missing Emails**
- [ ] Add shipping notification email when status → "shipped"
- [ ] Add account approval notification email
- [ ] Test all email flows

**Day 10: Frontend Stock Check**
- [ ] Disable "Add to Cart" for out-of-stock products
- [ ] Show "Out of Stock" badge on product cards
- [ ] Optionally check live inventory on product detail page

**Day 11-12: Refunds**
- [ ] Add `POST /api/admin/orders/:id/refund` endpoint
- [ ] Integrate Stripe refund API
- [ ] Update order status to "refunded"

**Day 13: Testing**
- [ ] End-to-end checkout with all payment types
- [ ] Test concurrent checkout (race condition)
- [ ] Test payment failure scenarios
- [ ] Test refund flow
- [ ] Verify all emails send

**Day 14: Security & Deploy**
- [ ] Add helmet.js security headers
- [ ] Review rate limits
- [ ] Production environment check
- [ ] Deploy

---

## Summary

| Category | Status |
|----------|--------|
| Catalog & Products | PARTIAL |
| Pricing | READY |
| Cart | PARTIAL |
| Checkout | PARTIAL |
| Payments | PARTIAL |
| Inventory | PARTIAL |
| Orders | PARTIAL |
| Customer Portal | READY |
| Admin | PARTIAL |
| Email | PARTIAL |
| Shipping | PARTIAL |
| Security | PARTIAL |
| Reliability | PARTIAL |

**Overall Verdict:** 8 of 13 areas are PARTIAL. The system has good foundations but critical gaps in the payment/fulfillment lifecycle would cause immediate customer support issues and potential financial loss.

**Confidence after 14-day fixes:** Can launch for limited pilot with close monitoring.
