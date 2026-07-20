# Migration replay repair — pg_trgm (2026-07-20)

## Result

`pg_trgm` clean-room defect in `20260422103000` is corrected and proven on ephemeral empty DB.
Replay then stopped at the **next** historical defect:

```text
20260422120000_product_favorites_catalog_uuid.sql
ERROR: relation "public.product_favorites" does not exist (SQLSTATE 42P01)
```

`product_favorites` table is created later in `20260630150100_product_favorites_after_users.sql`, while `20260302000010` only documents the deferral. Fresh replay cannot ALTER a missing table.

## Proven

| Check | Result |
| ----- | ------ |
| Fresh apply through `20260422103000` | YES (75 migrations) |
| `pg_trgm` schema | `extensions` |
| `public.gc_trgm_similarity('a','a')` | `1` |
| Manual SQL | NO |
| Staging dry-run from baseline manifest | 202 files, no invitation, last=`20261219120000…` |

## Manifest

```text
hash: 75395458ce6e25d0cad21c6b5cd97c7cd1c4fc574275786182351ae6c3621a00
count: 202
first: 20260302000001_companies_and_members.sql
last: 20261219120000_pg_trgm_search_path_convergence.sql
excluded: 20261220120000_gc_commerce_company_invitations.sql
tool: scripts/build-quote-first-baseline-manifest.mjs
```
