# Local staging baseline test certification (2026-07-20)

Ephemeral Postgres = throwaway Supabase projects (Docker unavailable on operator host).
Tracked `supabase/migrations/` was **not** modified.

## Environment

```text
REPOSITORY SHA: 3497fba28abe051f27cd5f4b522b2b2601136eb2
APPLICATION SHA: 7e12aad9ac6c9f2930592d354ed26da8f96b3cef
SUPABASE CLI VERSION: 2.109.1
LOCAL POSTGRES AVAILABLE: NO (Docker/WSL absent)
EPHEMERAL EQUIVALENT: YES (GloveCubs Schema Test A/B)
STAGING PROJECT REF: fmrupehxifzkpfphiyvm
PRODUCTION PROJECT REF: mnmagwsenzvetwngaszv
SAME PROJECT: NO
```

## Manifest hashes

| Manifest | Count | First | Last | SHA-256 of MANIFEST.txt |
| -------- | ----: | ----- | ---- | ----------------------- |
| A (exclude 203/204/invite) | 199 | `20260302000001_…` | `20261218120200_…` | `288D3B21AA6B670CF528B3D3119A29A185AC7DCFEC7E0A872D201734603F0CB1` |
| B (exclude invite only) | 201 | `20260302000001_…` | `20261218120400_…` | `B19941DA51ABFF5BEF01ED58290BBC2991F2216D66F36FA24EB4365233440B86` |

Workdirs (untracked, outside repo): `C:\dev\glovecubs-schema-test-proposed`, `C:\dev\glovecubs-schema-test-contiguous`.

## Late PO-receive review

| Migration | Data mutation | Destructive | Customer exposure | Required dependency | Safe inert passenger |
| --------- | ------------: | ----------: | ----------------: | ------------------- | -------------------: |
| `20261218120300_admin_po_receive_hardening.sql` | YES (updates PO + inventory when RPC called) | Low (additive cols + SECURITY DEFINER RPC) | NO (service_role only after revoke) | `public.purchase_orders`, `inventory` from earlier lineage | YES if unused |
| `20261218120400_admin_po_receive_rpc_grants.sql` | NO | NO | NO (REVOKE anon/authenticated; GRANT service_role) | Function from 203 | YES |

## Manifest A result

```text
MANIFEST A APPLIED: NO
FILES EXPECTED: 199
FILES RECORDED IN HISTORY: 73 (through 20260404000011)
FIRST FAILURE: 20260422103000_storefront_search_catalogos_products.sql
ERROR: operator class "gin_trgm_ops" does not exist for access method "gin" (SQLSTATE 42704)
MANUAL SQL USED: NO
INVITATION ABSENT: YES (not in manifest)
```

Classification: **migration defect / missing extension prerequisite** — no prior migration runs `CREATE EXTENSION pg_trgm`.

## Manifest B result

```text
MANIFEST B APPLIED: NO
FILES EXPECTED: 201
FILES RECORDED IN HISTORY: 73 (through 20260404000011)
FIRST FAILURE: 20260422103000_storefront_search_catalogos_products.sql
ERROR: function similarity(text, text) does not exist (SQLSTATE 42883)
MANUAL SQL USED: NO (only pre-enable CREATE EXTENSION pg_trgm as env probe)
INVITATION ABSENT: YES
```

Note: With `pg_trgm` pre-enabled, GIN index creation passed, but `similarity()` still failed because the function’s `search_path` is `public, catalogos` and extension functions may live under `extensions`. Root fix remains: migration must `CREATE EXTENSION IF NOT EXISTS pg_trgm` (prefer `SCHEMA public`) before trigram ops/functions.

## Preferred baseline (after fix)

```text
PREFERRED MANIFEST: B (contiguous through 20261218120400)
REASON: PO-receive migrations are safe inert passengers; contiguous history; invitation can follow next; no repair/quarantine
CONTIGUOUS HISTORY: YES
REMOTE REPAIR REQUIRED: NO (once chain applies)
TEMPORARY FILE QUARANTINE REQUIRED: NO for B; YES only if excluding 203/204 (discouraged)
```

## Staging dry-run (no apply)

```text
DRY-RUN TARGET: fmrupehxifzkpfphiyvm
DRY-RUN MIGRATION COUNT: 202
FIRST MIGRATION: 20260302000001_companies_and_members.sql
LAST MIGRATION: 20261220120000_gc_commerce_company_invitations.sql
INVITATION INCLUDED: YES
PRODUCTION REF OBSERVED: NO
SAFE REMOTE MANIFEST: NO
```

Unconstrained `db push` from the canonical migration directory would apply invitations + PO-receive and would hit the same `pg_trgm` failure on empty staging.

## Required /fix before staging apply

Minimal defect to correct in `20260422103000_storefront_search_catalogos_products.sql` (or a tiny prerequisite migration immediately before it):

1. `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;` (or ensure `extensions` is on `search_path` for search RPCs).
2. Re-prove Manifest B from empty ephemeral DB with **zero** manual SQL.
3. Then invitation-following + reset reproducibility.
4. Then staging apply of Manifest B only (exclude invitation until invite workstream).

## Gates

```text
STAGING ISOLATION: YES
LOCAL BASELINE: FAIL (blocked at 20260422103000)
REMOTE DRY RUN: PARTIAL (listed 202; not a safe manifest)
SAFE TO APPLY BASELINE TO STAGING: NO
STAGING EMAIL: NO
SAFE TO APPLY INVITATION MIGRATION: NO
SAFE TO RUN AUTHENTICATED SMOKE: NO
```
