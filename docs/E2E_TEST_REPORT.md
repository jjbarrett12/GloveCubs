# GLOVECUBS End-to-End Ecommerce QA Test Report

## Test Environment

| Component | Status |
|-----------|--------|
| Server | Requires startup (`npm run dev`) |
| Database | Supabase required |
| Stripe | Test mode required |
| Email | SMTP configuration required |

## Test Script

Run the E2E test suite:

```bash
# Start server first
npm run dev

# Run tests
node scripts/e2e-test.js

# With verbose output
node scripts/e2e-test.js --verbose

# Against different URL
node scripts/e2e-test.js --url=https://staging.glovecubs.com
```

## Test Coverage

### 1. Customer Flow Tests

| # | Test | Description | Verifies |
|---|------|-------------|----------|
| 1 | Register new user | Creates account with company info | Registration API, validation |
| 2 | Login | Authenticates user | JWT token generation |
| 3 | Browse catalog | Fetches product list | Product API, pagination |
| 4 | Search products | Searches by keyword | Search functionality |
| 5 | Add to cart | Adds product with size/qty | Cart API, session handling |
| 6 | View cart | Retrieves cart contents | Cart persistence |
| 7 | Address validation | Tests invalid addresses | Address validation rules |
| 8 | Tax calculation | Tests nexus-based tax | Tax API, in-state vs out-state |
| 9 | Create payment | Creates Stripe PaymentIntent | Stripe integration, order creation |
| 10 | View order in portal | Confirms order visible | Customer portal, company scoping |

### 2. Edge Case Tests

| # | Test | Description | Verifies |
|---|------|-------------|----------|
| E1 | Duplicate prevention | Double-submits checkout | Idempotency logic |
| E2 | Out-of-stock | Orders unavailable quantity | Inventory validation |
| E3 | Invalid address | Submits bad address | Server-side validation |
| E4 | Payment failure | Simulates card decline | Error handling, stock release |

### 3. Admin Flow Tests

| # | Test | Description | Verifies |
|---|------|-------------|----------|
| A1 | Admin protection | Checks endpoint security | Auth middleware |
| A2 | View orders | Admin lists all orders | Admin API |
| A3 | Mark shipped | Updates order status | Status updates, email trigger |
| A4 | Email status | Checks SMTP config | Email configuration |

## Detailed Test Scenarios

### Scenario 1: Complete Purchase (Credit Card)

```
1. POST /api/register → Create user
2. POST /api/login → Get auth token
3. GET /api/products → Browse catalog
4. POST /api/cart → Add item
5. POST /api/orders/create-payment-intent → Create order + PaymentIntent
   → Returns client_secret
6. [Browser] Stripe.js confirmPayment(client_secret)
7. Stripe webhook → payment_intent.succeeded
8. Order status: pending_payment → pending
9. Email: Payment confirmation sent
```

### Scenario 2: Complete Purchase (Net 30)

```
1. User with is_approved=true
2. POST /api/orders { payment_method: 'net30' }
3. Order created immediately with status: pending
4. Inventory reserved
5. Email: Order confirmation sent
```

### Scenario 3: Payment Failure

```
1. POST /api/orders/create-payment-intent → Order in pending_payment
2. [Browser] Payment fails (e.g., card declined)
3. Stripe webhook → payment_intent.payment_failed
4. Order status → payment_failed
5. Inventory released
6. Email: Payment failure notification
7. Customer can retry with same order
```

### Scenario 4: Checkout Refresh (Duplicate Prevention)

```
1. POST /api/orders/create-payment-intent → Creates Order A
2. [User refreshes page]
3. POST /api/orders/create-payment-intent → Returns existing Order A
   (reused_existing: true)
4. Only one order exists
```

### Scenario 5: Out-of-Stock Prevention

```
1. Product has 10 units in stock
2. User adds 20 to cart
3. POST /api/orders/create-payment-intent
   → 400 "Insufficient stock"
4. User cannot complete checkout
```

### Scenario 6: Order Shipping

```
1. Admin: PUT /api/admin/orders/:id { status: 'shipped', tracking_number: '...' }
2. Inventory deducted (reservations released)
3. Email: Shipping notification with tracking sent
4. Customer sees updated status in portal
```

## Expected Results

### Pass Criteria

| Metric | Requirement |
|--------|-------------|
| Customer flow | All tests pass |
| Edge cases | All validations work |
| Admin flow | Protected + functional |
| No errors | Zero uncaught exceptions |

### Sample Output

```
╔════════════════════════════════════════════════════════════════════╗
║         GLOVECUBS END-TO-END ECOMMERCE QA TEST                     ║
╚════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════
                    CUSTOMER FLOW TESTS
═══════════════════════════════════════════════════════════════

✓ 1. Register new user
✓ 2. Login
✓ 3. Browse product catalog - 150 products
✓ 4. Search for products - 12 results
✓ 5. Add item to cart - Nitrile Gloves Black
✓ 6. View cart - 1 items
✓ 7. Checkout address validation
✓ 8. Tax calculation (nexus-based) - In-state: $8.25, Out-state: $0
✓ 9. Create payment intent (Stripe) - Order GC-ABC123
✓ 10. View order in customer portal - Status: pending_payment

═══════════════════════════════════════════════════════════════
                    EDGE CASE TESTS
═══════════════════════════════════════════════════════════════

✓ E1. Duplicate order prevention - Correctly reused existing
✓ E2. Out-of-stock handling - Correctly blocked

═══════════════════════════════════════════════════════════════
                    ADMIN FLOW TESTS
═══════════════════════════════════════════════════════════════

✓ A1. Admin endpoint protection - Correctly protected
○ A2. Admin view orders - No admin access
○ A3. Admin mark order shipped - No admin access
○ A4. Email configuration status - No admin access

╔════════════════════════════════════════════════════════════════════╗
║                         TEST RESULTS                               ║
╠════════════════════════════════════════════════════════════════════╣
║  Passed:    12                                                     ║
║  Failed:     0                                                     ║
║  Skipped:    3                                                     ║
╚════════════════════════════════════════════════════════════════════╝
```

## Known Issues & Failures Discovered

### Issue 1: Supabase Not Configured
- **Severity**: Blocker
- **Description**: Cannot run tests without database
- **Fix**: Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`

### Issue 2: Stripe Not Configured
- **Severity**: High
- **Description**: Credit card/ACH payments fail without Stripe
- **Fix**: Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in `.env`

### Issue 3: Email Not Configured
- **Severity**: Medium
- **Description**: Transactional emails not sent
- **Fix**: Configure SMTP settings in `.env`

### Issue 4: No Admin User
- **Severity**: Low
- **Description**: Cannot test admin flows without admin account
- **Fix**: Create admin user in database with `is_admin: true`

## Recommended Fixes

### Before Launch

1. **Configure Supabase**
   ```bash
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```

2. **Configure Stripe**
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

3. **Configure Email**
   ```bash
   SMTP_HOST=smtp.gmail.com
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   ADMIN_EMAIL=sales@glovecubs.com
   ```

4. **Configure Tax**
   ```bash
   BUSINESS_STATE=CA
   BUSINESS_TAX_RATE=0.0825
   ```

5. **Add Products**
   - Minimum 50 launch-ready products
   - All with images, prices, descriptions, categories

6. **Create Admin User**
   - Set `is_admin: true` in users table

### Pre-Production Checklist

- [ ] All E2E tests pass
- [ ] Stripe webhook configured and tested
- [ ] Email delivery verified
- [ ] Admin can manage orders
- [ ] Customer can complete purchase
- [ ] Shipping notifications work
- [ ] Inventory correctly tracked
- [ ] Tax calculated correctly

## Test Data Cleanup

After testing, clean up test data:

```sql
-- Delete test users
DELETE FROM users WHERE email LIKE 'test-e2e-%@example.com';

-- Delete test orders
DELETE FROM orders WHERE notes LIKE 'E2E Test%';
```

## Files

| File | Description |
|------|-------------|
| `scripts/e2e-test.js` | E2E test runner |
| `scripts/test-payment-flow.js` | Payment-specific tests |
| `docs/E2E_TEST_REPORT.md` | This documentation |
