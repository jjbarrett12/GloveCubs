# Phase 1 / 1A staging test sequence

Do **not** apply these migrations to production until staging evidence is captured.

## Prerequisites

1. Phase 0 merged to `main` (`edf8988` or successor).
2. Phase 1 branch rebased onto updated `main` if `main` moved.
3. Isolated staging database (copy or ephemeral).
4. Orphan report reviewed (`scripts/sql/tenant-orphan-report.sql`) — **do not invent ownership**.

## Password-reset compatibility

| Deploy order | Behavior |
|--------------|----------|
| Migrate (incl. `203`+`205` claim cols) then old Express | New resets still write/read via service_role; in-flight plaintext scrubbed at `203` (users re-request). Old app without claim columns fails inserts that set `claim_*` only after Phase 1A app — so **migrate then deploy Phase 1A app**. |
| Phase 1A app before migrate | Inserts referencing `token_hash` / `claim_id` fail — **blocked**. |
| Required | **DB migrations first**, then Express with claim/consume/release. |

Migration-first is safe for the **old** app only until Phase 1A app deploys claim fields; scrub of plaintext is intentional.

## Sequence

1. Merge Phase 0 → `main`.
2. Rebase Phase 1 (+1A) onto `main` if needed.
3. Refresh isolated staging DB.
4. Run orphan report; review counts/samples.
5. Apply migrations in order through `20261227120500`.
6. Deploy Phase 1A application (Express + CatalogOS onboarding auth).
7. Express password-reset smoke: success, fail-and-retry, replay, concurrent.
8. JWT tenant-isolation matrix (anon, A/B roles, removed, admin).
9. Supplier-cost tests: tables + legacy views (`cost` NULL; internal view denied).
10. Storage signing tests (admin / token / wrong token).
11. Security Advisor + `scripts/sql/security-advisor-audit.sql`.
12. Roll back staging on critical failure.
13. Merge Phase 1 only after evidence is stored (not part of this `/build`).

## Incident suspend triggers

Cross-tenant success, anon private-table access, supplier-cost exposure, unauthorized file sign, service-role in client, Advisor critical exposed table.
