# Skill: audit-existing-glovecubs-system

## Purpose
Run a hostile, production-grade system audit for GloveCubs.

This skill audits the CURRENT implementation for:
- structural coherence
- canonical truth alignment
- production trustworthiness
- hidden drift
- fake behavior
- unsafe plumbing
- customer-facing risk

This is not a compliment pass.
This is not a code summary.
This is a decision-grade trust audit.

If critical trust violations are found, the system is NOT SAFE TO PROCEED.

---

## Use this skill when
- auditing the current state before building further
- deciding whether a feature is truly done
- validating production readiness
- investigating drift, split-brain, fake UI, broken onboarding, checkout risk, or inventory/payment trust
- preparing for /refactor, /migrate, /test, /secure, or /ship

---

## Do NOT use this skill when
- brainstorming features
- writing code
- planning a future implementation from scratch
- reviewing purely cosmetic design changes with no workflow or persistence impact

---

## Project Context
GloveCubs is a glove ecommerce platform where trust matters across:

- catalog truth
- inventory truth
- pricing truth
- checkout truth
- Stripe/payment truth
- organization tenancy truth
- admin safety

Canonical direction:
- tenant key = organizations.id
- commerce domain = gc_commerce.*
- catalog domain = catalog_v2.*
- inventory mutations must be DB-backed and safe
- no fake data in production paths
- no duplicate write truths
- no legacy split-brain tolerated in active flows

---

## Required Audit Procedure

### Step 1: Identify actual canonical tenant model
Determine what tenant key is actually active in current reads and writes.
Do not rely on intention alone.

### Step 2: Identify canonical write paths
Map actual write paths for critical workflows:

- cart update
- checkout
- payment confirmation
- order creation
- inventory reservation/release/deduct
- admin inventory adjustment
- user/org association
- login/session continuity where relevant

For each, map:
UI / caller → API/service → RPC/function → table write

### Step 3: Identify canonical read paths
Map actual read paths for major displayed truths:

- catalog data
- stock availability
- cart totals
- checkout totals
- order state
- payment state
- admin inventory values
- membership/org context

For each, map:
Displayed value → query source → canonical or derived

### Step 4: Audit split-brain and drift
Identify:
- duplicate tables
- duplicate write paths
- alternate tenant keys
- shadow truths
- legacy bridges acting like primaries
- active write risks vs dead residue

### Step 5: Audit workflow trust
Audit end-to-end integrity of:
- browsing catalog
- viewing stock
- cart updates
- checkout
- payment
- order creation
- admin inventory adjustment
- company/user association
- login/session continuity where relevant

### Step 6: Audit production hardening
Check:
- constraints
- foreign keys
- unique indexes
- idempotency protections
- nullability
- replay protection
- webhook trust
- performance-sensitive indexes

### Step 7: Return a decision-grade verdict
Do not soften or hedge the final outcome.

---

## Audit Scope
Unless the user explicitly narrows scope, audit all critical trust surfaces:

### A. Tenancy and auth
- Is organizations.id the real tenant key everywhere?
- Are there remnants of client, account, company_id split-brain?
- Are user→organization relationships canonical and deterministic?
- Are admin routes overly permissive?
- Is there auth/user/profile mapping drift?

### B. Catalog and product data
- Canonical source of product truth
- Variant / sellable product shape
- Legacy product shadow structures
- Image/data field drift
- pricing derivation integrity
- MAP/floor/min-margin logic if present

### C. Inventory and fulfillment
- Are reservation/release/deduct flows atomic?
- Are inventory quantities derived consistently?
- Is there possibility of double reservation or orphan reserve?
- Are admin inventory writes bypassing the safe path?
- Is stock visibility consistent with actual mutation logic?

### D. Cart and checkout
- Canonical cart table/service
- Duplicate cart systems
- Unit price vs derived line total consistency
- Stale totals risk
- Retry/idempotency behavior
- guest vs org-buyer flow correctness, if applicable

### E. Orders and payments
- Canonical order tables
- Total calculations
- Taxes/shipping persistence
- Stripe payment intent integrity
- amount/currency mismatches
- webhook verification and replay handling
- partial success/failure states

### F. APIs / RPCs / services
- Signature mismatch
- Unused or dead RPCs
- Server actions writing to non-canonical tables
- Parallel write paths
- legacy bridges that became accidental primaries
- invalid update chains

### G. UI / UX truthfulness
- fake placeholders
- mock/demo fallbacks
- optimistic UI without durable write success
- pages that look complete but are not backed by real persisted behavior
- admin views showing derived or stale data as canonical

### H. Schema / integrity / performance
- missing constraints
- missing foreign keys
- bad nullability
- missing unique indexes
- absent idempotency constraints
- weak check constraints
- poor indexing on critical commerce lookups

---

## Evidence Standard
For every important conclusion, label it as one of:
- PROVEN
- INFERRED
- UNVERIFIED

Rules:
- PROVEN = directly supported by code, schema, or explicit behavior evidence
- INFERRED = likely based on surrounding evidence, but not directly proven
- UNVERIFIED = could not be confirmed from available evidence

Do not present inferred conclusions as proven facts.

---

## Hard Fail Conditions
If ANY of the following are found, final verdict cannot be SAFE TO PROCEED:

- active alternate tenant key in critical flow
- duplicate write truth for inventory, cart, order, or payment state
- payment amount can diverge from authoritative order truth
- inventory mutation can bypass canonical safe path
- UI success state can appear without durable persistence
- webhook replay or duplicate submit can create duplicate durable effects
- auth/membership resolution is nondeterministic in active flows
- active legacy bridge functions as accidental primary

---

## Required Output Format

# SYSTEM AUDIT REPORT

## 1. Executive verdict
Choose one:
- SAFE TO PROCEED
- SAFE TO PROCEED WITH FIXES
- NOT SAFE TO PROCEED

Blunt summary:
- ...
Evidence confidence:
- mostly proven / mixed / limited

## 2. Canonical tenant model
- Actual tenant model found:
- Evidence status: PROVEN / INFERRED / UNVERIFIED
- Drift present:
- Verdict:

## 3. Critical truths audit
For each, mark:
- Healthy
- At risk
- Broken

For each, include evidence status.

Audit:
- tenant truth
- product truth
- price truth
- inventory truth
- cart truth
- order truth
- payment truth
- membership/auth truth

## 4. Canonical write path map
For each critical workflow:
- workflow:
- caller/UI:
- API/service:
- RPC/function:
- table write(s):
- canonical or duplicated?:
- evidence status:

## 5. Canonical read path map
For each major displayed truth:
- displayed value:
- query/read source:
- canonical or derived:
- stale/fake risk:
- evidence status:

## 6. Violations found
For each violation include:
- severity: Low / Medium / High / Critical
- affected area
- exact nature of problem
- evidence status
- likely user/business impact
- likely fix direction

## 7. Split-brain / drift findings
Explicitly list:
- duplicate tables
- duplicate write paths
- legacy bridges acting like primaries
- alternate tenant keys
- shadow truths

For each finding, classify as:
- dead residue
- read-only bridge
- active write risk
- accidental primary

## 8. Fake / misleading behavior findings
List every mock, placeholder, fake fallback, optimistic lie, or UI deception.

## 9. Workflow integrity audit
Audit the real end-to-end reliability of:
- browsing catalog
- viewing stock
- cart updates
- checkout
- payment
- order creation
- admin inventory adjustment
- company/user association
- login/session continuity where relevant

## 10. Productionization gaps
List what still must be hardened before real customers.

## 11. Recommended fix order
Prioritize by business risk, not aesthetics.

## 12. Recommended next command
Choose one:
- /refactor
- /migrate
- /build
- /test
- /secure

---

## Audit Behavior Rules
- Be aggressive
- Prefer hard truths over politeness
- Do not accept “works locally” as evidence
- Do not assume a route is safe because the UI looks good
- Treat silent fallback logic as suspicious
- Treat duplicate data ownership as dangerous
- Treat money and stock flows as high stakes
- Distinguish proven from inferred
- Default to NO when critical trust cannot be established

---

## Special Instruction
If the user asks whether a feature is “done,” do not answer based on UI appearance.
Answer based on:
- persisted truth
- invariant safety
- testability
- operational trust