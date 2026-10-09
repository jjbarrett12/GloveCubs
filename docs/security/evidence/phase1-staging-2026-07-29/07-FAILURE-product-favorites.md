# NEW FAILURE — product_favorites missing

After pg_trgm fix, continued partial baseline failed on:

`20260422120000_product_favorites_catalog_uuid.sql`

```
ERROR: relation "public.product_favorites" does not exist (SQLSTATE 42P01)
At statement: TRUNCATE TABLE public.product_favorites
```

## Applied through

- `20260422102000_enable_pg_trgm.sql` ✅
- `20260422103000_storefront_search_catalogos_products.sql` ✅
- `20260422120000` ❌ rolled back for this file

## Decision

`BLOCKED — NEW MIGRATION FAILURE`

Requires a separate `/debug` (or `/build`) for blank-project creation of `public.product_favorites` before truncate/alter — do not skip the migration.
