# Extension state (staging `fmrupehx…`)

## Pre-fix (from failed push evidence)

| Check | Result |
| ----- | ------ |
| `pg_trgm` available | Assumed yes (Supabase default catalog; Management API token unavailable for live probe) |
| `pg_trgm` installed | **No** — `gin_trgm_ops` missing (`SQLSTATE 42704`) |
| Extension schema | n/a |
| `gin_trgm_ops` present | **No** |
| Operator-class schema | n/a |
| Migration search path | Not directly queried |

## Post `20260422102000` apply (runtime proof)

| Check | Result |
| ----- | ------ |
| `20260422102000_enable_pg_trgm.sql` | Applied |
| `20260422103000_storefront_search_catalogos_products.sql` | Applied (trigram index + similarity RPC created) |
| Conclusion | `pg_trgm` + `gin_trgm_ops` now resolve on staging |

## Next blocker (separate)

`20260422120000_product_favorites_catalog_uuid.sql` failed: `relation "public.product_favorites" does not exist`.
