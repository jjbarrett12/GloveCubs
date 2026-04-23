# GLOVECUBS — Catalog / Ingestion / Filtering / Launch Capability Audit

**Audit type:** Extensive catalog, ingestion, filtering, and launch capability audit  
**Scope:** Product ingestion, normalization, filter ontology, review, publish, and buyer catalog readiness  
**Date:** 2026-03-02

---

## Executive summary

**Core question:** Can GLOVECUBS reliably ingest, normalize, filter, review, and publish hundreds of glove products fast enough to support launch?

**Verdict:** **CONDITIONAL GO**

The platform has a **real ingestion and catalog stack**: dictionary-driven normalization, staging, matching, review, and publish with attribute sync to the live catalog. The **catalogos pipeline** (feed URL → raw → normalize → match → stage → approve → runPublish) is the path that gets products into the **buyer-facing catalog** with filters. Gaps that block “hundreds of products fast” are: **no bulk review actions**, **no row cap in URL-feed pipeline** (memory/performance risk), **POST /api/publish bypasses attribute sync** (products published that way lack facets), **URL-to-product (storefront admin) does not feed catalogos**, and **no end-to-end tests** for bulk ingest → review → publish → filter visibility.

**Realistic product count today:** **50–100** launch-ready products is achievable with current tooling and manual review. **250–500** is possible only after adding bulk approve, fixing the alternate publish path, and (if using URL ingest) a bridge into catalogos or consolidating on one catalog.

---

---

## Phase 1 — Inventory of existing ingestion systems

| # | Component | Status | Location / notes |
|---|-----------|--------|-------------------|
| 1 | **Supplier feed upload** (CSV/XLSX in portal) | **Production-ready** | `storefront/src/lib/supplier-portal/feedUpload.ts`, `api/feed-upload/route.ts`. Parse → AI extraction → normalization → preview → commit via RPC `catalogos.commit_feed_upload`. Max 5000 rows, 10 MB; file size checked before read. |
| 2 | **CSV ingestion** (catalogos URL feed) | **Production-ready** | `catalogos/src/lib/ingestion/parsers/csv-parser.ts`, `run-pipeline.ts`. No per-row limit; 10 MB body limit in fetch. |
| 3 | **XLSX ingestion** | **Partially implemented** | Storefront feed upload: SheetJS in `feedUpload.ts`. Catalogos pipeline: parsers only CSV/JSON (no XLSX in `parsers/index.ts`). |
| 4 | **URL-based product creation** | **Production path: CatalogOS** | CatalogOS: `/dashboard/url-import` → crawl → preview → selected `product_ids` → bridge → `import_batches` → normalize → review → publish ([URL_IMPORT_SYSTEM.md](./URL_IMPORT_SYSTEM.md)). Storefront `/admin/product-import` redirects to CatalogOS; legacy API returns 410. |
| 5 | **Manual product creation** | **Partially implemented** | Catalogos: `manual-adapter.ts`, ManualLeadForm for discovery. Creates leads/runs; not a direct “create one product” flow for catalog. |
| 6 | **AI extraction services** | **Partially implemented** | Storefront feed: AI extraction in feedUpload. Catalogos: `extraction-service.ts`, `ai-orchestration.ts` (matching AI fallback); normalization is dictionary-first, AI fallback when configured. |
| 7 | **Rule-based extraction** | **Production-ready** | `catalogos/src/lib/normalization/extract-attributes-dictionary.ts`, `normalization-engine.ts`. Material, size, color, thickness, powder, grade, industries, compliance, texture, cuff, packaging, sterility (disposable); cut/puncture/abrasion/arc (work). |
| 8 | **Product normalization** | **Production-ready** | `normalization-engine.ts`, `staging-payload.ts`, `dictionary-service` (synonym map, allowed values). Only dictionary-allowed values; unmapped → review flags. |
| 9 | **Matching / duplicate detection** | **Production-ready** | Catalogos: `match-service.ts` (UPC → SKU → attribute → fuzzy title), `ai-orchestration.ts` (AI fallback). URL-sourced rows use this path after bridge (same as CSV). |
| 10 | **Review queue integration** | **Production-ready** | `catalogos/src/lib/review/data.ts`, `dashboard/review/`, `StagedProductDetail`, `ReviewActionModal`. Approve/reject/merge, update attributes (dictionary-validated), publish to live. |
| 11 | **Product publishing / activation** | **Two paths (one broken)** | **(A)** Review flow → `runPublish()` → product + `syncProductAttributesFromStaged` + offer + event → **correct**. **(B)** POST `/api/publish` → `publishStagingCatalogos()` → product + offer + public.products **no** `product_attributes` sync → **broken for filters**. |
| 12 | **Catalog indexing / search** | **Production-ready** | Catalogos: `catalog/query.ts`, `product_best_offer_price` view, `product_attributes` for filters. No full-table scan; bounded facets/categories. |
| 13 | **Filter generation / attribute persistence** | **Production-ready** (when publish path A used) | `product-attribute-sync.ts`: staged `filter_attributes` → `product_attributes`. Used by `runPublish`. Not used by `publishStagingCatalogos`. |

### Summary table

| Status | Components |
|--------|------------|
| **Production-ready** | Supplier feed upload (storefront), CSV ingestion (catalogos), rule-based extraction, normalization, matching, review queue, catalog query/facets, attribute sync (via runPublish), feed commit RPC. |
| **Partially implemented** | XLSX (storefront only; catalogos URL feed is CSV/JSON), URL product creation (storefront only; separate from catalogos), manual/discovery (leads, not direct catalog), AI extraction (feed + matching fallback). |
| **Stubbed / missing** | No XLSX in catalogos URL pipeline; no bulk review actions; no row limit in catalogos URL pipeline; POST /api/publish does not sync attributes. |

---

## Phase 2 — Glove attribute extraction audit

| Attribute | How extracted | Deterministic / AI | Confidence | Normalized / persisted | Notes |
|-----------|----------------|-------------------|------------|------------------------|-------|
| **material** | Dictionary + synonym; regex in text | Deterministic | 0.9 | Yes (MATERIAL_VALUES) | nitrile, latex, vinyl, polyethylene_pe. |
| **glove type / grade** | Regex (medical/exam, industrial, food service) + lookup | Deterministic | 0.85 | Yes (GRADE_VALUES) | medical_exam_grade, industrial_grade, food_service_grade. |
| **size** | Column + regex xs/s/m/l/xl/xxl + synonym | Deterministic | 0.9 | Yes (SIZE_VALUES) | lg→l, med→m, etc. |
| **color** | Column + regex over COLOR_VALUES + synonym | Deterministic | 0.85 | Yes (14 colors) | light_blue normalized. |
| **thickness** | parseThicknessFromRaw (column + text), then allowed 2–20 | Deterministic | 0.9 | Yes (THICKNESS_MIL_VALUES) | No 7_plus; individual mils. |
| **powder** | Regex powder-free/PF/powdered + lookup | Deterministic | 0.9 | Yes (POWDER_VALUES) | powder_free, powdered. |
| **sterile** | Regex sterile / non-sterile | Deterministic | 0.85 | Yes (STERILITY_VALUES) | |
| **pack size / packaging** | case_qty/box_qty + regex 1000/case, 100/box | Deterministic | 0.75–0.85 | Yes (PACKAGING_VALUES) | box_100_ct, case_1000_ct, etc. |
| **case quantity** | Raw + pricing normalization | Deterministic | Via pricing_confidence | In content / pricing | |
| **length** | Not in attribute dictionary | — | — | Not filterable | |
| **texture / finish** | Regex fully textured, fingertip, smooth | Deterministic | 0.85 | Yes (TEXTURE_VALUES) | |
| **cuff style** | Regex extended/beaded/non-beaded | Deterministic | 0.85 | Yes (CUFF_STYLE_VALUES) | |
| **certifications / compliance** | Regex (FDA, ASTM, food safe, latex free, chemo, EN) | Deterministic | 0.85 | Yes (COMPLIANCE_VALUES, multi) | |
| **brand** | Free text from brand/manufacturer/vendor | Deterministic | 0.9 | Persisted (not in allowed list) | Required; no ontology. |
| **category / subcategory** | inferCategoryWithResult; categoryHint | Deterministic | Threshold-based | disposable_gloves / reusable_work_gloves | |
| **industry tags** | Regex map (healthcare, food service, janitorial, etc.) | Deterministic | 0.8 | Yes (INDUSTRIES_VALUES, multi) | |
| **Work glove (cut/puncture/abrasion/arc)** | Regex in text | Deterministic | 0.8–0.85 | Yes (work glove keys) | |

**Reliably extracted:** material, size, color, thickness, powder, grade, sterility, packaging, texture, cuff, compliance, industries (all dictionary-bound, synonym-aware).

**Weak / inferred:** packaging when only text (e.g. “100/box”) — confidence 0.75; category when ambiguous.

**Not wired as filter:** length (not in dictionary); brand is free text (filterable but not normalized to a closed set).

**Fragmentation risk:** Low for attributes that go through dictionary + synonym. Brand remains free text (possible duplicates: “Brand A” vs “Brand A Inc.”). If POST /api/publish is used, products never get `product_attributes` and effectively disappear from faceted catalog.

---

## Phase 3 — Filter / facet / ontology audit

**Is there a strict ontology?** **Yes**, in code and DB.

- **Defined:** `catalogos/src/lib/catalogos/attribute-dictionary-types.ts` (MATERIAL_VALUES, SIZE_VALUES, COLOR_VALUES, THICKNESS_MIL_VALUES, POWDER_VALUES, GRADE_VALUES, INDUSTRIES_VALUES, COMPLIANCE_VALUES, TEXTURE_VALUES, CUFF_STYLE_VALUES, PACKAGING_VALUES, STERILITY_VALUES, plus work-glove sets). DB: `attribute_definitions`, `attribute_allowed_values`, `attribute_value_synonyms`.
- **Enforced at ingestion:** Yes. `extractDisposableGloveAttributes` / `extractWorkGloveAttributes` use `lookupAllowed()`; only allowed values are stored; unmapped → review flag.
- **Enforced at review:** Yes. `updateNormalizedAttributes` uses `getReviewDictionaryForCategory` and validates against `allowedByKey`; invalid value returns error.
- **Used by search/filters:** Yes. Catalog `getFilteredProductIds` and `getFacetCounts` use `product_attributes` and `attribute_definitions`; keys align with dictionary (material, size, color, thickness_mil, powder, grade, industries, compliance_certifications, texture, cuff_style, etc.).

**Examples verified:**

- Material: nitrile, latex, vinyl, polyethylene_pe (no “poly” as value; “poly” → polyethylene_pe via synonym).
- Size: xs, s, m, l, xl, xxl (synonyms: lg→l, med→m, extra large→xl).
- Powder: powder_free, powdered (PF, “powder free” → powder_free).
- Thickness: 2–20 as strings (no 7_plus in current dictionary).
- Color: 14 values including light_blue.
- Industry/use: healthcare, food_service, janitorial, etc. (INDUSTRIES_VALUES).

**Where it breaks:**

1. **POST /api/publish** path does not call `syncProductAttributesFromStaged`, so products published via that API have no rows in `product_attributes` → they do not appear in filterable catalog.
2. **Brand** is free text; no canonical list → possible facet fragmentation.
3. **Two catalogs:** Storefront `canonical_products` (URL import) vs catalogos `products` + `product_attributes` (feed → staging → runPublish). Filters and buyer catalog are on catalogos; URL import does not populate catalogos.

---

## Phase 4 — Product canonicalization / duplicate audit

**New vs existing vs duplicate:**

- **Catalogos:** `matchToMaster` order: UPC exact → SKU exact → attribute match (brand, material, color, size, thickness_mil, case_qty) → fuzzy title. Confidence threshold 0.6; below → staging for review. AI matching fallback when enabled. Suggested offer created only when matched and confidence ≥ threshold.
- **Duplicate prevention:** Matching assigns `master_product_id`; publish upserts supplier_offers on (supplier_id, product_id, supplier_sku). No duplicate master products created for same logical product when match is used.
- **Pack/case mismatch:** Attribute match includes case_qty; different pack sizes can match same master (one product, multiple offers). Case qty in anomaly flags (e.g. sku count in batch).
- **Supplier SKU reuse:** Upsert by (supplier_id, product_id, supplier_sku); same SKU updates existing offer.

**Can ingest 100–500 SKUs without duplicate mess?** **Yes**, if (1) feed → staging → **review** → **runPublish** (not POST /api/publish only), and (2) operators use “merge to existing” when match is correct. Risk: low-confidence rows that create new masters without review could create duplicates; review queue is required for safety. **Realistic:** 100–200 SKUs with human review is manageable; 500 requires bulk approve to be efficient.

---

## Phase 5 — Review / correction / approval audit

**Operators can:**

- Review low-confidence products: **Yes** (staging list, filters, StagedProductDetail).
- Correct attributes: **Yes** (`updateNormalizedAttributes` with dictionary validation).
- Approve / reject / merge: **Yes** (approveMatch, rejectStaged, mergeWithStaged, createNewMasterProduct).
- See reasoning/confidence: **Yes** (match_explanation, ai_matching_used, anomaly_flags, review_flags).
- Publish to catalog: **Yes** via “Publish to live” (calls `runPublish` → attribute sync).

**Gaps:**

- **No bulk approve:** Only single-item actions (approve, reject, merge per row). For hundreds of rows, review is one-by-one.
- **No bulk reject:** Same.
- **Corrections → learning:** Attribute corrections are stored on staging; no automated feedback loop to synonym table or AI.
- **Publish path:** Publish page only links to review; no “Publish all” that uses runPublish. If any client calls POST `/api/publish` with `staging_ids`, those products are published **without** `product_attributes` (filter gap).

**Verdict:** Review is functionally complete for correctness and publish quality but **not efficient for high volume** without bulk actions.

---

## Phase 6 — Admin ingestion console audit

**Is there a single operational console for loading hundreds of products quickly?**

**No.** Ingestion is split across:

1. **Catalogos dashboard:** Feeds (create feed, run import) → Batches → Staging / Review → Publish. Flow: add feed URL → run import → all rows land in staging → review each (or by filter) → approve → publish. No bulk approve; no “preview then commit all valid.”
2. **Storefront supplier portal:** Upload CSV/XLSX → preview → correct rows → commit (RPC). Writes to catalogos.supplier_feed_uploads/rows and catalogos.supplier_offers via RPC. Does **not** create catalogos staging rows; it updates/creates **supplier_offers** for **matched** products only (matched_product_id required). So supplier portal feed is “price/offer update” for existing catalog, not “new product ingestion” into staging.
3. **Storefront admin:** URL import → candidates → approve/merge/reject → canonical_products. Separate catalog (storefront), not catalogos.

**Conclusion:** For “hundreds of products” into the **buyer catalog** (catalogos), the only path is **catalogos**: create feed → run import → staging → review (one-by-one) → publish. There is no single, fast “ingestion console” with bulk approve and clear batch tracing; admin ingestion is fragmented across catalogos dashboard (feed/staging/review) and storefront (URL import to a different catalog).

---

## Phase 7 — Buyer catalog readiness audit

**If 200 products were ingested today (via catalogos pipeline and runPublish), would the storefront feel stocked and usable?**

**Yes**, for products published through **review → runPublish**:

- **Search/filter:** `listLiveProducts` + `getFilteredProductIds` use `product_attributes`; facets from `getFacetCounts`; price from `product_best_offer_price`.
- **Category:** category_id and category slug; catalog by category.
- **Product detail:** Product by slug; offers; best price.
- **Attributes on page:** Stored in product + product_attributes; facet definitions and filter UI (FilterSidebar, FilterChips, ProductGrid) are wired.

**Gaps:**

- Products published via **POST /api/publish** only: **not** searchable/filterable (no product_attributes).
- **URL import (storefront):** Populates `canonical_products`, not catalogos; if the buyer storefront is catalogos, those products are not in the catalog.
- **Storefront catalog app:** Catalogos app has `/catalog/[category]` and uses catalogos API; storefront app may have different product sources — confirm which app is “the” buyer storefront.

**Answer:** With 200 products **ingested through catalogos and published via runPublish**, the catalogos storefront would be stocked and usable with filters and facets. With 200 from URL import only (storefront), they would not appear in catalogos catalog.

---

## Phase 8 — Batch ingestion scale audit

| Factor | Catalogos (URL feed) | Storefront feed upload |
|--------|----------------------|-------------------------|
| Max rows per upload | No cap (only 10 MB body) | 5000 |
| CSV/XLSX parsing | No row limit; entire body in memory | validateFile checks row count after parse (5000) |
| Preview generation | N/A (no preview; direct to raw → staging) | Yes (rows in DB) |
| Commit performance | N/A (no “commit”; staging insert per row) | Atomic RPC; one transaction |
| Memory risk | **High** for large CSV (all rows in memory) | Bounded by 5000 + 10 MB |
| Partial failure | Per-row try/catch in pipeline; one row fail does not stop batch | RPC all-or-nothing |
| Operator review burden | One-by-one; no bulk approve | Preview then commit valid/warning |
| Auto-accept vs review | All rows to staging; match creates suggested offer but row still pending | Rows with valid/warning can be committed; no staging in between |

**Throughput (catalogos pipeline):**

- **Per batch:** Effectively limited by 10 MB feed and in-memory parse; no hard row cap (e.g. 50k rows could OOM).
- **Auto-published:** None; every row goes to staging. “Suggested offer” is created for high-confidence match but staging row still needs approve → publish.
- **Review volume:** 100% of rows require at least one decision (approve/merge/reject) and then publish. For 200 rows, 200 review actions plus 200 publish actions unless “publish to live” is used on approve (then 200 approve actions).
- **Realistic:** **50–100** products in a batch is manageable with current UI. **250–500** is painful without bulk approve and possibly a row limit (e.g. 2000) to avoid memory and UX issues.

**Recommendation:** Add a configurable row limit (e.g. 2000) in catalogos pipeline and bulk approve (e.g. “Approve all in this batch with confidence ≥ X”) to make 200+ product batches viable.

---

## Phase 9 — URL-to-product / web ingestion audit

**Can the platform ingest from a pasted external product URL?**

**CatalogOS admin:** **Yes** — URL import is integrated with the same pipeline as CSV after bridge.

- Accept URL: **Yes** (`/dashboard/url-import`, `POST /api/admin/url-import`).
- Crawl / extract: **Yes** (controlled crawl + deterministic extraction; see [URL_IMPORT_SYSTEM.md](./URL_IMPORT_SYSTEM.md)).
- Preview + row selection: **Yes** (job preview UI; selected `product_ids` to bridge).
- Normalize / match / stage: **Yes** (same as other `import_batches` rows).
- Review / publish: **Yes** (CatalogOS review queue and publish).

**Legacy Storefront path:** Retired (redirect + 410 API); do not use for catalog ingestion.

**Residual gaps for “fast catalog population” via URL:**

- Extraction quality still depends on page structure (no headless browser by default); see URL import limitations in [URL_IMPORT_SYSTEM.md](./URL_IMPORT_SYSTEM.md).
- **No single “URL → catalogos staging” path** for launch.

**Verdict:** URL ingestion is implemented for the storefront product graph; it is **not** a fast path to the catalogos buyer catalog without a bridge or consolidation.

---

## Phase 10 — Test coverage audit

**Present:**

- Normalization: `normalization-engine.test.ts`, synonym/provider tests.
- Attribute sync: `product-attribute-sync.test.ts`.
- Publish: `publish-service.test.ts` (buildPublishInputFromStaged, runPublish, publishSafe).
- Catalog query: `query.test.ts`.
- Feed upload (storefront): `feedUpload.test.ts`, `feedUpload.service.test.ts` (including commitFeedUpload).
- Quotes, matching, discovery, catalog-expansion, validation-modes: various unit tests.

**Missing or weak:**

- **End-to-end: bulk ingest → staging → approve → publish → product_attributes and filter visibility.** No test that N staged rows, after runPublish, appear in listLiveProducts with correct facets.
- **POST /api/publish** path: no test that products published via publishStagingCatalogos lack product_attributes (would document the bug).
- **URL pipeline row limit:** no test for “feed over 10 MB or 10k rows” behavior (OOM/timeout).
- **Duplicate prevention:** no integration test (e.g. two batches with same SKU → one master, two offers).
- **Review workflow:** no test for updateNormalizedAttributes → re-publish → attribute update in catalog.
- **Batch failure rollback:** pipeline has per-row try/catch; no test for “partial batch” state (some raw, some normalized, some failed).

---

## Phase 11 — Launch gap analysis

**Fastest credible path to enough glove products for launch:**

1. **Use catalogos as the single catalog** for launch (feed URL → raw → normalize → stage → review → runPublish). Do **not** rely on POST /api/publish for bulk publish (or fix it to call attribute sync).
2. **Add bulk approve** (e.g. “Approve all in batch with match_confidence ≥ 0.85”) to reduce review effort.
3. **Add a row limit** (e.g. 2000) in the URL-feed pipeline to avoid memory and timeouts.
4. **Optionally** add “URL → catalogos staging” (fetch URL → extract → normalize with dictionary → create staging row) so URL import can seed catalogos; or accept that URL import is storefront-only and use feeds for catalogos.

**Can the system support:**

| Threshold | Yes/No | Manual work | Engineering gaps |
|-----------|--------|-------------|-------------------|
| **50 launch-ready** | **Yes** | Approve/publish ~50 rows in review; ensure runPublish path | None critical |
| **100** | **Yes** | ~100 review actions; possible to do in a few sessions | Bulk approve would help |
| **250** | **Conditional** | High effort one-by-one; multiple batches if feed is large | Bulk approve; row limit for large feeds |
| **500** | **No (as-is)** | Impractical one-by-one | Bulk approve, row limit, and possibly batch “publish all approved” using runPublish |

---

## Output summary

### 1. Built components inventory

See Phase 1 table: supplier feed upload, CSV ingestion (catalogos), rule-based extraction, normalization engine, dictionary + synonym, matching (deterministic + AI fallback), review queue, runPublish with attribute sync, catalog query/facets, feed commit RPC, storefront URL import (separate catalog).

### 2. Production-ready components

Feed upload (storefront) with atomic commit; catalogos CSV/JSON pipeline; dictionary extraction and normalization; matching; review (single-item); runPublish and attribute sync; catalog and facets; synonym provider (DB + fallback).

### 3. Partially implemented components

XLSX (storefront only); URL product creation (storefront only; not catalogos); AI extraction (feed + matching); manual/discovery (leads); POST /api/publish (publishes without attribute sync).

### 4. Missing components

Bulk approve/reject in review; row limit in catalogos URL-feed pipeline; attribute sync in publishStagingCatalogos; URL → catalogos staging bridge; end-to-end tests for ingest → publish → filter visibility.

### 5. Weakest points in the ingestion stack

- **POST /api/publish** used with staging_ids → products without product_attributes → not filterable.
- **No bulk review** → slow for 200+ products.
- **No row limit** in catalogos pipeline → memory/timeout risk for large feeds.
- **Two catalogs** (storefront canonical_products vs catalogos products) → confusion and URL import not feeding buyer catalog.

### 6. Filter / ontology gaps

- Ontology is strict and enforced at ingest and review.
- Gap: publish path B skips attribute sync.
- Brand is free text (facet fragmentation possible).

### 7. Duplicate / canonicalization risks

- Matching and upsert logic are sound. Risk: over-use of “create new master” in review without checking merge; no bulk merge. Mitigation: train operators to prefer “merge” when match is correct.

### 8. Review workflow gaps

- No bulk approve/reject; no “approve all in batch” by confidence.
- Publish page does not call runPublish in bulk; it links to review. Any use of POST /api/publish with staging_ids should be fixed or deprecated.

### 9. Buyer catalog readiness gaps

- Products must be published via **runPublish** (review flow) to have product_attributes and appear in filters.
- URL-imported products (storefront) do not appear in catalogos catalog unless a bridge exists.

### 10. Batch ingestion readiness

- **50–100:** Yes with current tooling.
- **250+:** Needs bulk approve and row limit; 500 is not realistic without those and possibly “publish all approved” using runPublish.

### 11. URL ingestion readiness

- **Storefront URL import:** Works for that app’s canonical_products; duplicate detection and review exist.
- **Catalogos:** No URL → staging path; not ready for “seed catalog from URLs” without a new flow or bridge.

### 12. Missing tests

End-to-end ingest → publish → filter visibility; POST /api/publish behavior (missing attributes); URL pipeline row limit / large feed; duplicate prevention integration; review → attribute update → republish.

### 13. Exact files / routes / tools that need work

| Priority | File / route | Change |
|----------|--------------|--------|
| P0 | `catalogos/src/lib/services/publish/publish-staging-catalogos.ts` | Call `syncProductAttributesFromStaged` after creating/updating product (or delegate to runPublish for each id). |
| P0 | `catalogos/src/app/actions/review.ts` (or new bulk action) | Add bulk approve (e.g. approveStagedBatch(batchId, options)). |
| P1 | `catalogos/src/lib/ingestion/run-pipeline.ts` or parsers | Enforce max rows (e.g. 2000) after parse; reject or truncate with warning. |
| P1 | `catalogos/src/app/(dashboard)/dashboard/publish/page.tsx` | If “Publish all” is added, call runPublish per row (or new bulk runPublish) instead of POST /api/publish. |
| P2 | Storefront URL import | Optional: “Push to catalogos” or pipeline that creates catalogos staging from product_import_candidates with dictionary normalization. |
| P2 | Tests | Add e2e: ingest → approve → runPublish → listLiveProducts + getFacetCounts; add test for publishStagingCatalogos attribute sync (or current lack thereof). |

---

## Final answers

**A. Can GLOVECUBS ingest and publish hundreds of glove products efficiently enough for launch?**  
**Conditional.** Hundreds are possible only if: (1) catalogos pipeline is used end-to-end, (2) publish is done via **runPublish** (review flow), and (3) either bulk approve is added or the team accepts one-by-one review for 100–200 products. Without bulk approve, “efficiently” is limited to roughly 50–100 products; with it, 200–250 is realistic.

**B. What number of products is realistically achievable right now?**  
**50–100** launch-ready products with manual review and runPublish. **100–200** is achievable but labor-intensive. **250–500** is not realistic without bulk approve and row limit.

**C. What are the top 5 changes needed to make mass product ingestion truly launch-ready?**  
1. **Fix POST /api/publish** so published products get `product_attributes` (call syncProductAttributesFromStaged or route through runPublish).  
2. **Add bulk approve** (and optionally bulk reject) in the review queue (e.g. by batch and/or confidence threshold).  
3. **Add a row limit** (e.g. 2000) in the catalogos URL-feed pipeline to avoid OOM and timeouts.  
4. **Unify or bridge catalogs:** either make URL import write to catalogos staging (with dictionary normalization) or clearly document that “buyer catalog” = catalogos only and URL import is for a different use case.  
5. **Add end-to-end test:** ingest → staging → approve → runPublish → verify products appear in catalog with correct filters/facets.

---

## Verdict

# CONDITIONAL GO — READY FOR CATALOG BUILDOUT

**Interpretation:** The stack is **ready for catalog buildout** in the sense that a real ingestion and filter pipeline exists, ontology is enforced, and products published through the **review → runPublish** path are correctly normalized and filterable. The platform can support **50–100** products for launch with current tooling and **100–200** with tolerable manual review. For “hundreds” to be **efficient**, the top 5 changes above (especially attribute sync on the alternate publish path and bulk approve) should be implemented. Until then, treat **50–100** as the safe launch product count and **CONDITIONAL GO** as: go for launch with that scope, and prioritize the listed fixes for scaling to 200+.
