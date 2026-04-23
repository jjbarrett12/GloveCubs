# Catalog Expansion Agent — Architecture

## Goal

Continually expand and maintain the catalog by comparing current supplier feed rows to prior state: detect **new**, **changed** (title, pricing, packaging, availability), and **missing** (discontinued candidates). Route results into review/publish workflows; do not silently overwrite published product or offer data.

## Data flow

1. **Sync run** (schedule or manual): select feed(s), create `catalog_sync_run`, fetch feed, parse rows.
2. **Prior state**: for each feed/supplier, load latest *completed* import_batch and its raw + normalized rows keyed by `external_id`.
3. **Compare**: current parsed rows vs prior → **new** (in current, not prior), **missing** (in prior, not current → discontinued candidate), **changed** (in both, diff).
4. **Change detection**: for changed rows, compute diff (title/content, cost, normalized_case_cost, case_qty, packaging, availability); emit **product_change_events** and **supplier_offer_change_events** where applicable.
5. **Persist**: `catalog_sync_item_results` per row (result_type, prior_raw_id, prior_normalized_id, change_summary); **discontinued_product_candidates** for missing; optional **product_change_events** / **supplier_offer_change_events** for audit.
6. **Review**: admin sees sync run detail and item results; can approve change (e.g. create new staging row or update offer via existing publish flow), reject, or mark discontinued.

## Tables

- **catalog_sync_runs**: feed_id, supplier_id, status, started_at, completed_at, stats (new_count, changed_count, missing_count), config (e.g. auto_approve_safe).
- **catalog_sync_item_results**: run_id, external_id, result_type (new | changed | unchanged | missing), prior_raw_id, prior_normalized_id, current_batch_raw_id (if full ingest was run), change_summary JSONB, requires_review boolean.
- **product_change_events**: optional event log (run_id, product_id or normalized_id, event_type, payload).
- **supplier_offer_change_events**: run_id, offer_id, event_type (cost_change, sell_price_change), old_value, new_value.
- **discontinued_product_candidates**: run_id, supplier_id, external_id, prior_normalized_id, prior_raw_id, status (pending_review | confirmed | false_positive), resolved_at.

## Principles

- **Traceability**: every result links to prior_raw_id / prior_normalized_id where applicable.
- **No silent overwrite**: price and packaging changes require review (or explicit auto_approve_safe); publish flow remains the single path to update live product/offer.
- **Align with review/publish**: new/changed items can create new staging rows (normalized) for existing review queue; discontinued candidates get a dedicated resolution path.
