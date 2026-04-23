# GLOVECUBS Email System

This document describes the transactional email system for GLOVECUBS ecommerce.

## Configuration

### Required Environment Variables

```bash
# SMTP Configuration (all required)
SMTP_HOST=smtp.gmail.com        # SMTP server hostname
SMTP_USER=your-email@gmail.com  # SMTP username
SMTP_PASS=your-app-password     # SMTP password or app password

# Optional
SMTP_PORT=587                   # Default: 587
SMTP_SECURE=false               # Use TLS (default: false, uses STARTTLS)
SMTP_FROM=noreply@glovecubs.com # From address (default: SMTP_USER)
ADMIN_EMAIL=sales@glovecubs.com # Admin notification recipient
```

### Gmail Setup

For Gmail, you must use an **App Password** (not your regular password):

1. Enable 2-Factor Authentication on your Google account
2. Go to Google Account > Security > App passwords
3. Generate a new app password for "Mail"
4. Use this password as `SMTP_PASS`

### Testing Configuration

```bash
# Check email status
GET /api/admin/email/status?verify=true

# Send test email
POST /api/admin/email/test
{ "to": "recipient@example.com" }
```

## Email Types

### 1. Order Confirmation

**Trigger:** Net 30 order submission (POST /api/orders)

**Recipients:**
- Customer email
- Admin email (ADMIN_EMAIL)

**Content:**
- Order number
- Order items with SKUs, quantities, prices
- Subtotal, shipping, tax, total
- Shipping address
- Payment method

### 2. Payment Success

**Trigger:** Stripe webhook `payment_intent.succeeded`

**Recipients:**
- Customer email

**Content:**
- Order number
- Payment confirmation
- Order items
- Totals
- Shipping address
- Link to track order

### 3. Payment Failed

**Trigger:** Stripe webhook `payment_intent.payment_failed`

**Recipients:**
- Customer email

**Content:**
- Order number
- Amount due
- Error reason (if available)
- Instructions to retry
- Link to checkout

### 4. Order Shipped

**Trigger:** Admin sets order status to "shipped" (PUT /api/admin/orders/:id)

**Recipients:**
- Customer email

**Content:**
- Order number
- Tracking number
- Tracking link (clickable button)
- Shipping address
- Items shipped
- Estimated delivery

### 5. RFQ Confirmation

**Trigger:** RFQ submission (POST /api/rfqs)

**Recipients:**
- Customer email
- Admin email (ADMIN_EMAIL)

**Content:**
- Request details (company, product type, quantity, use case)
- Expected response time
- Contact information

## Email Templates

All emails use consistent, professional HTML templates with:
- Responsive design (mobile-friendly)
- Brand colors and logo
- Clear call-to-action buttons
- Plain text fallback
- Support contact information

Templates are located in: `lib/email-templates.js`

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         ORDER FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Customer places order                                           │
│         │                                                        │
│         ├── Net 30 ──────────────────────────────────────┐      │
│         │                                                 │      │
│         │   POST /api/orders                             │      │
│         │         │                                       │      │
│         │         ├── Order Confirmation → Customer      │      │
│         │         └── Admin Notification → Admin         │      │
│         │                                                 │      │
│         └── Credit Card / ACH ────────────────────┐      │      │
│                                                    │      │      │
│             POST /api/orders/create-payment-intent │      │      │
│                      │                             │      │      │
│                      │ (Creates pending order)     │      │      │
│                      │                             │      │      │
│             Customer pays via Stripe.js            │      │      │
│                      │                             │      │      │
│         ┌────────────┴────────────┐               │      │      │
│         │                         │               │      │      │
│    Success                    Failed              │      │      │
│         │                         │               │      │      │
│  payment_intent.           payment_intent.        │      │      │
│    succeeded                payment_failed        │      │      │
│         │                         │               │      │      │
│  Payment Success         Payment Failed           │      │      │
│  Email → Customer        Email → Customer         │      │      │
│                                                   │      │      │
└─────────────────────────────────────────────────┴──────┴──────┘

┌─────────────────────────────────────────────────────────────────┐
│                       SHIPPING FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Admin updates order status to "shipped"                         │
│         │                                                        │
│  PUT /api/admin/orders/:id                                       │
│  { "status": "shipped", "tracking_number": "...",                │
│    "tracking_url": "..." }                                       │
│         │                                                        │
│         ├── Inventory deducted                                   │
│         └── Shipping Notification → Customer                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         RFQ FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Customer submits RFQ                                            │
│         │                                                        │
│  POST /api/rfqs                                                  │
│         │                                                        │
│         ├── RFQ Confirmation → Customer                          │
│         └── Admin Notification → Admin                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Email Administration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/email/status` | Get SMTP configuration status |
| GET | `/api/admin/email/status?verify=true` | Verify SMTP connection |
| POST | `/api/admin/email/test` | Send test email |

### Example: Send Test Email

```bash
curl -X POST http://localhost:3000/api/admin/email/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "test@example.com"}'
```

## Error Handling

- If SMTP is not configured, emails are silently skipped (logged to console)
- Email failures do not block order processing
- Failed emails are logged with error details
- Payment-related email failures are tracked in payment logs

## Files

| File | Description |
|------|-------------|
| `lib/email.js` | SMTP transport and sendMail function |
| `lib/email-templates.js` | HTML email templates |
| `server.js` | Email trigger points |

## Testing Checklist

- [ ] Configure SMTP environment variables
- [ ] Send test email via admin endpoint
- [ ] Place Net 30 order, verify confirmation email
- [ ] Complete Stripe payment, verify payment success email
- [ ] Trigger payment failure, verify failure email
- [ ] Update order to shipped with tracking, verify shipping email
- [ ] Submit RFQ, verify confirmation email
