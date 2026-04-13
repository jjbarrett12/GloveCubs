# Skill: test-glovecubs-system

## Purpose
Validate that GloveCubs features and workflows behave correctly, persist truthfully, and maintain system integrity under real-world conditions.

This skill tests SYSTEM BEHAVIOR, not just code.

It must verify that:
- workflows complete correctly end-to-end
- data written to the database is correct and consistent
- money, inventory, and tenant boundaries are preserved
- failure and retry scenarios do not corrupt state
- duplicate actions do not create duplicate effects
- UI reflects real persisted state

If critical flows are not proven under realistic conditions, the system is NOT considered tested.

---

## Use this skill when
- a feature has been built (/build complete)
- before running /secure or /review
- validating checkout, cart, pricing, inventory, onboarding, or order flows
- validating API ↔ RPC ↔ DB behavior
- confirming bug fixes actually resolved root issues

---

## Do NOT use this skill when
- no implementation exists
- only writing isolated unit tests without workflows
- doing security analysis (use /secure)
- doing final release gating (use /review or /ship)

---

## System Context (Non-Negotiable)
- Tenant model: organizations.id ONLY
- Canonical schemas:
  - gc_commerce.*
  - catalog_v2.*
- No mock/demo/fallback data
- All UI states must map to persisted DB state
- Inventory must be atomic (reserve → deduct → release)
- Payment must reconcile with order truth
- No split-brain sources of truth

---

## Test Objectives
A valid test run must prove:

1. Core workflows succeed end-to-end
2. Failure scenarios do not corrupt data
3. Duplicate/retry scenarios do not create duplicate effects
4. Data invariants are always preserved
5. Tenant isolation is enforced
6. UI reflects actual persisted state

If any of these are unproven, testing is incomplete.

---

## Required Test Procedure

### Step 1: Identify critical workflows
List workflows to test, including:

- cart creation and updates
- checkout flow
- payment success
- payment failure
- order creation
- inventory reservation/deduction/release
- onboarding (if relevant)
- admin or supplier actions (if relevant)

Do not proceed without explicitly listing workflows.

---

### Step 2: Define invariants (CRITICAL)
For each workflow, define invariants that must ALWAYS hold:

Examples:
- order total == sum(order_lines)
- Stripe amount == order total
- inventory never negative
- no cross-org data access
- no duplicate orders for one payment

These must be explicitly verified in tests.

---

### Step 3: Execute happy path tests (E2E REQUIRED)
For each workflow, run:

FULL FLOW:
UI → API → RPC → DB → UI

Verify:
- correct DB writes
- correct final state
- correct UI reflection

Example:
Cart → Checkout → Payment → Order
Verify:
- cart exists
- order created
- totals correct
- inventory deducted
- UI shows confirmed state

---

### Step 4: Execute failure path tests (REQUIRED)
Simulate:

- payment failure
- API failure mid-flow
- network interruption
- invalid input
- partial DB failure (where applicable)

Verify:
- no partial or corrupted state
- no “success” UI state
- rollback or recovery behavior works

---

### Step 5: Execute duplicate / retry tests (CRITICAL)
Simulate:

- double click submit
- multi-tab checkout
- repeated API calls
- webhook replay (if applicable)

Verify:
- no duplicate orders
- no duplicate charges
- no double inventory deduction
- idempotent behavior where required

---

### Step 6: Inventory integrity tests
Specifically verify:

- reserve → deduct → release lifecycle
- failed checkout releases inventory
- duplicate checkout does not double-deduct
- inventory cannot go negative
- inventory matches expected state after all flows

---

### Step 7: Payment integrity tests
Verify:

- Stripe amount matches DB order total
- mismatched totals are blocked or flagged
- payment success only after trusted confirmation
- payment failure does not create paid state
- no duplicate charges from retries

---

### Step 8: Tenant isolation tests
Simulate:

- user from Org A attempting to access Org B data
- API calls with swapped IDs
- UI navigation attempts across orgs

Verify:
- access is denied
- data is not leaked
- writes cannot affect another org

---

### Step 9: Read-path / UI truth tests
Verify:

- UI shows only persisted data
- no optimistic success without DB confirmation
- errors are surfaced
- no stale or misleading state
- refresh shows consistent state

---

### Step 10: Data consistency checks
After all tests:

- check for orphan records
- check for inconsistent totals
- check for duplicate rows
- check for stuck states (e.g., reserved inventory never released)

---

## Required Output Format

### TEST SUMMARY
- Feature / Change:
- Workflows tested:
- Test scope:
- Risk level: LOW / MEDIUM / HIGH

### WORKFLOW TEST RESULTS
- [Workflow]&#58;   - Happy path: PASS / FAIL
  - Failure path: PASS / FAIL
  - Duplicate/retry: PASS / FAIL

### INVARIANT CHECKS
- [Invariant]&#58;   - Result: PASS / FAIL
  - Notes:

### INVENTORY TEST RESULTS
- Reserve/deduct/release:
- Negative inventory prevention:
- Duplicate deduction protection:
- Result: PASS / FAIL

### PAYMENT TEST RESULTS
- Stripe reconciliation:
- Failure handling:
- Duplicate charge protection:
- Result: PASS / FAIL

### TENANT ISOLATION RESULTS
- Cross-org read:
- Cross-org write:
- Result: PASS / FAIL

### UI TRUTH RESULTS
- Persisted state accuracy:
- Phantom success states:
- Stale data issues:
- Result: PASS / FAIL

### DATA CONSISTENCY CHECK
- Orphan records:
- Duplicate records:
- Inconsistent totals:
- Stuck states:
- Result: PASS / FAIL

### CRITICAL FAILURES
- [list]

### HIGH-RISK ISSUES
- [list]

### TEST COVERAGE GAPS
- [what was NOT tested]

### FINAL TEST VERDICT
- TESTS PASSED: YES / NO
- READY FOR /SECURE: YES / NO
- MUST FIX BEFORE PROCEEDING:
- RECOMMENDED NEXT COMMAND:

---

## Enforcement Rules
- Do not rely only on unit tests for workflow-heavy features
- Do not skip failure scenarios
- Do not skip duplicate/retry scenarios
- Do not assume UI success equals DB success
- Do not pass tests if invariants are not explicitly verified
- If money, inventory, or tenant boundaries are unproven, TESTS PASSED = NO
- If only happy paths are tested, TESTS PASSED = NO

You are not here to confirm things work.
You are here to prove they do not break.
