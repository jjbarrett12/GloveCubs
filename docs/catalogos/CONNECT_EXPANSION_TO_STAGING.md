# Connect Catalog Expansion to Staging / Review / Publish

## Goal

When a catalog sync run detects new, changed, or missing/discontinued items, the system creates **actionable review records** and feeds the existing catalog workflow instead of stopping at diff results.

## Data flow

1. **Sync run** (existing): Fetch feed, compare to prior, write `catalog_sync_item_results` with `result_type` (new/changed/unchanged/missing), `change_summary`, and **current_snapshot** (parsed row for new/changed) for promotion.
2. **Approve + promote (new/changed)**: Admin approves a sync item result → **promotion service** creates a sync-promotion batch (one per run), inserts raw row from `current_snapshot`, runs normalization, inserts `supplier_products_normalized` (staged, pending), links `promoted_normalized_id` and sets `promotion_status = promoted`. Idempotent: if already promoted, skip create.
3. **Staged row metadata**: Promoted rows carry `source_sync_result_id` / `prior_normalized_id` in normalized_data for traceability; require review before publish.
4. **Discontinued confirmed**: Admin confirms a discontinued candidate → **discontinued service** sets `supplier_offers.is_active = false`, `discontinued_at`, `discontinued_reason` for offers linked to that prior normalized row; audit preserved.
5. **Operations command center**: Single page aggregating pending sync approvals, staged review backlog, discontinued confirmations, duplicate master warnings, failed runs/feeds.

## Schema additions

- **catalog_sync_item_results**: `current_snapshot` JSONB (parsed row for new/changed), `promoted_normalized_id` UUID, `promotion_status` (pending | promoted | rejected). Unique constraint or guard so one promoted row per sync item.
- **supplier_offers**: `discontinued_at` TIMESTAMPTZ, `discontinued_reason` TEXT.
- **import_batches**: Used for sync-promotion batches (supplier_id, no feed_id, status completed) for raw rows created from sync promotion.

## Principles

- **Idempotent promotion**: Same sync item approved twice → same staged row; `promotion_status` and `promoted_normalized_id` prevent duplicate staged rows.
- **Traceability**: Prior raw_id / normalized_id and source sync result stored; no silent overwrite of catalog data.
- **Clear statuses**: pending → promoted / rejected; discontinued pending_review → confirmed_discontinued with offer updates.

## Audit notes

- **Promotion**: Each promoted row has `normalized_data.source_sync_result_id`, `prior_normalized_id`, `prior_raw_id`, `promotion_from` (new|changed). Raw rows created in a sync-promotion batch (import_batches with `stats.source = 'sync_promotion'`, `stats.sync_run_id`).
- **Discontinued**: `supplier_offers.discontinued_at` and `discontinued_reason = 'catalog_sync_confirmed'` record when and why an offer was deactivated; `is_active = false` prevents the offer from appearing in live catalog. Discontinued candidate row keeps `resolved_at`, `resolved_by`, `status = confirmed_discontinued`.
- **No silent removal**: Catalog data (products, product_attributes) is never deleted by expansion; only supplier_offers are soft-deactivated with audit fields.
