# Commerce Packaging QA — Phase 2E

End-to-end smoke and backfill verification for `CommercePackagingV1` (case/pallet customer-facing sell units).

## A. Apply migration

Ensure filter seeds and box/pack filter disable are applied:

```bash
supabase db push --include-all --yes
```

**Remote GloveCubs V2** (`mnmagwsenzvetwngaszv`): migration `20260609120000_commerce_packaging_v2_filters.sql` was applied (June 2026). Other environments must run the same push before expecting storefront filter counts for `units_per_case`, `cases_per_pallet`, or `pallet_pricing_available`.

Local file check (no DB connection):

```bash
node scripts/verify-commerce-packaging-migration.mjs
```

Migration: `supabase/migrations/20260609120000_commerce_packaging_v2_filters.sql`

- Seeds `units_per_case`, `cases_per_pallet`, `pallet_pricing_available`
- Sets `is_filterable = false` for `box_quantity` and `pack_quantity`
- Idempotent inserts/updates only — no destructive DDL

After push, confirm attribute definitions exist:

```bash
node scripts/verify-commerce-packaging-migration.mjs
```

Expect `units_per_case`, `cases_per_pallet`, and `pallet_pricing_available` with `is_filterable = true` before storefront sidebar filter counts populate. `case_quantity` may remain filterable in DB; storefront code treats `units_per_case` as authoritative and hides legacy `case_quantity` from customer UI.

## B. Run targeted tests

From repo root:

```bash
cd storefront
npx vitest run ../lib/commerce-packaging/extract.test.ts
npx vitest run ../lib/commerce-packaging/product-backfill.test.ts
npx vitest run src/lib/admin/commerce-packaging-editor.test.ts
npx vitest run src/lib/catalog/store-product-commerce.test.ts
npx vitest run src/lib/quote-cart/commerce-line.test.ts
cd ..
node --test tests/commerce-packaging-phase2e.test.js
```

## C. Run audit (read-only)

```bash
npx tsx scripts/audit-commerce-packaging-coverage.mjs
npx tsx scripts/audit-commerce-packaging-coverage.mjs --csv
```

Optional CSV: `tmp/commerce-packaging-coverage.csv`

SQL helper (read-only, run in Supabase SQL editor):

`supabase/sql/audit_commerce_packaging_coverage.sql`

## D. Dry-run backfill

Default mode — no writes:

```bash
npx tsx scripts/backfill-commerce-packaging.mjs
```

## E. Apply limited backfill

```bash
npx tsx scripts/backfill-commerce-packaging.mjs --apply --limit 10
```

Single product:

```bash
npx tsx scripts/backfill-commerce-packaging.mjs --apply --product-id <UUID>
```

Force overwrite existing `metadata.commerce_packaging` (use sparingly):

```bash
npx tsx scripts/backfill-commerce-packaging.mjs --apply --force --product-id <UUID>
```

## F. Manual admin smoke

1. Stage a disposable glove URL (e.g. Hospeco-style nitrile exam glove).
2. Confirm **Case & Pallet Setup** panel appears above the fold in CatalogOS review.
3. Confirm parser fills units per case where possible.
4. Confirm missing pallet fields show warnings (not hard failures unless publish blockers apply).
5. Confirm publish blockers behave correctly for incomplete pallet pricing.

## G. Storefront smoke

1. Product card shows `/case` and units per case.
2. PDP **Case/Pallet** toggle works when pallet is configured.
3. Quote cart line label says **case** or **pallet** per `sell_unit`.
4. No **stock** filter on storefront.
5. No **sold-as** filter.
6. No **box/pack purchase unit** filter (internal packaging only).

## Constraints (do not regress)

- No GLV SKU logic changes
- Single shared parser (`lib/commerce-packaging/extract.ts`)
- Single staging model (`CommercePackagingV1`)
- Case/pallet only as customer-facing sell units (box/pack/dozen/pair remain internal)

## Follow-up (out of scope for 2E)

- CatalogOS inline edit panel (review panel is read-only today)
- Variant-specific pallet pricing
- Full Hospeco URL size/SKU parser phase
