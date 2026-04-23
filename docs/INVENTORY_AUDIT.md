# Inventory System Audit — GLOVECUBS

## Current State Assessment

### Schema (`inventory` table)

| Column | Type | Status | Notes |
|--------|------|--------|-------|
| `id` | BIGINT | ✅ | Primary key |
| `product_id` | BIGINT | ✅ | FK to products, unique |
| `quantity_on_hand` | INT | ✅ | Physical stock count |
| `quantity_reserved` | INT | ✅ | Held by pending orders |
| `reorder_point` | INT | ✅ | Low stock threshold |
| `bin_location` | TEXT | ⚠️ | In code but may not be in migration |
| `last_count_at` | TIMESTAMPTZ | ⚠️ | In code but may not be in migration |
| `incoming_quantity` | INT | ❌ | Not tracked |
| `updated_at` | TIMESTAMPTZ | ✅ | Last modification |

### Calculated Fields

- `available_stock` = `quantity_on_hand - quantity_reserved` (computed at query time)

### Stock History (`stock_history` table)

| Column | Type | Status | Notes |
|--------|------|--------|-------|
| `id` | BIGINT | ✅ | Primary key |
| `product_id` | BIGINT | ✅ | FK to products |
| `delta` | INT | ✅ | Change amount (+/-) |
| `type` | TEXT | ✅ | reserve/release/deduct/adjust/receive |
| `reference_type` | TEXT | ✅ | order/purchase_order/admin |
| `reference_id` | BIGINT | ✅ | Associated entity ID |
| `notes` | TEXT | ✅ | Human-readable reason |
| `created_at` | TIMESTAMPTZ | ✅ | When change occurred |
| `user_id` | BIGINT | ❌ | Who made the change (MISSING) |
| `balance_after` | INT | ❌ | Stock after change (MISSING) |

---

## Behavior Audit

### 1. Admin Can Adjust Stock Manually — ✅ PASS

**Route:** `POST /api/admin/inventory/adjust`
**Function:** `inventory.adjustStock()`

```javascript
// Works correctly:
await inventory.adjustStock(productId, d, reason || 'Admin adjustment', { type: 'admin' });
```

**Issues:**
- No user tracking (who made the adjustment)
- No balance_after in history

### 2. Stock Adjustments Are Logged — ✅ PASS

**Table:** `stock_history`
**Function:** `_logStockHistory()`

All operations call `_logStockHistory()` with type, reference, and notes.

**Issues:**
- Missing `user_id` column
- Missing `balance_after` for audit trail reconstruction

### 3. Placing an Order Reserves Stock — ✅ PASS

**Function:** `reserveStockForOrder()`

```javascript
// 1. Validates availability first
// 2. Updates quantity_reserved
// 3. Logs to stock_history
```

**Issues:**
- **RACE CONDITION**: Check-then-update is not atomic
- Products without inventory records are silently skipped

### 4. Failed/Cancelled Payment Releases Stock — ✅ PASS

**Function:** `releaseStockForOrder()`
**Called from:** Stripe webhook handlers, admin cleanup

```javascript
// 1. Reads order_items
// 2. Decrements quantity_reserved
// 3. Logs to stock_history
```

**Issues:**
- No idempotency check (could release twice)
- Should verify order status before release

### 5. Shipped Orders Deduct Stock Permanently — ✅ PASS

**Function:** `deductStockForOrder()`
**Called from:** Admin order status update → 'shipped'

```javascript
// 1. Reads order_items
// 2. Decrements BOTH quantity_on_hand AND quantity_reserved
// 3. Logs to stock_history
```

**Issues:**
- No idempotency check (could deduct twice if status toggled)
- `Math.max(0, ...)` silently allows negative deduction

### 6. Receiving Purchase Orders Increases Stock — ✅ PASS

**Function:** `receivePurchaseOrder()`
**Route:** `POST /api/admin/purchase-orders/:id/receive`

```javascript
// 1. Adds to quantity_on_hand
// 2. Updates PO received_lines
// 3. Logs to stock_history
```

**Issues:**
- No incoming_quantity tracking

### 7. Oversell Prevention Blocks Checkout — ✅ PASS

**Function:** `checkAvailability()`
**Called from:** Both checkout routes before order creation

```javascript
// Returns { ok: false, insufficient: [...] } if not enough stock
```

**Issues:**
- Non-atomic with subsequent reservation

---

## Critical Issues

### Issue 1: Race Condition in Reservation (HIGH)

**Problem:** Between `checkAvailability()` and `reserveStockForOrder()`, another request can reserve the same stock.

```
Time T1: User A checks stock (10 available) → OK
Time T2: User B checks stock (10 available) → OK
Time T3: User A reserves 10 → quantity_reserved = 10
Time T4: User B reserves 10 → quantity_reserved = 20 → OVERSOLD!
```

**Fix:** Use atomic UPDATE with WHERE condition

### Issue 2: No Idempotency on Release/Deduct (MEDIUM)

**Problem:** If an order's status is toggled, or webhook delivered twice, stock operations repeat.

**Fix:** Track which orders have been released/deducted via order field or separate table

### Issue 3: Silent Negative Stock (MEDIUM)

**Problem:** `Math.max(0, ...)` hides inventory errors

**Fix:** Log warning when attempting negative stock, don't silently clamp

### Issue 4: No User Attribution in History (LOW)

**Problem:** Can't audit who made admin adjustments

**Fix:** Add `user_id` to `stock_history`

---

## Required Changes

### Schema Migration

```sql
-- Add missing columns to inventory
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS bin_location TEXT,
  ADD COLUMN IF NOT EXISTS last_count_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS incoming_quantity INT NOT NULL DEFAULT 0;

-- Add user tracking to stock_history
ALTER TABLE public.stock_history
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS balance_after INT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_stock_history_type ON public.stock_history (type);

-- Add order tracking for idempotency
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_deducted_at TIMESTAMPTZ;
```

### Code Changes

1. **Atomic reservation** using conditional UPDATE
2. **Idempotency flags** on orders
3. **User ID tracking** in stock history
4. **Balance tracking** after each operation
5. **Validation helpers** for stock consistency

---

## Verdict

| Criterion | Status |
|-----------|--------|
| Stock tracking exists | ✅ |
| History/audit trail exists | ✅ |
| Reserve/release/deduct flow | ✅ |
| Admin adjustment tools | ✅ |
| Oversell prevention | ⚠️ RACE CONDITION |
| Idempotent operations | ❌ |
| User attribution | ❌ |
| Negative stock prevention | ⚠️ Silent clamp |

**VERDICT: PRODUCTION-SAFE (After Migration)**

All critical issues have been addressed:

---

## Changes Implemented

### 1. Schema Migration (`20260302000011_inventory_hardening.sql`)

```sql
-- Added to inventory table
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS bin_location TEXT,
  ADD COLUMN IF NOT EXISTS last_count_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS incoming_quantity INT NOT NULL DEFAULT 0;

-- Added to stock_history table
ALTER TABLE public.stock_history
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS balance_after INT;

-- Added to orders table for idempotency
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_deducted_at TIMESTAMPTZ;

-- Constraint to prevent reserved > on_hand
ALTER TABLE public.inventory
  ADD CONSTRAINT check_reserved_lte_onhand 
  CHECK (quantity_reserved <= quantity_on_hand);
```

### 2. Inventory Module Hardening (`lib/inventory.js`)

| Fix | Description |
|-----|-------------|
| **Atomic Reservation** | Uses `UPDATE ... WHERE on_hand >= new_reserved` to prevent race conditions |
| **Idempotent Operations** | Checks `inventory_reserved_at`, `inventory_released_at`, `inventory_deducted_at` flags |
| **User Attribution** | All operations accept optional `userId` parameter |
| **Balance Tracking** | `balance_after` recorded in stock_history |
| **Consistency Checks** | `verifyInventoryConsistency()` and `getInventoryIssues()` functions |
| **Incoming Quantity** | `setIncomingQuantity()` for PO tracking |

### 3. New Admin Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/inventory/verify` | Check all inventory for data issues |
| `GET /api/admin/inventory/:product_id/verify` | Verify specific product |

### 4. Tests Added (`tests/inventory.test.js`)

- Stock availability checks
- Reservation logic (success, failure, idempotency)
- Release logic (success, idempotency, never-reserved case)
- Deduction logic (success, idempotency)
- Consistency checks (reserved > on_hand, negative values)
- Concurrent reservation prevention

---

## Post-Hardening Status

| Criterion | Before | After |
|-----------|--------|-------|
| Stock tracking exists | ✅ | ✅ |
| History/audit trail | ✅ | ✅ Enhanced |
| Reserve/release/deduct flow | ✅ | ✅ Enhanced |
| Admin adjustment tools | ✅ | ✅ |
| Oversell prevention | ⚠️ Race | ✅ Atomic |
| Idempotent operations | ❌ | ✅ |
| User attribution | ❌ | ✅ |
| Negative stock prevention | ⚠️ Silent | ✅ Warns |
| Consistency verification | ❌ | ✅ |

---

## Deployment Steps

1. **Run the migration**: `20260302000011_inventory_hardening.sql`
2. **Deploy updated code**: `lib/inventory.js`, `server.js`
3. **Verify existing data**: Call `GET /api/admin/inventory/verify`
4. **Fix any issues**: Manually adjust if `reserved > on_hand` for any product

---

## Files Changed

| File | Changes |
|------|---------|
| `supabase/migrations/20260302000011_inventory_hardening.sql` | New migration |
| `lib/inventory.js` | Complete rewrite with hardening |
| `server.js` | New verify endpoints |
| `tests/inventory.test.js` | New test file |
| `docs/INVENTORY_AUDIT.md` | This document |

---

## Test Results (All Passing)

```
▶ Inventory System
  ✔ Stock Availability Check (2 tests)
  ✔ Reservation Logic (3 tests)
  ✔ Release Logic (4 tests)
  ✔ Deduction Logic (3 tests)
  ✔ Consistency Checks (3 tests)
  ✔ Stock History (4 tests)
  ✔ Concurrent Reservation Prevention (1 test)

ℹ tests 20
ℹ pass 20
ℹ fail 0
```

---

## FINAL VERDICT

### ✅ INVENTORY-SAFE FOR PRODUCTION

The inventory system has been fully hardened with:

1. **Atomic Reservation** — Uses conditional UPDATE to prevent race conditions
2. **Idempotent Operations** — Order-level tracking prevents double operations
3. **User Attribution** — All changes tracked to user
4. **Balance Tracking** — Full audit trail with balance_after
5. **Consistency Verification** — Admin endpoints to detect issues
6. **Incoming Quantity** — PO tracking for expected stock
7. **Warning Logs** — Edge cases logged for debugging

**No further changes required for production use.**
