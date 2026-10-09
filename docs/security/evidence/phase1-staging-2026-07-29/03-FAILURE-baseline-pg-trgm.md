# Staging test failure — baseline migration incomplete

## Decision

`FAILED — REQUIRES DEBUG`

## Exact error

```
Applying migration 20260422103000_storefront_search_catalogos_products.sql...
ERROR: operator class "gin_trgm_ops" does not exist for access method "gin" (SQLSTATE 42704)
At statement: CREATE INDEX IF NOT EXISTS idx_catalogos_products_name_trgm
  ON catalogos.products USING GIN (name gin_trgm_ops)
```

## Cause

Blank staging Postgres lacks extension `pg_trgm` (provides `gin_trgm_ops`). Production/V2 already has it; repository migration `20260422103000` assumes the operator class exists and does not `CREATE EXTENSION IF NOT EXISTS pg_trgm`.

## Transaction / partial state

- Failed migration **not** recorded remotely (rolled back for that file).
- Prior migrations **are** applied through `20260404000011` inclusive.
- Phase 1 migrations (`20261227120000`–`20500`) **not** applied.
- Staging is in a **partial baseline** state (not empty, not complete).

## Linked project

`fmrupehxifzkpfphiyvm` (GloveCubs Staging) — production/V2 was not targeted.

## Recommended `/debug` actions

1. On staging only: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (or add a pre-`20260422103000` repo migration that does this for blank-project bootstraps).
2. Re-run `supabase db push` against `fmrupehx…` until baseline complete.
3. Then apply Phase 1 migrations.
4. Optionally reset the staging database if a clean empty re-push is preferred.
5. Re-run `/test`.

Do **not** work around by weakening RLS or skipping the trigram index.
