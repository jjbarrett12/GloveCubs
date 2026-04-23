# URL Import System

Admin-controlled manufacturer/distributor URL import: paste a category or product URL → controlled crawl → extract products → infer families/variants → preview → stage into the existing GloveCubs import/review/publish pipeline.

## Architecture

- **Canonical path only:** Admin URL import for the catalog is **CatalogOS** (`/dashboard/url-import`, `POST /api/admin/url-import`, preview, selected `product_ids`, bridge → `import_batches` → …). The legacy Storefront admin page `/admin/product-import` **redirects** to CatalogOS when `NEXT_PUBLIC_CATALOGOS_URL` is set; `GET|POST /admin/api/product-import` returns **410** and does not ingest.
- **Admin entrypoint**: Dashboard `/dashboard/url-import` and `POST /api/admin/url-import`.
- **Controlled crawler**: Domain-restricted, max pages, content-hash skip for unchanged pages, no search/cart/account paths.
- **Product extraction**: Deterministic (OpenClaw parse + extract + normalize) first; AI fallback is optional and not invoked by default.
- **Family/variant inference**: Same rules as [VARIANT_FAMILY_INFERENCE.md](./VARIANT_FAMILY_INFERENCE.md): SKU suffix, title/specs, only-size-differs safety.
- **Bridge**: URL import products → `import_batches` + `supplier_products_raw` → existing normalize/match/stage/family-inference → `supplier_products_normalized` → review queue → publish.

## Crawl flow

1. Admin submits: supplier name, start URL, allowed domain (optional), crawl mode (single product / category), max pages.
2. System gets-or-creates supplier, creates `url_import_jobs` row, then:
   - **Single product**: Crawl only the start URL.
   - **Category**: Fetch start page, discover links (same domain, no blog/cart/login/search), classify product-like URLs, enqueue up to `max_pages`.
3. For each URL:
   - Fetch HTML (safe fetch, timeout, size limit).
   - Compute content hash; if same hash already seen for this job, mark page skipped (unchanged).
   - Parse (title, meta, JSON-LD, tables, text), extract product fields, normalize to ontology, expand variants (size/color) if present.
   - Store in `url_import_pages` (url, page_type, status, content_hash, extracted_snapshot) and `url_import_products` (raw_payload, normalized_payload, extraction_method, confidence, ai_used).
4. Run family inference on all products in the job; update `inferred_base_sku`, `inferred_size`, `family_group_key`, `grouping_confidence`.
5. Update job stats: pages_discovered, pages_crawled, pages_skipped_unchanged, products_extracted, family_groups_inferred, variants_inferred, failed_pages_count, warnings.

## Extraction flow

- **Deterministic**: OpenClaw `fetchAndParsePage` → `extractFromParsedPage` → `normalizeToOntology` → `groupVariants`. Fields: product_name, sku, brand, material, size, color, thickness_mil, powder, grade, box_qty, case_qty, images, etc.
- **Stored**: `url_import_products.raw_payload`, `normalized_payload` (shape compatible with pipeline `ParsedRow`), `extraction_method: 'deterministic'`, `confidence`, `ai_used: false`. AI fallback can be added later when key fields are missing or confidence &lt; threshold.

## Family and variant inference

- Uses the same logic as batch family inference: base SKU from size suffix (e.g. GL-N125FS → GL-N125F, S), size from title/specs or explicit field, family group key from base_sku + brand + material + thickness + color + grade + packaging.
- Only groups when confidence ≥ 0.85 and the only meaningful difference between rows is size (no merging when color/material/thickness/grade differ).
- Results written to `url_import_products.inferred_base_sku`, `inferred_size`, `family_group_key`, `grouping_confidence`.

## How the existing import pipeline is reused

- **Bridge** (on “Approve for import”): Reads `url_import_products` for the job, maps `normalized_payload` to `ParsedRow` (name, sku, cost, brand, material, size, etc.), then calls `runPipelineFromParsedRows(supplierId, feedId: null, rows)`.
- That creates an `import_batch`, inserts into `supplier_products_raw`, runs normalization, matching, pricing, anomaly flags, builds staging payloads, inserts into `supplier_products_normalized`, runs family inference for the batch, and optionally creates suggested offers. Rows land in the same review queue; publish uses the existing publish flow and canonical sync.

## Cost control strategy

- **Skip unchanged pages**: Content hash per page; if hash matches a previously crawled page in the same job, skip fetch/parse/extract.
- **Deterministic parsing first**: No AI call on every page; AI only when needed (future).
- **Cap pages per job**: `max_pages` (default 50, cap 500).
- **Admin-only**: All URL import APIs and dashboard are behind admin auth and rate-limited as expensive.
- **Controlled scope**: Only allowed domain; no breadth-first crawl of the whole site; no search/cart/account/marketing URLs.

## Allowed-domain restrictions

- Start URL must be HTTP/HTTPS and host must not be private/local.
- If `allowed_domain` is set, only links with that host (normalized, no www) are followed.
- Link discovery filters out blog, news, support, login, cart, checkout, account, search, etc.

## Preview and review flow

1. After crawl completes, open **Preview / Review** for the job (`/dashboard/url-import/[jobId]`).
2. Preview shows: products extracted, family groups inferred, failed pages, warnings, low-confidence count, sample transformed rows.
3. Actions: **Approve for import** (bridge all products to a new import batch) or later: reject page/row, mark rows separate, confirm grouped variants (UI can be extended).
4. After approve, redirect to the new batch; from there use existing review and publish.

## Manual test steps (first manufacturer URL)

1. **Create supplier (or use existing)**  
   - Ensure the supplier exists in catalogos (or will be created by name on first crawl).

2. **Open URL import**  
   - Go to `/dashboard/url-import` (admin).

3. **Submit a single product URL (safest first test)**  
   - Supplier name: e.g. `Test Manufacturer`  
   - Start URL: one product page URL (e.g. `https://example.com/gloves/nitrile-4mil-blue`)  
   - Allowed domain: leave blank or set `example.com`  
   - Crawl mode: **Single product page**  
   - Max pages: `1`  
   - Click **Crawl**.

4. **Wait for completion**  
   - Page may take 30–60 seconds; you are redirected to the job preview when done.

5. **Check preview**  
   - Products extracted: ≥ 1  
   - Sample rows show sku, name, size, family_group_key (or “ungrouped”)  
   - Failed pages: 0 (or note any).

6. **Approve for import**  
   - Click **Approve for import**  
   - You should be redirected to the new batch in `/dashboard/batches/[batchId]`.

7. **Verify in existing pipeline**  
   - In Batches, open the new batch; confirm raw and normalized counts.  
   - In Review, find the new staged rows; confirm they match the preview.  
   - Run family inference on the batch if needed (already run by pipeline).  
   - Publish as usual.

8. **Optional: category crawl**  
   - Start URL: a category listing URL  
   - Crawl mode: **Category page crawl**  
   - Max pages: e.g. `20`  
   - Run crawl, then preview and approve for import as above.

## Schema additions

- **catalogos.url_import_jobs**: id, supplier_id, supplier_name, start_url, allowed_domain, crawl_mode, max_pages, status, pages_*, products_extracted, family_groups_inferred, variants_inferred, failed_pages_count, warnings, import_batch_id, started_at, finished_at, created_at, created_by.
- **catalogos.url_import_pages**: id, job_id, url, page_type, status, content_hash, raw_html_length, extracted_snapshot, error_message, discovered_at, crawled_at.
- **catalogos.url_import_products**: id, job_id, page_id, source_url, raw_payload, normalized_payload, extraction_method, confidence, ai_used, inferred_base_sku, inferred_size, family_group_key, grouping_confidence, created_at.

## Limitations

- Only deterministic extraction is used; AI fallback is not implemented.
- Storefront still shows one product per variant; “other sizes” grouping in the UI is unchanged.
- Re-crawling the same job overwrites/extends pages and products; content hash only skips unchanged pages within the same run.
- No headless browser; pages that require JS to render product data may extract poorly.
