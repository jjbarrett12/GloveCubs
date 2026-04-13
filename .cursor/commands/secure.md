---
description: Security & integrity review — tenancy, money, inventory, webhooks, idempotency
---

# Skill: secure-glovecubs-feature

## Purpose
Perform a strict security and integrity review for GloveCubs features, workflows, and infrastructure changes before they are considered production-ready.

This skill exists to identify vulnerabilities, trust gaps, abuse paths, and integrity failures in the GloveCubs ecommerce platform.

It must verify that:
- tenant isolation is preserved
- money cannot be tampered with
- inventory cannot be manipulated outside canonical controls
- privileged actions are constrained
- replay, duplication, and webhook abuse are mitigated
- user-visible success cannot occur without persisted truth

This is not a generic “security best practices” skill.
This is a GloveCubs-specific production hardening skill.

If critical vulnerabilities or integrity failures are found, the feature is NOT secure.

---

## Use this skill when
- a meaningful feature has been built
- checkout, pricing, cart, account, inventory, Stripe, admin, or vendor workflows changed
- new API routes, RPCs, server actions, or webhook handlers were added
- a release candidate needs security validation
- tenant-sensitive or money-sensitive logic has changed

---

## Do NOT use this skill when
- requirements are still being brainstormed
- no implementation exists yet
- doing cosmetic UI review only
- debugging a single non-security bug
- doing release backup/rollback checks only (that belongs in /ship)

---

## System Context (Non-Negotiable)
- Tenant model: organizations.id ONLY
- Canonical commerce schema: gc_commerce.*
- Canonical catalog schema: catalog_v2.*
- No clients/accounts as tenant keys
- No mock/demo/fallback data
- No split-brain truth
- All critical writes must follow controlled canonical paths
- Inventory mutations must remain atomic
- Payment truth must reconcile exactly with order truth
- UI must not imply success without persisted state
- Service-role usage must be narrow, intentional, and auditable

---

## Security Objectives
A valid security review must determine all of the following:

1. Can a user access or affect another organization’s data?
2. Can a user manipulate money, pricing, quantities, or totals?
3. Can inventory be bypassed, oversold, or mutated outside canonical logic?
4. Can duplicate or replayed actions create duplicate effects?
5. Can privileged APIs, admin routes, or service-role code be abused?
6. Can webhooks or external callbacks be spoofed or replayed?
7. Can the UI create false confidence by showing success before durable persistence?
8. Are critical state transitions protected against invalid or malicious input?

If these cannot be answered clearly, security review is incomplete.

---

## Required Security Review Procedure

### Step 1: Identify attack surfaces
List every relevant surface touched by the feature:

- public UI entry points
- authenticated user flows
- admin surfaces
- API routes
- server actions
- RPCs / SQL functions
- webhook handlers
- background jobs / cron tasks
- Stripe callbacks
- file upload paths
- invoice / document ingestion paths
- internal service-role code paths

Do not review only the happy path.
Review every place an attacker, buggy client, duplicate request, or stale browser can hit.

---

### Step 2: Review tenant isolation
Verify:

- every tenant-bound table uses organization_id correctly
- every query is constrained to organization_id where required
- no legacy client_id or account_id logic remains
- RLS assumptions are valid
- server-side code does not accidentally bypass tenant boundaries
- service-role code does not fetch or mutate cross-org data without explicit constraint
- joins do not accidentally widen visibility across orgs

Check both read and write paths.

Fail immediately if:
- another org’s rows could be read
- another org’s rows could be mutated
- tenant ownership can be inferred from client-supplied IDs without verification

---

### Step 3: Review authorization and privilege boundaries
Verify:

- privileged routes require appropriate auth
- admin-only actions are not exposed to standard users
- server actions do not trust client claims about role or organization
- organization membership is resolved from trusted backend context
- service-role usage is minimal and justified
- no sensitive action depends only on hidden UI rather than backend enforcement

Fail if:
- authorization exists only in frontend
- route assumes user belongs to org because UI says so
- role checks are missing or weak
- service-role code can mutate too broadly

---

### Step 4: Review money integrity
For all pricing, cart, checkout, and order flows, verify:

- client cannot supply final authoritative price
- totals are recomputed or verified server-side
- discounts, shipping, taxes, fees, and totals are controlled
- Stripe amount matches persisted authoritative order truth
- currency mismatches are blocked
- duplicate charge protection exists
- payment failure does not create paid-looking state
- paid state is not granted before trusted confirmation

Check for:
- hidden fields
- manipulable request bodies
- stale client totals
- mismatched item prices
- direct order creation with fabricated totals

Fail if:
- money truth is client-controlled
- Stripe and DB can disagree without block/hold
- payment success can be spoofed by client-side flow alone

---

### Step 5: Review inventory integrity and abuse resistance
Verify:

- all inventory mutations occur through canonical RPCs or controlled server logic
- direct updates do not bypass reservation logic
- inventory cannot go negative
- reserve / release / deduct lifecycle is enforced
- duplicate checkout or retry cannot double-deduct inventory
- abandoned or failed payment paths release inventory correctly
- race conditions are handled safely

Check:
- multi-tab checkout
- duplicate requests
- webhook arriving after retry
- partial failure after reservation
- direct admin override paths

Fail if:
- inventory can be mutated outside canonical flow
- quantity can go negative
- duplicate requests can over-deduct
- reservation state can become orphaned or stuck without detection

---

### Step 6: Review replay, duplication, and idempotency
Verify for all critical side effects:

- duplicate request handling exists where needed
- idempotency keys or equivalent protections exist for payment-sensitive or order-creating actions
- webhook events are deduplicated
- retries do not create extra orders, extra reservations, extra charges, or extra audit events
- client double-click / multi-submit is safe

Check:
- create order
- reserve inventory
- deduct inventory
- apply payment confirmation
- create invoice / receipt records
- vendor or supplier-triggered responses if applicable

Fail if:
- same action can create multiple durable side effects
- webhook replay can mutate state twice
- duplicate submissions create duplicate rows or financial effects

---

### Step 7: Review webhook and external callback security
Verify:

- Stripe signatures are validated
- only trusted event types are processed
- event payloads are not trusted blindly
- event handling is idempotent
- order/payment matching uses trusted identifiers
- delayed or out-of-order events do not corrupt final state
- webhook endpoints do not expose sensitive debug info

Check:
- payment_intent succeeded
- failed / canceled payments
- refund / dispute flows if applicable
- duplicate webhook delivery

Fail if:
- signature validation is missing or weak
- untrusted payload fields are treated as truth
- replayed webhooks can re-run side effects
- out-of-order delivery can mark wrong final state

---

### Step 8: Review input validation and tampering resistance
Verify:

- all inputs are validated at trusted boundaries
- quantities cannot be negative, zero where invalid, or absurdly large
- IDs are not trusted without ownership checks
- uploads are constrained by type/size where relevant
- free-form text cannot break internal assumptions
- enum/state transitions are validated server-side
- users cannot submit impossible combinations of state

Check:
- quantity updates
- cart operations
- address/contact forms
- promo/discount input
- file uploads
- admin action payloads

Fail if:
- invalid inputs can create durable bad state
- raw client input flows directly to privileged logic
- state transitions can be forced illegally

---

### Step 9: Review read-path security and UI trust
Verify:

- sensitive fields are not exposed unnecessarily
- UI does not reveal internal IDs or cross-org metadata improperly
- success states reflect real persisted outcomes
- optimistic UI reconciles against backend truth
- errors are surfaced instead of hidden
- stale caches do not show privileged or wrong-tenant data

Fail if:
- UI can show another org’s data
- fake success appears before durable persistence
- sensitive internal values are leaked
- stale state can mislead users in critical flows

---

### Step 10: Review operational security and observability
Verify:

- critical failures are logged
- payment and inventory mutations are traceable
- security-relevant events can be audited
- logs do not expose secrets, raw credentials, or sensitive payment material
- feature flags / env vars / secrets are not leaked to client code
- debug helpers are not accidentally enabled in production flows

Check:
- logs around checkout
- webhook logs
- inventory mutation logs
- auth / membership resolution logs
- admin action logs

Fail if:
- security-critical actions are unauditable
- secrets are exposed
- production behavior depends on debug-only assumptions

---

## Required Output Format

### SECURITY REVIEW SUMMARY
- Feature / Change:
- Review scope:
- Risk level: LOW / MEDIUM / HIGH / CRITICAL

### ATTACK SURFACES REVIEWED
- Public user flows:
- Authenticated flows:
- Admin flows:
- API routes:
- RPCs / SQL functions:
- Webhooks / callbacks:
- Service-role paths:
- Upload / ingestion paths:

### TENANT ISOLATION
- organization_id model preserved?:
- cross-org read risk:
- cross-org write risk:
- legacy tenant key leakage:
- Result: PASS / FAIL

### AUTHORIZATION / PRIVILEGE BOUNDARIES
- role enforcement quality:
- membership resolution trust:
- service-role exposure risk:
- frontend-only auth assumptions found:
- Result: PASS / FAIL

### MONEY INTEGRITY
- client price tampering risk:
- server-side recomputation / validation:
- Stripe reconciliation integrity:
- duplicate charge / mismatched payment risk:
- Result: PASS / FAIL

### INVENTORY INTEGRITY
- canonical mutation path preserved?:
- oversell / negative inventory risk:
- reservation lifecycle safety:
- duplicate deduction risk:
- Result: PASS / FAIL

### REPLAY / IDEMPOTENCY
- duplicate submit protection:
- webhook dedupe protection:
- repeated side-effect risk:
- Result: PASS / FAIL

### WEBHOOK / EXTERNAL CALLBACK SECURITY
- signature verification:
- trusted identifier matching:
- out-of-order event safety:
- replay resistance:
- Result: PASS / FAIL

### INPUT VALIDATION / TAMPERING
- quantity / amount validation:
- ownership validation:
- state transition validation:
- upload / payload constraints:
- Result: PASS / FAIL

### READ-PATH / UI TRUST
- sensitive data leakage risk:
- phantom success / false UI confidence:
- stale data risk:
- Result: PASS / FAIL

### OPERATIONAL SECURITY / OBSERVABILITY
- auditability:
- secret exposure risk:
- debug leakage risk:
- Result: PASS / FAIL

### CRITICAL VULNERABILITIES
- [list]

### HIGH-RISK ISSUES
- [list]

### MEDIUM-RISK ISSUES
- [list]

### REQUIRED FIXES BEFORE REVIEW PASSES
- [list]

### FINAL SECURITY DECISION
- SECURITY REVIEW PASSED: YES / NO
- READY FOR /REVIEW: YES / NO
- MUST FIX BEFORE PROCEEDING:
- SHOULD HARDEN SOON:
- RECOMMENDED NEXT COMMAND:

---

## Enforcement Rules
- Do not assume backend auth exists because frontend hides controls
- Do not assume service-role code is safe because it is server-side
- Do not trust client-supplied prices, totals, quantities, organization IDs, or role claims
- Do not pass payment-sensitive, inventory-sensitive, or tenant-sensitive flows without meaningful abuse analysis
- Do not treat “unlikely” abuse as acceptable if impact is high
- If cross-org access, money tampering, inventory bypass, replay vulnerability, or webhook spoofing is plausible, SECURITY REVIEW PASSED = NO
- If critical unknowns remain, SECURITY REVIEW PASSED = NO

You are not here to make the team feel better.
You are here to find how this could be abused, broken, or lied about before production does.
