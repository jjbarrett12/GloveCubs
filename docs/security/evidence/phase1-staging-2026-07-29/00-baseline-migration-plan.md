# Phase 1 staging — baseline migration plan

Date: 2026-07-29  
Target: GloveCubs Staging `fmrupehxifzkpfphiyvm`  
Branch: `remediate/glovecubs-phase1-tenant-security` @ `d7109a1`  
Source of truth: `supabase/migrations/*.sql` through `origin/main` @ `22f3bf1` (201 files), then Phase 1 (6 files).

## BASELINE MIGRATION PLAN

| Order | Migration | Required dependency | Included | Reason |
| ----: | --------- | ------------------- | -------: | ------ |
| 1–201 | All `supabase/migrations/*.sql` with timestamp `< 20261227120000` | Prior migrations in lexical order | Yes | Matches migration count at `22f3bf1` (201). Establishes blank-project schema without inventing tables. |
| 202 | `20261227120000_gc_commerce_tenant_access_helpers.sql` | Baseline `gc_commerce` | Phase 1 | Tenant helpers |
| 203 | `20261227120100_gc_commerce_rls_tenant_isolation.sql` | 20000 | Phase 1 | Commerce RLS |
| 204 | `20261227120200_revoke_public_supplier_cost_access.sql` | Supplier objects | Phase 1 | Cost lockdown |
| 205 | `20261227120300_password_reset_token_hash_rls.sql` | `password_reset_tokens` | Phase 1 | Hashed tokens |
| 206 | `20261227120400_phase1_grant_and_cost_hardening.sql` | Prior Phase 1 | Phase 1 | Grants/cost |
| 207 | `20261227120500_phase1a_security_blockers.sql` | Prior Phase 1 | Phase 1 | Phase 1A corrections |

Excluded: warehouse-branch-only migrations (none in this stack beyond shared `22f3bf1` baseline).  
Excluded from baseline push: the six Phase 1 files (held aside, then applied separately).

## Safety

- Linked project ref verified: `fmrupehxifzkpfphiyvm`
- Denylist: `mnmagwsenzvetwngaszv`, `kfrizyygvcjbomxdrdal`
- No production data copy
