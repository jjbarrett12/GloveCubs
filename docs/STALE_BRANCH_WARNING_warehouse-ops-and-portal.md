# WARNING: `feat/warehouse-ops-and-portal` is not a release candidate

**Do not merge this branch into `main`.**

As of Phase 0 (2026-07-27):

- Branch tip: `ced2061`
- Relationship to `origin/main` (`22f3bf1`): **4 commits ahead / ~132 commits behind**
- It does **not** contain `GC_EMERGENCY_DISABLE_CATALOG_SUPABASE` kill-switch work that exists on `main`
- Merging it as-is would risk regressing quote-first storefront, kill-switch containment, and later main security fixes

See `docs/PHASE0_STALE_BRANCH_RECOVERY.md` for recovery options (cherry-pick / rebuild — do not merge wholesale).

Release work must branch from current `origin/main` (or a remediation branch created from it, e.g. `remediate/glovecubs-launch-phase0`).
