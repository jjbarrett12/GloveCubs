# Blank baseline remediation — migration history strategy

## Pin

Isolated staging project only (`fmrupehxifzkpfphiyvm`). Production / GloveCubs V2 were not contacted.

## Rules

1. Never rewrite shipped migration bytes once they may be applied on a shared project.
2. Blank-project blockers are fixed with **additive** migrations that sort before Phase 1.
3. Phase 1 files stay under `supabase/migrations/` and remain **unapplied** until an explicit apply gate.

## Additive fixes

| Version | Purpose |
| ------- | ------- |
| `20260506110000` | Create `sales_prospects` before procurement FK |
| `20260707115000` / `20260707121000` | Drop/restore favorites RLS around UUID convert |
| `20260924115900` | Drop leftover triggers on dead products table before `20260924120000` |
| `20261218120401` | DO-block grants for `_full_atomic` and/or `_full` (CLI 2.75 safe) |
| `20261218120402` | Canonicalize to `_full_atomic`; thin `_full` wrapper |

## CLI splitter (v2.75.0)

Identifiers containing `atomic` plus trailing multi-statement `COMMENT`/`GRANT` can yield `SQLSTATE 42601`. Prefer a single `DO` block with dynamic SQL for grant/rename compatibility work. Restored historical `20261218120300` / `20400` still contain static multi-statement `atomic` identifiers — blank pushes that re-apply those versions may still need psql/simple-query apply or a newer CLI; staging already applied modified forms and converges via `20401`/`20402`.

## Live shipment RPC

Admin UI calls `admin_receive_purchase_order_shipment_atomic`. No matching migration exists in this repository. Classified **OUT-OF-SCOPE WAREHOUSE FEATURE / CONFIRMED MISSING MIGRATION** for blank warehouse E2E — not invented in this remediation.
