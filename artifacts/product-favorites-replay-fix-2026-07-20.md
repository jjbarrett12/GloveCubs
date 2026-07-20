# Product favorites migration replay repair (2026-07-20)

## Verdict

`PRODUCT FAVORITES CORRECTED; NEXT MIGRATION DEFECT FOUND`

## Favorites proof

```text
PRODUCT FAVORITES MIGRATION PASSED: YES (20260422120000 applied on empty ephemeral DB)
SHAPE AT APPLY TIME: user_id=int8, product_id=uuid, created_at=timestamptz
MANUAL SQL USED: NO
```

## Next defect

```text
20260506120000_procurement_opportunities_spine.sql
ERROR: relation "public.sales_prospects" does not exist (SQLSTATE 42P01)
FK: sales_prospect_id BIGINT REFERENCES public.sales_prospects (id)
```

Applied 79 migrations through `20260504000001` before this failure.

## Manifest

```text
count: 203
first: 20260302000001_companies_and_members.sql
last: 20261219130000_product_favorites_canonical_assert.sql
hash: 815bdf29d077c5456af372e05a291923cdd656eed2c3fab8732b96bcdecf6c75
invitation excluded: YES
```

## Strategy used

Hybrid: early conversion migration creates UUID-product shape when table missing; later create migration converges to UUID (not legacy bigint); forward assert before invitations.
