# Product Matching Agent — Architecture

## Goal

Improve duplicate detection and master product matching for CatalogOS. Match normalized supplier products to existing master products with clear confidence, reason, and candidate list; detect possible duplicate masters; route uncertain matches to review. Rules first, AI second; never silently merge.

## Data flow

1. **Match run** (manual or triggered): Select scope (batch or all pending staged rows). Create `product_match_run`, load normalized rows and master products by category.
2. **Matching** (rules-first): For each staged row, run signal pipeline — UPC exact → strong attribute match → fuzzy title. Produce suggested_master_id, confidence, reason, candidate_list (top N with scores), duplicate_warning.
3. **Duplicate detection**: Within same category, find master pairs with very similar attributes + title; store in `product_duplicate_candidates`. When a match suggests a master that has a duplicate pair, set duplicate_warning.
4. **Persist**: Write `product_match_candidates` per row; optionally update `supplier_products_normalized.match_confidence` and `master_product_id` only when confidence ≥ threshold and no duplicate_warning (configurable).
5. **Review**: Admin sees match run detail and candidates requiring review; can approve match, create new master, merge duplicates, or reject. All actions use existing review flow (approveMatch, createNewMasterProduct, rejectStaged) and optional merge-duplicates API.

## Tables

- **product_match_runs**: id, batch_id (optional), scope (batch | all_pending), status, started_at, completed_at, stats (total, matched, uncertain, no_match, duplicates_found), config, created_at.
- **product_match_candidates**: id, run_id, normalized_id, suggested_master_product_id, confidence, reason, candidate_list JSONB, duplicate_warning, requires_review, created_at. One per normalized row per run (or latest per run).
- **product_duplicate_candidates**: id, run_id (optional), product_id_a, product_id_b, score, reason, status (pending_review | merged | dismissed), created_at.

## Matching signals (rules-first)

- UPC exact → reason upc_exact, confidence 0.98
- Brand + category + material + size + color + thickness_mil + powder + grade + packaging + case_qty (+ compliance / work glove attrs where relevant) → attribute_match, confidence from weighted score
- Fuzzy title fallback → fuzzy_title, cap confidence (e.g. 0.75)
- No match → reason no_match, suggested_master_id from best candidate if any (for review)

## Integration with review queue

- **Approve match** / **Create new master** / **Reject**: Use existing review actions (`approveMatch`, `createNewMasterProduct`, `rejectStaged`) on the staged row; match run detail links to review and offers "Approve match" when a suggested master exists.
- **Merge duplicates**: New action merges two master products (move supplier_offers from B to A, deactivate B); then marks duplicate candidate as `merged`.
- **Dismiss duplicate**: Mark duplicate candidate as `dismissed` (no merge).
- **Re-run matching**: Run matching again (e.g. scope all_pending) to refresh candidates as the master catalog grows; use "Mark for reprocessing" on a staged row to clear its match so it is re-matched on next run.

## Principles

- **Rules first, AI second**: All scoring is deterministic from signals; AI can be added later for ambiguous cases only.
- **Never silently merge**: Duplicate pairs and low-confidence matches require human review.
- **Auditable**: reason and candidate_list stored; admin can see why a match was suggested.
- **Re-runnable**: New run overwrites or versions match candidates for the same normalized rows; staging can be updated when re-running as catalog grows.
