# CatalogOS — Phased Implementation Plan

## Phase 1 (current)

- **DB**: All CatalogOS tables + seed attribute definitions for disposable gloves.
- **Types & validation**: TypeScript domain types, Zod schemas for ingest/publish/staging.
- **Ingestion**: POST /api/ingest with `supplier_id` + `csv_rows` or `url` → raw → normalize (disposable gloves rules) → staging → match to master (UPC, then attributes).
- **Matching**: UPC first, then SKU, then attribute similarity; confidence score stored.
- **Pricing**: `computeSellPrice` with rules (default 35% margin); pricing_rules table.
- **Review**: Dashboard list/detail for staging; PATCH /api/staging/:id for approve/reject.
- **Publish**: POST /api/publish with `staging_ids` → ensure master + supplier_offers → upsert products + manufacturers.

**Run Phase 1**: Apply migrations in repo `supabase/migrations` (20260310000001, 20260310000002). Create a supplier (e.g. via SQL or API). POST to /api/ingest with supplier_id and csv_rows. Review in dashboard, approve, then POST /api/publish.

## Phase 2

- Feed scheduling (cron or external trigger).
- AI fallback for attribute extraction when rules leave gaps.
- Confidence tuning and anomaly detection (e.g. price/cost outliers).
- Full pricing rules UI and rule priority.

## Phase 3

- Multi-category expansion (industrial gloves, safety glasses, etc.) and attribute definitions per category.
- SourceIt reuse: extract CatalogOS as a package or duplicate pattern for another brand.
- Nightly feed sync automation.
