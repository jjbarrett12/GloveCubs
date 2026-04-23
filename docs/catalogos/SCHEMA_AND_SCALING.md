# CatalogOS — Schema Summary and Future Scaling

## Why each table exists

| Table | Purpose |
|-------|--------|
| **suppliers** | Master list of vendors we ingest from; slug for stable URLs; is_active for soft off-boarding. |
| **supplier_contacts** | Optional contacts per supplier for POs and communication; is_primary for default. |
| **supplier_feeds** | Per-supplier feed config (URL/CSV/API); schedule_cron for future automated runs. |
| **categories** | Product categories (disposable_gloves, etc.); drive attribute_definitions and filtering. |
| **brands** | Normalized brand names; master products reference by id to avoid duplication. |
| **attribute_definitions** | Per-category attribute schema (key, type, required, filterable); supports category-specific attributes. |
| **attribute_allowed_values** | Allowed values for filterable attributes (e.g. color, size); one of value_text or value_number. |
| **products** | Master product catalog; canonical SKU/name/category; is_active for soft deactivation; live_product_id links to public.products. |
| **product_attributes** | Normalized attribute values per product for indexing and matching (not just JSONB). |
| **product_images** | Multiple images per product; sort_order for gallery order. |
| **ingestion_jobs** | Top-level job (e.g. nightly run) that can spawn multiple import_batches. |
| **import_batches** | One per feed/run; root of traceability; stats hold raw_count, staged_count, error_count. |
| **import_batch_logs** | Per-batch step audit (ingest, normalize, match). |
| **ingestion_job_logs** | Job- or batch-level step logs when one job spans multiple batches. |
| **supplier_products_raw** | Immutable raw rows; full payload preserved; never overwrite; source for traceability. |
| **supplier_products_normalized** | Staging: normalized + extracted attributes; match_confidence; link to master; status pending/approved/rejected/merged. |
| **supplier_offers** | Many offers per master product; cost/lead time; raw_id/normalized_id for traceability; is_active for soft off. |
| **pricing_rules** | Margin or fixed price by default/category/supplier/product; priority for precedence. |
| **publish_events** | Audit of what was published when; normalized_id → product_id → live_product_id. |
| **review_decisions** | Audit of approve/reject/merge per normalized row; master_product_id when merged. |

## RLS notes

- **service_role** (backend) bypasses RLS in Supabase; use it for ingestion and publish.
- Policies in `20260311000003_catalogos_rls.sql` allow full access for `auth.role() = 'service_role'` or JWT claim `role = 'admin'`. Adjust the admin check to your auth (e.g. `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`).
- If you do not need RLS for internal-only CatalogOS, you can skip the RLS migration or disable RLS and rely on app-level auth.

## Future scaling

1. **Tenancy**  
   Add `tenant_id UUID` to suppliers, import_batches, products, etc., and scope all queries. Use partial indexes and RLS by tenant.

2. **Partitioning**  
   - `supplier_products_raw`: partition by `created_at` (e.g. monthly) or by `batch_id` (hash) for very large batches.  
   - `import_batch_logs` / `ingestion_job_logs`: partition by `created_at` for retention and fast range scans.

3. **Archiving**  
   Move old raw/normalized rows to an `archive` schema or cold storage after publish_events exist; keep only batch metadata and publish_events for traceability.

4. **Matching**  
   For large master catalogs, use `product_attributes` + GIN on `products.attributes`; consider a dedicated matching table (candidate_set) populated by a job instead of ad-hoc similarity in app code.

5. **Idempotency**  
   Use `(batch_id, supplier_id, external_id)` on raw and idempotent keys on publish (e.g. normalized_id + product_id) to avoid duplicate publishes.

6. **Concurrency**  
   Use `SELECT ... FOR UPDATE SKIP LOCKED` when claiming pending normalized rows for review; use batch status transitions (running → completed) with conditional updates to avoid double-processing.

7. **Indexes**  
   Add composite indexes for hot paths (e.g. review queue: status + created_at; offer lookup: product_id + is_active). Monitor slow queries and add covering indexes where needed.
