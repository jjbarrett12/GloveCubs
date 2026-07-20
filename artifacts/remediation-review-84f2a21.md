# WS-R1 — Remediation review (`remediate/quote-first-pilot`)

**Reviewed tip (pre-fix):** `84f2a21958fb1df7d54c17b71896328446b28ea3`  
**Base:** `32d039f` (origin/main historical)  
**Worktree:** `C:/dev/Glovecubs-quote-first-pilot`  
**Date:** 2026-07-20  

## Verdict

**CONDITIONAL APPROVE for PR → main after post-review hardening commit lands.**

Do **not** start controlled pilot until Gates 1–3 ops/staging items below are green. Code tip is merge-ready for quote-first pilot *features* once review fixes are included; payment/warehouse remain parked.

## Scope reviewed

Diff surfaces: catalog credibility filters, orphan quote linkage, company invites (migration + APIs + UI), a11y, portal terminology, admin leads search, park/deferred docs. Dirty `C:/dev/Glovecubs` was not used.

## Tests cited

- Prior tip: storefront vitest **191 files / 1292 passed** (documented in remediation plan).
- Post-review hardening: `admin-company-invite.test.ts` + `admin-company-member-write.test.ts` — **24 passed**.

## Findings (severity-ordered)

### Fixed in follow-up hardening (block → resolved)

| Sev | Finding | Resolution |
|-----|---------|------------|
| High | Orphan linkage used case-sensitive `.eq("email")` while quotes could store mixed case | `.ilike("email", normalized)` + quote-request insert now lowercases email |
| High | `revokeCompanyInvite` not scoped to `companyId` | Revoke requires `companyId` match |
| High | Already-member check used `listUsers` page 1 only | Per-member `getUserById` email compare |
| Med | Concurrent accept could fail on unique `(company_id, user_id)` | Treat `23505` as idempotent success |
| Med | Invite accept swallowed quote-link errors | Log + `warning` / `quotes_linked_count` in response |

### Accepted residual risks (do not block PR; do block broad signup)

| Sev | Finding | Disposition |
|-----|---------|-------------|
| High (pilot risk) | Email-only orphan link can attach quotes across companies if same email later joins another company | **Accepted for quote-first pilot** — email is the continuity key; Gate 6 RLS/design must revisit before broad signup |
| Med | Admin create-invite API returns raw token (for copy link UX) | **Accepted** — admin-only surface; do not expose to buyers |
| Med | Warehouse/inventory modules present on tip while Gate 7 parked | **Accepted for compile integrity** — incomplete `main` imports required modules; no warehouse launch; Gate 7 still NO-GO |
| Info | Invite migration file present in repo; **not applied** on remote DBs | Ops/staging gate (WS-R3) — not a code defect |

### False positive from automated review

- “Missing invitations schema in changeset” — incorrect; migration exists at `supabase/migrations/20261220120000_gc_commerce_company_invitations.sql`.

## Missing proof (still required before pilot start)

1. Production catalog operator unpublish (WS-R2) — live `/store` free of `GLV-LAUNCH*` / `SKU · UNKNOWN`.
2. Staging: apply invite migration + real-DB smoke for linkage + invite accept/revoke (WS-R3).
3. Browser persona smoke at 375/1440 (WS-R4).

## Gate snapshot after review

| Gate | Status |
|------|--------|
| 0 Release truth | PASS (clean WT; tip on remediation branch) |
| 1 Credible storefront | CONDITIONAL — code PASS; ops PENDING |
| 2 Quote continuity | CONDITIONAL — code PASS; staging DB PENDING |
| 3 Onboarding / invites | CONDITIONAL — code PASS; migrate+E2E PENDING |
| 4–5 Portal / admin | PASS on tip |
| 6–8 | NO-GO / parked |

## Approve / block list

**Approve to open PR** once hardening commit is on branch.  
**Block pilot start** until WS-R2 + WS-R3 + WS-R4 evidence is recorded.  
**Block payment/warehouse merge** unchanged.
