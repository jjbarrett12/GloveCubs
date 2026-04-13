---
description: Release gate checklist — schema, payments, inventory, tenancy, E2E, rollback
---

# Skill: ship-glovecubs-release

## Purpose
Gatekeep production releases for the GloveCubs ecommerce platform.

This skill ensures that no code, schema change, or feature is shipped unless:
- system truth is preserved
- money and inventory reconcile
- no tenant violations exist
- rollback is possible

If any critical condition fails → SHIPPING IS BLOCKED.

---

## Use this skill when
- deploying new features
- applying database migrations
- modifying checkout, pricing, inventory, or payments
- preparing for production release

---

## Do NOT use this skill when
- brainstorming
- writing code
- debugging individual bugs
- doing UI-only cosmetic changes (unless they affect data flow)

---

## System Context (Non-Negotiable)
- Tenant model: organizations.id ONLY
- Canonical schemas:
  - gc_commerce.*
  - catalog_v2.*
- No clients/accounts as tenant keys
- No mock/demo/fallback data anywhere
- All writes must go through canonical RPCs or controlled API paths
- Inventory must be atomic (reserve → deduct → release)
- Stripe must reconcile with order totals exactly
- UI must reflect persisted database state only

---

## Required Release Gates (ALL MUST PASS)

### 1. SCHEMA + MIGRATION SAFETY
- [ ] All migrations reviewed
- [ ] No destructive changes without backup
- [ ] All new columns have constraints (NOT NULL, FK, etc. where applicable)
- [ ] Indexes added for new query paths
- [ ] No duplicate tables or shadow schemas introduced

FAIL CONDITIONS:
- Schema drift detected
- Duplicate source of truth created
- Missing constraints on critical data

---

### 2. WRITE PATH VERIFICATION (CRITICAL)
For each user action, confirm:

UI → API → RPC → DATABASE WRITE is:

- [ ] Clearly defined
- [ ] Single canonical path
- [ ] No parallel writes to different tables

FAIL CONDITIONS:
- Multiple write paths for same data
- UI writes bypass DB logic
- Silent or implicit writes

---

### 3. PAYMENT INTEGRITY
- [ ] Stripe payment amount == order total (exact match)
- [ ] Webhooks verified (signature validation)
- [ ] Duplicate payment protection in place
- [ ] Payment failure properly rolls back state

FAIL CONDITIONS:
- Any mismatch between Stripe and DB
- Missing webhook verification
- Double charge possibility

---

### 4. INVENTORY INTEGRITY
- [ ] All inventory mutations go through RPCs
- [ ] Reservation system enforced
- [ ] No direct table updates bypassing logic
- [ ] Inventory cannot go negative

FAIL CONDITIONS:
- Negative inventory possible
- Inventory updated outside RPC
- Reservation not enforced

---

### 5. TENANT ISOLATION (RLS)
- [ ] All tables enforce organization_id
- [ ] RLS policies verified
- [ ] No cross-org data leakage possible

FAIL CONDITIONS:
- Any query returns cross-org data
- Missing RLS policy
- Use of client_id/account_id

---

### 6. UI TRUTHFULNESS
- [ ] No mock/demo/fallback data
- [ ] No optimistic UI without reconciliation
- [ ] All displayed values come from persisted DB state

FAIL CONDITIONS:
- UI shows values not stored in DB
- Fake “success” states
- Hidden failures

---

### 7. END-TO-END FLOW VALIDATION (REQUIRED)

Must successfully complete:

1. CART → CHECKOUT → PAYMENT → ORDER CREATED
2. INVENTORY RESERVE → DEDUCT AFTER PAYMENT
3. PAYMENT FAILURE → FULL ROLLBACK
4. MULTI-TAB DOUBLE SUBMIT → NO DUPLICATES
5. TENANT ISOLATION TEST (cross-org access fails)

FAIL CONDITIONS:
- Any flow breaks
- Duplicate orders created
- Orphan records exist

---

### 8. OBSERVABILITY + LOGGING
- [ ] Critical actions logged (orders, payments, inventory)
- [ ] Errors surface (no silent failures)
- [ ] Webhook events recorded

FAIL CONDITIONS:
- No logs for critical flows
- Silent failures possible

---

### 9. ROLLBACK READINESS
- [ ] Database backup confirmed
- [ ] Rollback steps documented
- [ ] Feature can be disabled if needed

FAIL CONDITIONS:
- No rollback plan
- Irreversible migration
- No backup

---

## Required Output Format

### RELEASE SUMMARY
- Feature / Change:
- Scope:
- Risk Level: LOW / MEDIUM / HIGH

### GATE RESULTS

SCHEMA:
- Result: PASS / FAIL
- Issues:

WRITE PATHS:
- Result: PASS / FAIL
- Issues:

PAYMENTS:
- Result: PASS / FAIL
- Issues:

INVENTORY:
- Result: PASS / FAIL
- Issues:

TENANCY:
- Result: PASS / FAIL
- Issues:

UI TRUTH:
- Result: PASS / FAIL
- Issues:

E2E FLOWS:
- Result: PASS / FAIL
- Issues:

OBSERVABILITY:
- Result: PASS / FAIL
- Issues:

ROLLBACK:
- Result: PASS / FAIL
- Issues:

---

## FINAL DECISION

- READY TO SHIP: YES / NO

### MUST FIX BEFORE SHIP
- (blocking issues)

### SHOULD FIX
- (important but not blocking)

### POST-SHIP MONITORING
- (what to watch immediately after release)

---

## Enforcement Rules

- If ANY critical section fails → READY TO SHIP = NO
- Do NOT downgrade severity to pass
- Do NOT ignore partial failures
- Be strict, not optimistic

You are the last line of defense before production.
Act accordingly.
