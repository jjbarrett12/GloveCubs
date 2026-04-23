# Multi-Select Attributes and Price Refactor

## Summary

- **Multi-select storage**: One row per `(product_id, attribute_definition_id, value_text)` for multi-select attributes (e.g. `industries`, `compliance_certifications`). Single-select remains one row per `(product_id, attribute_definition_id)`.
- **Sync**: Single-select: delete existing rows for that attribute, insert one. Multi-select: delete existing, insert one row per value (deduped, no stale).
- **Price**: Storefront uses **sell price** (best available offer); `supplier_offers.sell_price` when set, else `cost`. Price bounds and filters use this.

## Migration (20260319000001)

1. **product_attributes**
   - Drop `UNIQUE (product_id, attribute_definition_id)`.
   - Add unique index `(product_id, attribute_definition_id, COALESCE(value_text, ''))` so multiple rows per product/attribute are allowed when `value_text` differs.
   - Data migration: split existing comma-separated `value_text` for `industries` and `compliance_certifications` into one row per value; delete the old rows.

2. **supplier_offers**
   - Add `sell_price` (nullable). Backfill `sell_price = cost` where null. Storefront uses `COALESCE(sell_price, cost)`.

## Sync (product-attribute-sync.ts)

- **Single-select**: `delete().eq("product_id", ...).eq("attribute_definition_id", ...)` then `insert` one row.
- **Multi-select**: same delete, then `insert` array of rows, one per value (unique values only).

## Query and facets

- **Filtering**: `product_attributes` filtered by `attribute_definition_id` and `value_text .in(values)` (one row per value; OR within attribute).
- **Facet counts**: Count by `value_text` per row (no comma-splitting).
- **Price**: All price logic uses `offerPrice(row)` = `row.sell_price ?? row.cost` for bounds, filter, sort, and `best_price`.

## Publish validation

- **Required** attributes block publish; error message lists missing required.
- **Strongly preferred** attributes only add warnings (stageSafe); publish still succeeds.
