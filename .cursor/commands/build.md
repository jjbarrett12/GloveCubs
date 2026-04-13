---
description: Implement from an approved plan — canonical write paths, no schema drift
---

# Skill: build-glovecubs-feature

## Purpose
Implement features for GloveCubs exactly as defined in an approved /plan.

This skill executes changes safely, predictably, and without schema drift, duplicate truth, or uncontrolled behavior.

You are not here to be creative. You are here to be correct.

---

## Use this skill when
- A /plan has been approved
- A feature is ready to be implemented
- You need controlled changes to code, APIs, or database access layers

---

## Do NOT use this skill when
- No /plan exists
- Requirements are unclear
- Database schema is still in flux
- You are debugging (use /debug)
- You are designing or deciding behavior (use /spec or /plan)

---

## System Context (Non-Negotiable)
- Tenant model: organizations.id ONLY
- Canonical data:
  - gc_commerce.* (orders, carts, inventory)
  - catalog_v2.* (products, pricing)
- All inventory changes must go through RPCs
- Payments must reconcile exactly with DB truth
- No mock/demo/fallback data allowed
- No implicit or derived writes
- UI must reflect persisted state only

---

## Build Rules (Strict)

### 1. Follow the Plan Exactly
- Only implement items listed in the /plan
- Do not introduce new behavior
- Do not infer missing behavior
- If the plan is incomplete → STOP and return BLOCKED

---

### 2. Canonical Write Path Enforcement
All writes MUST follow:

UI → API / server action → RPC / service → DB

Forbidden:
- Direct DB writes from UI
- Multiple write paths to the same data
- Shadow writes
- Writing to derived/read-only views

If a write path in the plan is unclear → STOP

---

### 3. No Schema Drift
You may:
- Use existing tables
- Use existing columns
- Use existing RPCs

You may NOT:
- Create new columns
- Create new tables
- Change column types
- Add new RPCs

Unless explicitly instructed by /plan and accompanied by /migrate.

---

### 4. Data Integrity First
Ensure:
- inventory cannot go negative
- order totals are consistent
- no partial writes
- idempotent behavior where required

If required RPCs or constraints are missing → STOP and report missing dependency.

---

### 5. UI Truth Enforcement
- UI must reflect persisted data only
- No optimistic fake success states
- No temporary placeholders that imply success
- No silent failures

---

### 6. Error Handling
All new flows must:
- surface errors
- not swallow exceptions
- return meaningful responses

No `try/catch` without rethrow or user-visible error.

---

### 7. Logging & Observability
Log:
- critical writes
- failures
- payment events
- inventory mutations

Do not spam logs with noise.

---

## Required Implementation Procedure

### Step 1: Restate Scope
Restate exactly what will be built based on the /plan.

If scope differs from /plan → STOP.

---

### Step 2: File Change Plan
List:
- new files
- modified files
- untouched areas

Do this BEFORE writing code.

---

### Step 3: Implement in Layers (Strict Order)
1. Backend domain logic / RPC wiring
2. API routes / server actions
3. UI integration
4. Error handling & logging
5. Type safety & validation

Do NOT reverse this order.

---

### Step 4: Respect Existing Contracts
- Do not change existing RPC signatures
- Do not change response shapes without plan approval
- Do not change tenancy filters

---

### Step 5: Guardrails & Assertions
Add:
- assertions for critical assumptions
- explicit checks for invalid state
- hard failures instead of silent degradation

---

## Required Output Format

### BUILD SUMMARY
- Feature:
- Based on plan:
- Scope implemented:

### FILE CHANGES
- Added:
- Modified:
- Deleted:

### WRITE PATHS CONFIRMED
- [User Action] → API → RPC → DB

### READ PATHS CONFIRMED
- [UI Surface] → Query Source → DB

### DATA INTEGRITY
- Checks implemented:
- Invariants enforced:

### ERROR HANDLING
- Where errors are surfaced:
- Logging added:

### DEVIATIONS FROM PLAN
- (If any — otherwise state “None”)

### BLOCKERS (If Any)
- Missing RPCs:
- Missing constraints:
- Missing schema elements:

### BUILD STATUS
- BUILD COMPLETE: YES / NO
- If NO: Reason + required fix

---

## Enforcement Rules
- If the /plan is insufficient → BLOCK
- If canonical write path is unclear → BLOCK
- If schema change is required but not approved → BLOCK
- If build would introduce duplicate truth → BLOCK
- If tenant enforcement is unclear → BLOCK

Do not ship half-built or unsafe work.
