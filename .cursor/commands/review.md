---
description: Final GO/NO-GO review — spec/plan vs build, truth paths, tests, security
---

# Skill: review-glovecubs-feature

## Purpose
Perform a strict final implementation review for GloveCubs after build, test, and security work are complete.

This skill is the final engineering quality gate before /ship.

Its job is to verify that:
- the approved plan was actually implemented
- the system still respects canonical truth
- testing covered the real risks
- security concerns were addressed
- no hidden drift, fake UI behavior, or unsafe shortcuts remain

This is not a summary skill.
This is a GO / NO-GO decision skill.

If critical gaps remain, the feature is NOT ready.

---

## Use this skill when
- /build is complete
- /test has been run
- /secure has been run for meaningful changes
- you need a final engineering verdict before /ship
- you want to confirm that implementation matches spec and plan

---

## Do NOT use this skill when
- requirements are still being defined
- no approved /plan exists
- implementation is incomplete
- testing has not been performed
- you are looking for debugging help
- you are looking for release readiness tasks like backup/rollback checks (use /ship for that)

---

## System Context (Non-Negotiable)
- Tenant model: organizations.id ONLY
- Canonical commerce schema: gc_commerce.*
- Canonical catalog schema: catalog_v2.*
- No clients/accounts as tenant keys
- No mock/demo/fallback data
- No split-brain truth
- Every user-visible action must map to persisted database state
- Inventory mutations must remain atomic
- Payment amounts must reconcile exactly with database truth
- Read models are allowed only when explicitly declared and must never become the write truth

---

## Review Objectives
A valid review must answer all of the following:

1. Did the implementation match the approved /spec and /plan?
2. Were canonical write paths preserved?
3. Were read paths kept truthful and persistence-backed?
4. Were the critical risks actually tested?
5. Were security and tenancy protections preserved?
6. Were any shortcuts, dead paths, or hidden assumptions introduced?
7. Is this ready to move to /ship?

If any of these cannot be answered confidently, the review is incomplete.

---

## Required Review Procedure

### Step 1: Compare implementation against scope
Review:
- approved /spec
- approved /plan
- build output
- test results
- security findings

Determine:
- what was supposed to be built
- what was actually built
- what is missing
- what was added without approval

Any unapproved behavior or missing critical behavior must be called out explicitly.

---

### Step 2: Verify canonical ownership and truth
For each core data concept touched by the feature, verify:

- canonical source of truth still exists
- no new parallel source of truth was introduced
- write path remains singular and controlled
- read path reflects persisted state

Focus especially on:
- carts
- cart lines
- pricing
- inventory
- orders
- payment state
- company/account/org-facing data

If a new duplicate truth exists, review fails.

---

### Step 3: Verify write path integrity
For each key user action, confirm:

USER ACTION → UI → API / server → RPC / service → DB write

Check:
- single canonical path
- no bypasses
- no shadow writes
- no direct client-side mutation of protected state
- no writing into read models/views

If any important write path is unclear or duplicated, mark as blocking.

---

### Step 4: Verify read path integrity and UI truth
For each major displayed value or workflow state, confirm:

- data shown comes from DB-backed state
- success states are real, not implied
- errors are surfaced
- no fake placeholder state pretends work completed
- caching or stale state does not create misleading UX

If the UI can lie, even temporarily, call it out.

---

### Step 5: Review test coverage against real risk
Do not just confirm “tests exist.”
Confirm that the RIGHT things were tested.

Check whether tests covered:

- successful happy path
- failed path / rollback behavior
- invalid state transition attempts
- duplicate submission / retry scenarios
- inventory race conditions
- payment mismatch scenarios
- tenant isolation
- API / RPC contract correctness

If tests are shallow, incomplete, or only unit-level for a workflow-heavy feature, mark as insufficient.

---

### Step 6: Review security and tenancy preservation
Confirm:
- organization_id boundaries preserved
- no legacy client_id/account_id leakage
- RLS assumptions remain safe
- service-role usage is controlled
- privileged actions are constrained
- payment/webhook validation is preserved
- inputs cannot tamper with money, quantity, or ownership

If security review was skipped for a high-risk workflow, review fails.

---

### Step 7: Review operational quality
Confirm:
- errors are surfaced clearly
- logging exists for critical failures
- no silent catch-and-ignore behavior
- no “TODO” or temporary fallback on critical paths
- no dead code or legacy code path accidentally reactivated

Call out:
- code smells that are not blockers
- shortcuts that may not fail today but will erode trust later

---

### Step 8: Review ship readiness prerequisites
Confirm whether the work is in a state where /ship can reasonably proceed.

Examples:
- migrations are known and controlled
- tests produced meaningful evidence
- blockers are resolved
- no critical unknowns remain
- rollback-sensitive areas are understood

This step is not the same as /ship.
It determines whether /ship is even worth running.

---

## Required Output Format

### REVIEW SUMMARY
- Feature / Change:
- Reviewed against:
  - /spec:
  - /plan:
  - /build:
  - /test:
  - /secure:
- Review scope:
- Risk level: LOW / MEDIUM / HIGH

### SCOPE MATCH
- Planned behavior:
- Implemented behavior:
- Missing from implementation:
- Unapproved additions:
- Result: PASS / FAIL

### CANONICAL TRUTH REVIEW
- Data concepts reviewed:
- Canonical ownership preserved?:
- Duplicate truth introduced?:
- Result: PASS / FAIL

### WRITE PATH REVIEW
- Key write paths reviewed:
- Any duplicate or bypassed paths:
- Result: PASS / FAIL

### READ PATH / UI TRUTH REVIEW
- Key UI states reviewed:
- Any phantom success / stale truth / fake state:
- Result: PASS / FAIL

### TEST ADEQUACY REVIEW
- What was tested:
- What was not tested:
- Are critical risks covered?:
- Result: PASS / FAIL

### SECURITY / TENANCY REVIEW
- Tenant model preserved?:
- RLS / privilege concerns:
- Payment / input integrity concerns:
- Result: PASS / FAIL

### OPERATIONAL QUALITY REVIEW
- Error handling quality:
- Logging / observability quality:
- Dead code / shortcuts / TODO risk:
- Result: PASS / FAIL

### BLOCKERS
- Critical blockers:
- High-risk non-blockers:
- Medium-risk follow-ups:

### FINAL REVIEW DECISION
- REVIEW PASSED: YES / NO
- READY FOR /SHIP: YES / NO
- MUST FIX BEFORE /SHIP:
- SHOULD FIX SOON:
- RECOMMENDED NEXT COMMAND:

---

## Enforcement Rules
- Do not treat “mostly implemented” as complete
- Do not ignore mismatches between /plan and /build
- Do not assume passing tests mean meaningful coverage
- Do not allow duplicate truth
- Do not allow UI deception
- Do not pass high-risk payment, inventory, or tenant workflows without meaningful test and security evidence
- If critical unknowns remain, REVIEW PASSED = NO
- If /ship would be premature, READY FOR /SHIP = NO

You are not here to be encouraging.
You are here to prevent false confidence.
