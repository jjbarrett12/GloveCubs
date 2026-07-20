# WS-R3 — Staging invite migration + smoke checklist

**Tip under test:** `0f73f3b` (`remediate/quote-first-pilot`)  
**Migration:** `supabase/migrations/20261220120000_gc_commerce_company_invitations.sql`  
**Agent rule:** Do **not** apply to production without ops sign-off. Staging first.

## Pre-flight

- [ ] Staging Supabase project identified and backed up / snapshot noted
- [ ] Confirm table `gc_commerce.company_invitations` absent (or already applied — skip re-apply)
- [ ] Apply migration via approved ops path (`supabase db push` / SQL console / CI migrate)
- [ ] Deploy storefront tip `0f73f3b` (or successor) to staging

## Smoke personas (real DB)

### A. Anon quote → signup linkage

1. Anonymous: add line to quote cart → submit quote with email `pilot-link+<ts>@example.com`
2. Sign up with **same email** (self-signup finalize)
3. Open `/account/quotes` — quote appears linked (`gc_company_id` set)
4. Admin `/admin/leads` — find by email; status linked

### B. Invite create / accept / revoke

1. Admin creates company + invite for `pilot-invite+<ts>@example.com`
2. Invitee signs up / logs in with that email → `/invite/[token]` → accept
3. Membership created; `/account` reachable; orphan quotes for that email linked if any
4. Create second invite → revoke via company-scoped revoke → accept fails
5. Wrong signed-in email → accept returns email mismatch (403)
6. Double-accept same token → idempotent success (no hard error)

### C. Negative / safety

- [ ] Revoke for company A cannot revoke invite id belonging to company B
- [ ] Mixed-case quote email still links after signup (`ILIKE` path)
- [ ] Accept response includes `quotes_linked_count` (and `warning` only if link failed)

## Evidence to attach

- Staging deploy SHA
- Migration apply timestamp / operator name
- Screenshots or API traces for A–B at **375** and **1440**
- Pass/fail table

## Current status (2026-07-20)

| Item | Status |
|------|--------|
| Migration in repo | YES |
| Migration applied on staging | **PENDING (ops)** |
| Real-DB smoke executed | **PENDING** |
| Gate 2 / Gate 3 | CONDITIONAL until above green |

## Agent deliverable

This checklist + unit coverage on tip. Remote apply and live staging smoke require operator credentials / staging env.
