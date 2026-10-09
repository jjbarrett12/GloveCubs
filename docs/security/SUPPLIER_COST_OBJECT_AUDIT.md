# Supplier-cost object audit (Phase 1A)

| Object | Type | Cost-bearing fields | Prior grants | New grants | Public-safe |
|--------|------|---------------------|--------------|------------|-------------|
| catalogos.supplier_offers | table | unit_cost, … | public read (removed Phase 1) | admin SELECT/ALL; service_role | No |
| catalogos.offer_trust_scores | table | trust scores | public read removed | admin SELECT | No |
| catalogos.suppliers | table | contacts/terms | public read removed | admin SELECT | No |
| catalog_v2.supplier_offers | table | unit_cost | mixed | service_role only | No |
| catalog_v2.v_products_legacy_shape | view | `cost` was min_unit_cost | broad | authenticated SELECT; **cost = NULL** | Yes (cost nulled) |
| public.products_legacy_from_catalog_v2 | view | via legacy shape | broad | authenticated; cost NULL | Yes |
| catalog_v2.v_products_legacy_shape_internal | view | supplier_unit_cost | n/a (new) | service_role only | No |
| gc_commerce.sellable_products | table | unit_cost_minor | authenticated SELECT | column revoke (Phase 1 `204`) | Partial |
| gc_commerce.v_audit_* margin views | views | margin/cost | service_role | revoke anon/authenticated | No |
| catalogos.supplier_raw_rows_missing_normalized | function | raw payloads | authenticated EXECUTE revoked Phase 1 | service_role | No |

Customer-visible sell prices remain via approved pricing RPCs/list prices — not supplier unit cost.
