---
description: Author forward-only Supabase migrations — ordering, RLS, tenancy, PostgREST-safe
---

# Skill: migrate-glovecubs-schema

## Purpose
Guide **safe, forward-only** database migrations for GloveCubs on Supabase/Postgres.

You are responsible for migrations that:
- preserve canonical tenancy (`organizations.id`)
- do not break existing queries, RPCs, or RLS
- remain auditable and reversible at the *process* level (forward files, documented rollback strategy)
- stay compatible with PostgREST (exposed columns, snake_case, stable RPC signatures)

You do **not** rewrite history: **never edit merged migration files**.

---

## When to use
- `/plan` or `/audit current schema` concluded schema change is required
- adding tables/columns/indexes/constraints/functions needed for commerce, catalog, or admin flows
- tightening integrity (FKs, uniques, checks) in a controlled way

## When not to use
- purely application-level change with no DB impact
- debugging data issues (use targeted scripts or admin tooling, not casual migrations)
- speculative schema “cleanup” without an approved plan

---

## Non-negotiables

1. **Forward-only files**  
   Add a new migration; do not modify old migration files that already shipped.

2. **Lexicographic ordering**  
   New migration filenames must sort **after** the latest existing migration in the repo.

3. **No breaking changes without a staged plan**  
   Prefer additive changes, backfills, then constraint tightening in separate deploy steps when needed.

4. **Tenancy**  
   Tenant-scoped tables must remain scoped by **`organization_id`** (canonical org tenancy). Do not introduce alternate tenant keys.

5. **PostgREST / RPC stability**  
   Do not rename or drop columns/functions that are still referenced until all callers are migrated. Prefer additive columns and deprecations with explicit follow-ups.

6. **RLS**  
   If you add tenant-bound tables or broaden access paths, migrations must include (or explicitly schedule) the **RLS policies** required for safe access. Never leave new sensitive tables wide open.

7. **Commerce integrity**  
   Money, inventory, and order state changes must respect existing invariants: no casual nullable amounts, no duplicate idempotency surfaces, no “shadow” order tables.

---

## Required procedure

### 1) Baseline discovery
- Locate the repo’s migrations directory and the **latest** migration timestamp/prefix.
- Identify affected schemas (`gc_commerce`, `catalog_v2`, `public`, etc.) from the plan.

### 2) Change design
- List exact DDL: tables, columns, types, defaults, FKs, uniques, checks, indexes.
- List exact DML backfills required (if any) and how you will verify row counts.

### 3) Rollout strategy
- Choose: single migration vs phased (add nullable → backfill → enforce NOT NULL / FK).
- Document **blast radius** and **application deploy order** (migrate before code vs code before migrate).

### 4) Verification checklist
- [ ] New filename sorts last
- [ ] Idempotent where practical (`IF NOT EXISTS` patterns where appropriate)
- [ ] No edited historical migrations
- [ ] Indexes for new query paths
- [ ] FKs reference correct canonical tables
- [ ] RLS/policy story is explicit
- [ ] No secrets in migration comments

---

## Output format

# MIGRATION PLAN
## Summary
- Goal:
- Schemas/tables touched:

## DDL / DML
- (ordered steps)

## RLS / policies
- (what changes, or explicit “none” with justification)

## Deploy order
- DB first / app first (explain)

## Verification
- SQL checks / counts / constraints to run after apply

## Risks
- What could go wrong in production

## Follow-ups
- Optional second migration for tightening constraints

---

## STOP conditions
Stop and request clarification if:
- required tables/columns/RPCs are not verified against existing migrations
- the plan would break checkout, pricing, inventory, or payment reconciliation
- tenancy model would become ambiguous
