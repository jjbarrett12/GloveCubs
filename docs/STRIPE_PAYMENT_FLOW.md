# GLOVECUBS Stripe Payment Flow

## Payment Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CUSTOMER CHECKOUT FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌─────────────┐
│   Cart   │───▶│ Checkout │───▶│  Payment     │───▶│  Confirm    │
│   Page   │    │   Page   │    │  Selection   │    │  Payment    │
└──────────┘    └──────────┘    └──────────────┘    └──────────────┘
                                       │                    │
                                       ▼                    ▼
                               ┌──────────────┐    ┌──────────────┐
                               │   Net 30     │    │ Card / ACH   │
                               │   (Approved) │    │              │
                               └──────────────┘    └──────────────┘
                                       │                    │
                                       ▼                    ▼
                               ┌──────────────┐    ┌──────────────────┐
                               │ POST /orders │    │ POST /orders/    │
                               │   (Net 30)   │    │ create-payment-  │
                               └──────────────┘    │     intent       │
                                       │           └──────────────────┘
                                       │                    │
                                       ▼                    ▼
                               ┌──────────────┐    ┌──────────────────┐
                               │   Order      │    │  PaymentIntent   │
                               │   Created    │    │    Created       │
                               │   (pending)  │    │  (pending_payment)│
                               └──────────────┘    └──────────────────┘
                                                           │
                                                           ▼
                                                   ┌──────────────────┐
                                                   │  Stripe.js       │
                                                   │  Payment Form    │
                                                   └──────────────────┘
                                                           │
                                         ┌─────────────────┼─────────────────┐
                                         ▼                 ▼                 ▼
                                   ┌──────────┐     ┌──────────┐     ┌──────────┐
                                   │ Success  │     │  Failed  │     │ Canceled │
                                   └──────────┘     └──────────┘     └──────────┘
                                         │                 │                 │
                                         ▼                 ▼                 ▼
                                   ┌──────────┐     ┌──────────┐     ┌──────────┐
                                   │ Webhook  │     │ Webhook  │     │ Webhook  │
                                   │ Received │     │ Received │     │ Received │
                                   └──────────┘     └──────────┘     └──────────┘
                                         │                 │                 │
                                         ▼                 ▼                 ▼
                                   ┌──────────┐     ┌──────────┐     ┌──────────┐
                                   │  Order   │     │  Release │     │  Release │
                                   │ → pending│     │  Stock   │     │  Stock   │
                                   └──────────┘     └──────────┘     └──────────┘
                                         │                 │                 │
                                         ▼                 ▼                 ▼
                                   ┌──────────┐     ┌──────────┐     ┌──────────┐
                                   │  Send    │     │  Order   │     │  Order   │
                                   │  Email   │     │ →failed  │     │→cancelled│
                                   └──────────┘     └──────────┘     └──────────┘
```

## Timeline

| Step | Event | Database Change | Inventory Change | Stripe State |
|------|-------|-----------------|------------------|--------------|
| 1 | Customer clicks "Place Order" | - | - | - |
| 2 | `POST /api/orders/create-payment-intent` | Order created (`pending_payment`) | Stock reserved | PaymentIntent created |
| 3 | Customer enters card | - | - | - |
| 4 | Customer clicks "Pay now" | - | - | PaymentIntent processing |
| 5a | **Payment succeeds** | Order → `pending` | Stock remains reserved | `succeeded` |
| 5b | **Payment fails** | Order → `payment_failed` | Stock released | `payment_failed` |
| 5c | **User abandons** | Order → `cancelled` | Stock released | `canceled` |
| 6 | Admin ships order | Order → `shipped` | Stock deducted | - |

## Order Status Flow

```
                                   ┌─────────────┐
                                   │   Cart      │
                                   └──────┬──────┘
                                          │ checkout
                                          ▼
                              ┌───────────────────────┐
                              │    pending_payment    │
                              │  (stock reserved)     │
                              └───────────┬───────────┘
                       ┌──────────────────┼──────────────────┐
                       │                  │                  │
                       ▼                  ▼                  ▼
               ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
               │    pending    │  │ payment_failed│  │   cancelled   │
               │ (stock held)  │  │(stock released)│ │(stock released)│
               └───────┬───────┘  └───────────────┘  └───────────────┘
                       │
                       ▼
               ┌───────────────┐
               │    shipped    │
               │(stock deducted)│
               └───────┬───────┘
                       │
                       ▼
               ┌───────────────┐
               │   delivered   │
               └───────────────┘
```

## API Endpoints

### Create PaymentIntent

```
POST /api/orders/create-payment-intent
Authorization: Bearer <token>
Content-Type: application/json

{
  "shipping_address": "123 Main St, City, ST 12345",
  "payment_method": "credit_card",  // or "ach"
  "ship_to_id": 123,  // optional: saved address ID
  "notes": "Leave at door"
}

Response:
{
  "success": true,
  "client_secret": "pi_xxx_secret_yyy",
  "order_id": 456,
  "order_number": "GC-XXXXX",
  "total": 125.50
}
```

### Webhook

```
POST /api/webhooks/stripe
Content-Type: application/json
stripe-signature: t=...,v1=...,v0=...

(raw Stripe event body)

Response: 200 OK (or 500 to retry)
```

## Idempotency Protections

### Duplicate Order Prevention (Frontend)

1. When user clicks checkout, check for existing `pending_payment` order (within 10 min)
2. If found and PaymentIntent still valid, return existing order
3. User continues payment on same order

### Webhook Idempotency

1. Every webhook event has unique `event.id` (e.g., `evt_xxx`)
2. On receive, check if `event.id` already processed
3. If duplicate, skip processing and return 200
4. After processing, store `event.id` in `stripe_webhook_events` table

### Status-Based Idempotency

1. Webhook only processes if order is in expected state
2. `payment_intent.succeeded` only works if `status = 'pending_payment'`
3. Prevents double-processing if webhook retried

## Stock Reservation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     INVENTORY TRACKING                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  quantity_on_hand = 100                                        │
│  quantity_reserved = 0                                         │
│  available = 100                                                │
│                                                                 │
│  ─────── Order Created (qty: 10) ───────                        │
│                                                                 │
│  quantity_on_hand = 100                                        │
│  quantity_reserved = 10    ← reserved                          │
│  available = 90                                                 │
│                                                                 │
│  ─────── Payment Succeeded ───────                              │
│                                                                 │
│  (no change - stock still reserved)                            │
│                                                                 │
│  ─────── Order Shipped ───────                                  │
│                                                                 │
│  quantity_on_hand = 90     ← deducted                          │
│  quantity_reserved = 0     ← released                          │
│  available = 90                                                 │
│                                                                 │
│  ─────── Payment Failed (alternative path) ───────              │
│                                                                 │
│  quantity_on_hand = 100    (unchanged)                         │
│  quantity_reserved = 0     ← released                          │
│  available = 100           (back to original)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Stripe Configuration Requirements

### Environment Variables

```bash
# Required for Stripe payments
STRIPE_SECRET_KEY=sk_test_...          # or sk_live_... for production
STRIPE_PUBLISHABLE_KEY=pk_test_...     # or pk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_...        # from Stripe Dashboard
```

### Stripe Dashboard Configuration

1. **Webhook Endpoint**
   - URL: `https://yourdomain.com/api/webhooks/stripe`
   - Events to send:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payment_intent.canceled`

2. **Payment Methods**
   - Card payments: Enabled
   - ACH Direct Debit: Enabled (optional)

3. **Radar Rules** (recommended)
   - Enable basic fraud protection
   - Review high-risk payments

## Testing

### Stripe CLI Testing

```bash
# Forward webhooks to local server
stripe listen --forward-to localhost:3004/api/webhooks/stripe

# In another terminal, trigger events
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
```

### Test Card Numbers

| Card | Behavior |
|------|----------|
| `4242424242424242` | Succeeds |
| `4000000000000002` | Declines |
| `4000000000009995` | Insufficient funds |
| `4000002760003184` | Requires 3D Secure |

### Test Script

```bash
# Run automated payment flow test
node scripts/test-payment-flow.js --base-url http://localhost:3004 --verbose
```

## Structured Logging

All payment events are logged with consistent JSON format:

```json
{
  "timestamp": "2026-03-02T10:30:00.000Z",
  "event": "payment_intent.succeeded",
  "payment_intent_id": "pi_xxx",
  "order_id": 123,
  "order_number": "GC-XXXXX"
}
```

Log events:
- `payment_intent.created`
- `payment_intent.succeeded`
- `payment_intent.failed`
- `payment_intent.canceled`
- `inventory.reserved`
- `inventory.released`
- `inventory.deducted`
- `order.created`
- `order.status_updated`
- `webhook.received`
- `webhook.processed`
- `webhook.skipped`
- `duplicate.prevented`

## Error Handling

| Error | Response | Retry? |
|-------|----------|--------|
| Invalid webhook signature | 400 | No |
| Order not found | 200 (skip) | No |
| Order already processed | 200 (skip) | No |
| Database error | 500 | Yes |
| Email send failure | 200 (continue) | No |

## Security Checklist

- [x] Webhook signature verification
- [x] STRIPE_WEBHOOK_SECRET required
- [x] Raw body parsing before JSON
- [x] Idempotency via event ID tracking
- [x] Status-based duplicate prevention
- [x] Stock reserved atomically
- [x] Structured audit logging
- [x] Error handling with proper HTTP codes
- [ ] Stripe Radar enabled (manual setup)
- [ ] PCI compliance (handled by Stripe.js)

## Production Readiness Verdict

**Status: READY FOR PRODUCTION**

The payment integration includes:
1. ✅ Proper PaymentIntent creation with metadata
2. ✅ Webhook signature verification
3. ✅ Idempotency at multiple levels
4. ✅ Duplicate order prevention
5. ✅ Payment failure handling with stock release
6. ✅ Structured logging for all events
7. ✅ Error handling with retry support

**Before going live:**
1. Configure webhook in Stripe Dashboard
2. Enable Stripe Radar fraud protection
3. Test with real cards in test mode
4. Run stale order cleanup job (hourly recommended)
