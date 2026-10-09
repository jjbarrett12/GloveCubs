# Phase 0 — stale branch recovery report

## Branch

`feat/warehouse-ops-and-portal` @ `ced2061`

## Relationship to `origin/main`

| Metric | Value |
|---|---|
| Ahead of `origin/main` | 4 commits |
| Behind `origin/main` | ~132 commits |
| Kill switch on main | Present |
| Kill switch on warehouse branch | **Absent** |

## Commits unique to the warehouse branch

1. `38b3931` — feat(warehouse): native fulfillment migrations, admin receive/adjust, legacy write deprecation  
2. `99d1618` — feat(admin): operator order creation and Stripe payment portal links  
3. `18e5b12` — feat(quote-cart): prefill contact details from signed-in buyer company  
4. `ced2061` — chore: Railway deploy config, design doctrine, logo, catalog admin tests  

## Features worth preserving

- Warehouse fulfillment SQL RPCs / receipts / inventory adjust (`supabase/migrations/2026122412000*.sql`)
- Admin PO receive + inventory adjust UI (once modules compile against current main)
- Quote-cart contact prefill for signed-in buyers
- `lib/salesOrderPurchaseOrderSync.js` (idempotent PO sync helper — currently unused on Express paths)
- Legacy warehouse write deprecation helpers/tests

## Files that would overwrite or regress main

| Risk | Detail |
|---|---|
| Catalog kill switch | Warehouse branch lacks `store-products` / education-hub kill-switch guards present on main |
| Storefront tree | 132-commit gap; wholesale merge rewrites large areas of quote-first storefront |
| Migrations | Warehouse migrations may conflict with later main migrations; must apply carefully |
| Security | Older middleware/admin patterns may reintroduce metadata-based admin auth if any files regress |
| Quote-first flow | Payment-portal / order routes on the branch are incomplete relative to main’s module graph |

## Recommended recovery method

**Rebuild / cherry-pick selected commits onto current `main` in a separate recovery branch.**

Do **not**:

- Merge `feat/warehouse-ops-and-portal` into `main`
- Rebase the whole branch onto main in this Phase 0 task

Suggested order later:

1. Cherry-pick warehouse migrations onto a `recovery/warehouse-on-main` branch from latest main  
2. Port admin receive/inventory UI against current `get-admin-user` / module layout  
3. Port quote-cart prefill independently  
4. Leave Stripe payment-portal work for a later phase (out of Phase 0 scope)

## Phase 0 action taken

No recovery merge performed. Warning doc: `docs/STALE_BRANCH_WARNING_warehouse-ops-and-portal.md`.
