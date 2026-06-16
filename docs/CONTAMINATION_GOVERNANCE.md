# Contamination governance (fake / smoke / demo data)

Operational trust requires **real procurement evidence only** in production and staging. This document defines detection, quarantine, and prevention rules. **Detection is read-only** — no automatic cleanup or KPI suppression until an approved slice runs.

## Policy

1. **Report before delete** — run the contamination report (Node and/or SQL) before any cleanup.
2. **Quarantine before delete** — operator review of flagged samples; confirm FK impact (orders, payments, audit).
3. **Never auto-tag production rows** — heuristics classify in memory only until an approved cleanup slice runs.
4. **Separate environments** — production Supabase must not receive load tests, e2e scripts, or `npm run seed`.
5. **No demo transactional inserts in migrations** — migrations must not INSERT demo users, orders, RFQs, or quotes. Legacy debt (e.g. `demo@company.com` in old migrations) is tracked for a future cleanup slice.

## Running the contamination report

**Prerequisites:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in repo-root `.env` (or exported in the shell).

### Console summary

```bash
npm run report:contamination
# or
node scripts/contamination-report.mjs
```

Prints per-table scanned/flagged counts, severity breakdown, and sample rows. **Does not modify data.**

### Export JSON (operator artifact)

```bash
node scripts/contamination-report.mjs --json --out=contamination-report.json
```

Use for review, diffing across environments, or attaching to cleanup tickets. **Do not commit** — `contamination-report.json` is gitignored.

### Export CSV (flagged samples only)

```bash
node scripts/contamination-report.mjs --csv --out=contamination-flagged.csv
```

**Do not commit** — `contamination-flagged.csv` is gitignored.

### Strict mode (CI / staging gate)

Exits with code 1 if any rows are flagged. Use after load tests on staging, not as a default unit test.

```bash
GC_CONTAMINATION_REPORT_STRICT=1 node scripts/contamination-report.mjs
# or
npm run report:contamination:strict
```

### SQL report (Supabase SQL Editor)

Run `scripts/sql/contamination-report.sql` section by section on staging or production. **SELECT only** — safe for read-only review. Pair with the Node report for cross-check.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `GC_CONTAMINATION_MAX_ROWS` | `2000` | Max rows scanned per table |
| `GC_CONTAMINATION_SAMPLE` | `8` | Sample rows printed per table |
| `GC_CONTAMINATION_REPORT_STRICT` | unset | Exit 1 when any flags found |

## Production / staging review workflow

1. **Identify target** — staging after load tests, or production before KPI trust decisions.
2. **Run Node report** — `npm run report:contamination` plus JSON export for the ticket.
3. **Run SQL bundle** — confirm counts in Supabase SQL Editor (especially large tables the Node script may sample-bound).
4. **Review samples** — check confidence/severity; treat `medium` (e.g. `GLV-*` SKUs) as manual review, not auto-delete.
5. **Document findings** — record flagged IDs, FK dependencies, and operator decision.
6. **Do not delete yet** — quarantine/review slice only after explicit approval.

### Before deleting anything

- [ ] JSON + SQL reports saved outside git
- [ ] Sample rows manually verified (not false positives)
- [ ] FK impact checked (orders → companies → users → payments)
- [ ] Staging dry-run completed if touching production-like data
- [ ] Rollback / audit trail plan documented
- [ ] No load tests or seeds running against the target during cleanup

## Detection tooling

| Tool | Purpose |
|------|---------|
| `lib/contamination-heuristics.js` | Canonical shared classifiers (scripts, tests, future admin KPI filters) |
| `scripts/contamination-report.mjs` | Read-only Node report (counts + samples + JSON/CSV export) |
| `scripts/sql/contamination-report.sql` | Read-only SQL bundle for Supabase SQL Editor |
| `storefront/src/lib/admin/contamination-filters.ts` | Admin exclusion helpers (**not wired to UI yet**) |

## Heuristic markers (non-exhaustive)

- **Emails:** `demo@company.com`, `@glovecubs-test.com`, `@test.local`, `loadtest*`, `test-e2e-*`, `test-*`, `@example.com`, `matrix*@test.local`
- **Companies:** `Demo Company Inc`, `LoadTest Company*`, `Test Company LLC`, `Legacy orders (no company)`, slug `legacy-no-company-backfill`
- **Catalog:** `demo-product-*`, `test-product*`, product type `gc_demo_gloves`, supplier `sample-supplier`
- **Orders:** `MATRIX-*`, `LEGACY-*`, `LEGACY-MATRIX*`, `CONC-*`, `INV-*`, `REL-*`, `R6ADD-*`, `LEG-*` order numbers
- **Products:** placeholder image hosts (`via.placeholder.com`), seed `GLV-*` SKUs (**medium confidence — manual review**)
- **Smoke text:** `Commerce Truth Smoke`, `Load test quote submission`, `rec-duplicate-test-*`

## Seed rules

| Mechanism | Rule |
|-----------|------|
| `seed.js` | **Dev only** unless `SEED_ALLOW=1`. Never set `SEED_ALLOW=1` in production. |
| SQL seeds in `storefront/scripts/seed-sample-catalog-products.sql` | **Manual dev/staging only** — never run on production. |
| **Migrations** | Must not INSERT transactional demo users/orders/RFQs. Legacy demo-user migration is known debt. |

## Load-test / smoke rules

| Script | Rule |
|--------|------|
| `load-tests/**` | **Staging only. Never against production.** Uses `@glovecubs-test.com` and creates real RFQs/quotes. |
| `scripts/test-payment-flow.js`, `scripts/e2e-test.js` | Localhost or disposable DB only. |
| `scripts/staging-commerce-truth-smoke.mjs` | Requires `GC_SMOKE_CONFIRM_STAGING=1` for non-localhost. |

## Environment isolation

- **Production:** dedicated Supabase project; no k6, no seed, no e2e writers, no load tests.
- **Staging:** may hold synthetic data; run contamination report after load tests.
- **Local:** `npm run seed` acceptable with dev credentials only.

## Git / repo artifacts

### `database_backup.json`

Legacy JSON snapshot containing **real PII and demo credentials**. It must not be tracked or committed.

- Listed in `.gitignore`.
- Removed from the git index with `git rm --cached database_backup.json` (local file may remain for operator migration work).
- **Do not commit** new DB dumps to the repo.

**Git history note:** Past commits may still contain `database_backup.json`. Removing it from the index does **not** purge history. Full PII/secrets remediation (history rewrite, secret rotation, incident response) is a **separate security decision** — coordinate with your security/process owner; do not auto-rewrite history in application builds.

### Generated reports

- `contamination-report.json` — gitignored; operator artifact only.
- `contamination-flagged.csv` — gitignored; operator artifact only.

## Cleanup phases

| Slice | Scope |
|-------|--------|
| **1** | Detection + reporting (complete) |
| **1A** | Stop tracking PII artifact + operational report docs (complete) |
| **2** | Admin KPI suppression using `contamination-filters.ts` (complete) |
| **3** | Quarantine planning artifacts — executes nothing (complete) |
| **4** | Operator-approved cleanup execution |
| **5** | Prevention guardrails (migration fixes, CI strict mode, seed hardening) |

## Detection vs suppression vs deletion

| Stage | What happens | Mutates data? |
|-------|----------------|---------------|
| **Detection** | `contamination-report.mjs` / SQL bundle classify rows | No |
| **Suppression (Slice 2)** | Admin dashboard KPI cards exclude high-confidence test/demo rows; banner shows excluded count | No |
| **Deletion (future)** | Operator-approved cleanup after quarantine review | Yes — separate slice |

### Admin KPI suppression behavior

- **Trusted counts** on `/admin` and `/admin/analytics` exclude rows matching `shouldExcludeFromAdminKpi` (definite/high confidence, or `exclude_from_kpi` action).
- **Banner `flaggedVisibleTotal`** counts definite/high flagged rows across scanned domains (including suppliers) — aligns with strict report mode.
- **`kpiExcludedTotal`** may differ from the banner when flagged rows are outside KPI cards (e.g. suppliers) or when orders have payment signals (excluded from KPI but still flagged).
- **Medium-confidence** matches (e.g. seed `GLV-*` SKUs) are **not** excluded from KPIs — flagged for manual review only.
- **Orders with Stripe/payment/invoice signals** are flagged for visibility but **never** excluded from KPI counts automatically and **never** auto-delete-safe.
- Each metric exposes internal metadata: `total_count`, `trusted_count`, `excluded_test_count`, `scan_complete`.
- **B2B tier mix** excludes demo/load-test companies from tier totals.
- **Recent quote requests** on the dashboard may show a “Likely test/demo” label but are **not hidden**.

### Heuristic confidence levels

| Confidence | KPI exclusion | Cleanup |
|------------|---------------|---------|
| **definite** | Usually yes | Manual review; never auto-delete orders with payment signals |
| **high** | Usually yes | Manual review |
| **medium** | No (report only) | Manual review only — e.g. `GLV-*` seed SKUs |
| **low** | No | Ignore unless operator confirms |

### Why strict contamination may differ from KPI exclusions

Strict report mode fails when **any** row is flagged. KPI cards exclude only rows passing `shouldExcludeFromAdminKpi`. Suppliers, medium-confidence rows, and payment-linked orders may appear in strict/report output but not reduce KPI card totals.

### Conservative order handling

Orders are classified using `order_number` patterns (`MATRIX-*`, `LEGACY-*`, `CONC-*`, etc.), company backfill slug (`legacy-no-company-backfill`), and `metadata` JSON — **not** a `notes` column. Any order with `stripe_payment_intent_id`, `payment_confirmed_at`, or non-trivial invoice fields is flagged **`manual_review` only** and is never auto-delete-safe.

### Why raw rows may still appear

Detail lists (`/admin/leads`, `/admin/companies`, etc.) still show all rows so operators can audit before cleanup. Suppression applies to **aggregate KPI cards only**.

### Before cleanup (deletion)

Always run a full contamination report on the target environment first:

```bash
npm run report:contamination
node scripts/contamination-report.mjs --json --out=contamination-report.json
```

Review samples, FK impact, and document operator approval before any delete slice.

## Quarantine planning (Slice 3 — planning only)

Generates operator-reviewed cleanup **candidates** without executing anything.

```bash
# 1) Detection report
node scripts/contamination-report.mjs --json --out=contamination-report.json

# 2) Quarantine plan (reads report; writes JSON + CSV)
npm run plan:contamination-quarantine

# 3) FK / reference review in Supabase SQL Editor
#    scripts/sql/contamination-quarantine-review.sql
```

Artifacts (`quarantine-plan.json`, `quarantine-plan.csv`) are gitignored operator outputs.

### How to review `quarantine-plan.json`

1. Check `meta.partialTables` — if present, re-run report with higher `GC_CONTAMINATION_SAMPLE` before execution.
2. Review `summary.byCleanupRisk` — no row in `never_auto_delete` should proceed to automated cleanup.
3. For each `candidates[]` entry verify: `table`, `id`, `entityLabel`, `reasons`, `blockingSignals`.
4. Run SQL review bundle sections for FK counts before approving any archive/delete.
5. Record operator approval outside git (ticket/runbook).

### Cleanup risk classes

| Risk | Meaning |
|------|---------|
| `safe_to_archive_later` | May archive after FK check — **never auto-run** |
| `manual_review_required` | Operator must approve; check FK/PII/payments |
| `never_auto_delete` | Blocked from automated cleanup (users, paid orders, medium confidence) |
| `kpi_exclude_only` | Operational KPI suppression only — no delete path |
| `ignore_reference_data` | Legacy reference rows — no cleanup action |

### What should never be auto-deleted

- Users and admin operators (auth/identity review required)
- Orders with Stripe, payment confirmation, or invoice signals
- Any **medium-confidence** classification (e.g. `GLV-*` SKUs, `sample-supplier` at medium)
- Rows with unresolved FK dependents (orders → companies → members)
- Contact messages (PII)

### Handling orders

All flagged orders default to **manual review**. Payment/invoice/Stripe signals upgrade to **`never_auto_delete`**. Cleanup execution slice must re-verify each order individually — matrix/legacy naming alone is not sufficient to delete.

### Handling PII

Quotes, contact messages, and user records may contain real or test PII. Quarantine plans **propose** operations only. Redaction/export for security incidents is a separate process from catalog cleanup.

### Handling suppliers and products

- **`sample-supplier`**: manual review + FK check (`contamination-quarantine-review.sql` §3)
- **`test-product` / `demo-product-*`**: may be `safe_to_archive_later` only after variant/image FK counts are zero
- **`glovecubs-legacy-catalog`**: `ignore_reference_data` — do not delete without catalog migration plan

### Staging vs production

| Environment | Rule |
|-------------|------|
| **Staging** | Run full report + quarantine plan after load tests; may execute cleanup first |
| **Production** | Report + plan + SQL FK review mandatory; dual-operator approval; no automated delete slice without staging dry-run |

### Cleanup phases

| Slice | Scope |
|-------|--------|
| **3 (this)** | Quarantine planning artifacts — **executes nothing** |
| **4 (future)** | Operator-approved cleanup execution (one candidate at a time) |

## Tests

```bash
npm run test:contamination
npm run test --prefix storefront -- contamination-filters.policy
```

Validates heuristics, quarantine planning, false-positive guards, read-only report guarantees, and admin KPI suppression. Strict report mode is **not** part of default test runs.
