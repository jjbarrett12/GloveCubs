# Product Identity and Resolution Graph

This document describes the GloveCubs **product identity and resolution graph**: schema, resolution flow, confidence rules, and how learned memory (aliases, SKU patterns, match decisions) makes catalog growth increasingly automatic over time.

## Goals

When new CSV imports, crawl results, or supplier feeds arrive, the system classifies each normalized row as:

- **Existing product family** – row belongs to a known family (e.g. same base SKU).
- **Existing variant** – row is a known product (e.g. same SKU or same family + size).
- **New supplier offer** – same product, new supplier/SKU (exact offer match).
- **Duplicate candidate** – high similarity to an existing product (needs review or auto-merge when safe).
- **Truly new product** – no match; create new family/variant.

This reduces duplicate catalog growth and allows the system to improve with every import by reusing admin decisions and learned aliases/patterns.

---

## Schema

### Enums

- **`catalogos.resolution_match_type`**: `family` | `variant` | `offer` | `duplicate` | `new_product`
- **`catalogos.resolution_candidate_status`**: `pending` | `approved` | `rejected` | `superseded`

### Tables

#### 1. `catalogos.product_resolution_candidates`

Stores one or more candidate resolutions per normalized row. The review flow shows the best candidate and allows approve/reject.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `batch_id` | UUID | FK → `import_batches.id` |
| `normalized_row_id` | UUID | FK → `supplier_products_normalized.id` |
| `candidate_family_id` | UUID | FK → `product_families.id` (optional) |
| `candidate_product_id` | UUID | FK → `products.id` (optional) |
| `match_type` | resolution_match_type | family / variant / offer / duplicate / new_product |
| `confidence` | NUMERIC(5,4) | 0–1 |
| `reasons_json` | JSONB | e.g. `["exact_supplier_offer"]`, `["similarity_brand_title_attributes"]` |
| `status` | resolution_candidate_status | pending / approved / rejected / superseded |
| `created_at`, `resolved_at`, `resolved_by` | TIMESTAMPTZ / TEXT | Audit |

Constraint: at least one of `candidate_family_id`, `candidate_product_id` must be set, or `match_type = 'new_product'`.

#### 2. `catalogos.product_aliases`

Reusable alias memory: maps variant phrasing to a canonical value so future imports match consistently.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `alias_key` | TEXT | e.g. `"food safe"`, `"powder free"` |
| `canonical_value` | TEXT | e.g. `food_service_grade`, `powder_free` |
| `attribute_domain` | TEXT | e.g. `grade`, `material` |
| `usage_count` | INT | Optional usage counter |
| `created_at`, `updated_at` | TIMESTAMPTZ | Audit |

Unique on `(alias_key, attribute_domain)`. Used in the resolution engine when comparing grade/material in similarity matching (e.g. "food safe" → `food_service_grade`).

#### 3. `catalogos.sku_pattern_memory`

Learned SKU family/variant rules by brand or supplier (e.g. base SKU + size suffix).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `brand_id` | UUID | FK → `brands.id` (optional) |
| `supplier_id` | UUID | FK → `suppliers.id` (optional) |
| `base_sku_pattern` | TEXT | e.g. `GL-N125F` |
| `suffix_type` | TEXT | e.g. `size` |
| `suffix_values` | TEXT[] | e.g. `{S,M,L,XL}` |
| `example_skus` | TEXT[] | Optional examples |
| `usage_count` | INT | Optional |
| `created_at`, `updated_at` | TIMESTAMPTZ | Audit |

At least one of `brand_id` or `supplier_id` must be set. Used by the resolution engine to resolve rows by learned base SKU + size suffix before falling back to inferred base SKU or similarity; and updated when admins approve high-confidence family/variant resolutions (see Learned Memory).

#### 4. `catalogos.match_decisions`

Stores admin resolution decisions keyed by supplier + SKU so future imports reuse them.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `supplier_id` | UUID | FK → `suppliers.id` |
| `decision_key` | TEXT | e.g. `supplier_sku` or hash of (supplier_id, supplier_sku) |
| `candidate_family_id` | UUID | FK → `product_families.id` (optional) |
| `candidate_product_id` | UUID | FK → `products.id` (optional) |
| `match_type` | resolution_match_type | family / variant / offer / duplicate / new_product |
| `decided_by` | TEXT | Optional audit |
| `created_at` | TIMESTAMPTZ | Audit |

Unique on `(supplier_id, decision_key)`. When an admin approves a resolution in review, we persist a row here; the next time the same supplier + SKU is seen, the resolution engine returns this decision first (high confidence).

---

## Resolution Flow

The resolution engine runs **after** normalization and family inference (e.g. `inferred_base_sku`, `inferred_size` are set). It evaluates each normalized row in this order:

1. **Prior match decision** – If `match_decisions` has an entry for this `(supplier_id, supplier_sku)`, return that as the candidate (confidence ≈ 0.98).
2. **Exact supplier offer** – If `supplier_offers` already has an active row for this supplier + `supplier_sku`, return that product as `offer` (confidence ≈ 0.98).
3. **Existing variant SKU** – If `products.sku` equals the row’s SKU, return that product as `variant` (confidence ≈ 0.95).
4. **SKU pattern memory** – Look up `sku_pattern_memory` by supplier (and optionally brand). If the row’s full SKU matches a learned pattern (base + optional size suffix), resolve to that family and optionally to a variant by size. **Supporting attributes** (brand, material, thickness_mil, color, grade, packaging) must agree with the matched product when both have values; grade/material use alias resolution. When they agree: confidence 0.92 for pattern + variant (eligible for auto-attach). When they disagree or only family matches: confidence 0.85 or 0.88 (manual review). Reasons: `sku_pattern_family_and_size`, `sku_pattern_family`.
5. **Family by inferred base SKU** – If `inferred_base_sku` matches a `product_families.base_sku` in the same category, optionally find a variant in that family by `inferred_size`; else return the family. Confidence ~0.85–0.9.
6. **Similarity match** – Compare brand, normalized title, material, thickness, color, grade, packaging to existing products in the same category. Grade and material are resolved through `product_aliases` (e.g. "food safe" → `food_service_grade`). Score ≥ 0.5 required; ≥ 0.85 treated as `duplicate`, else `variant`. Confidence = score. **Similarity matches are never auto-attached.**
7. **Unresolved** – If no candidate is found, add a single candidate with `match_type = 'new_product'`, confidence 0, reasons `["no_match"]`.

Candidates are sorted by confidence descending. The pipeline writes **one** best candidate per normalized row into `product_resolution_candidates` (the highest-confidence non–new_product candidate, or new_product if none).

---

## Confidence Logic

- **Prior decision / exact offer**: fixed high confidence (e.g. 0.98).
- **Exact variant SKU**: fixed (e.g. 0.95).
- **SKU pattern + variant**: 0.92 when supporting attributes agree; 0.85 when they don’t. SKU pattern + family only: 0.88.
- **Family + size variant**: e.g. 0.9; family-only e.g. 0.85.
- **Similarity**: confidence = computed score (0.5–1.0). Duplicate vs variant is determined by a threshold (e.g. ≥ 0.85 → duplicate). **Similarity is never auto-attached.**
- **new_product**: confidence 0.

Safety:

- **No auto-merge for low-confidence or similarity.** Only exact or high-confidence pattern matches can auto-attach (see below).
- Constants: `RESOLUTION_AUTO_ATTACH_THRESHOLD` (0.92), `RESOLUTION_MIN_CONFIDENCE` (0.5).

---

## Limited Auto-Attach (Production-Safe)

The pipeline **auto-attaches** a normalized row to a master product only when all of the following hold:

- The best candidate has **confidence ≥ 0.92**.
- The best candidate’s **primary reason** is one of:
  - `prior_admin_decision`
  - `exact_supplier_offer`
  - `exact_variant_sku`
  - `sku_pattern_family_and_size` (only when **supporting attributes agreed** in the resolution engine, so confidence is 0.92)
- The candidate has a **product** (variant/offer/duplicate), not family-only or new_product.

When auto-attach runs, the pipeline: sets the candidate status to `approved`, writes the decision to `match_decisions` (with `decided_by = "auto_attach"`), and sets `master_product_id` and `status = "approved"` on the normalized row.

**What is NOT auto-attached (remains manual review):**

- Similarity-based matches (`similarity_brand_title_attributes`) — regardless of score.
- Family-only matches (no variant) — no product to attach to.
- New product candidates.
- Any candidate with confidence &lt; 0.92.
- SKU pattern family-only (no size/variant) — confidence 0.88, below threshold.
- SKU pattern + variant when supporting attributes **disagree** — confidence 0.85, below threshold.

---

## Learned Memory and How It Improves Future Imports

### 1. Match decisions (`match_decisions`)

When an admin **approves** a resolution in the review flow:

- We store a row in `match_decisions` with `(supplier_id, decision_key)` where `decision_key` is derived from the normalized row’s supplier SKU.
- On the **next import** for the same supplier and same SKU, the resolution engine checks `match_decisions` first and returns that decision with high confidence, so the same row is resolved the same way without repeated review.

### 2. Product aliases (`product_aliases`)

- Seed data and/or runtime learning map phrases like "food safe", "powder free", "exam grade" to canonical values (`food_service_grade`, `powder_free`, `examination`).
- The **similarity** step in the resolution engine resolves the row’s grade and material through `resolveAlias(..., "grade")` and `resolveAlias(..., "material")` before comparing to existing products. So future imports that use "food safe" will match products stored with "food_service_grade".

### 3. SKU pattern memory (`sku_pattern_memory`)

- **How it works**: The resolution engine consults SKU pattern memory **after** prior decision, exact offer, and exact variant SKU, and **before** family-by-inferred-base-SKU and similarity. For each normalized row it looks up patterns by supplier (and optionally brand), then tries to parse the row’s full SKU as a stored `base_sku_pattern` plus an optional suffix (e.g. size). If a pattern matches, it resolves to that family and, when the suffix matches a variant size, to that variant.
- **Where it is stored**: Table `catalogos.sku_pattern_memory` (base_sku_pattern, suffix_type, suffix_values, example_skus, supplier_id/brand_id, usage_count). Records are created or updated by the **learning** path (see below).
- **Where it is read**: In the resolution engine step **resolveBySkuPattern**: `findMatchingPattern(supplierId, fullSku)` loads patterns via `getPatternsBySupplier` (and optionally `getPatternsByBrand`) and matches the SKU to a base + suffix.
- **How it is applied**: On a pattern match, the engine finds the family by `base_sku` and category, then (if there is a size suffix) finds a variant in that family with matching size. For a **variant** match it then checks **supporting attributes**: brand, material, thickness_mil, color, grade, packaging. Only when both row and product have a value for an attribute are they compared (grade/material via alias resolution). If all compared attributes agree, confidence is 0.92 (auto-attach eligible); if any disagree, confidence is 0.85 (manual review). Family-only pattern matches stay at 0.88 (manual).
- **Learning**: When an admin **approves** a resolution with **confidence ≥ 0.88** and the candidate was resolved by family/variant (e.g. `family_base_sku_and_size`, `sku_pattern_family_and_size`, `family_base_sku`, or `sku_pattern_family`), and the normalized row has `inferred_base_sku`, the system **records or updates** a row in `sku_pattern_memory` for that supplier with that base SKU and optional size (and the row’s full SKU as an example). We do **not** learn from weak or ambiguous approvals (low confidence or unclear base/size).

---

## Review Integration

- **Staging API** (`GET /api/review/staging/[id]`) includes `resolution_candidates` for the normalized row (from `product_resolution_candidates`).
- **Staged product detail UI** shows the best candidate (pending first, else first by confidence), with:
  - **Resolution source**: one of the following. Exact/reuse: prior decision, exact supplier offer, exact variant SKU. Learned: SKU pattern memory. Manual: Manual similarity (similarity_brand_title_attributes), or Needs manual review. Display labels: “Resolved by prior decision”, “Resolved by exact supplier offer”, “Resolved by exact variant SKU”, “Resolved by SKU pattern memory”, or “Needs manual review”.
  - Match type, confidence, and reasons.
  - **Accept resolution** / **Reject** only when the candidate status is `pending` (e.g. not already auto-attached).
- **Accept**: calls `approveResolutionCandidateAction` → persists to `match_decisions`, sets `master_product_id` on the normalized row when the candidate is variant/offer/duplicate, marks the candidate approved, and (when confidence ≥ 0.88 and the resolution was family/variant-based) may **learn** into `sku_pattern_memory` (see above).
- **Reject**: marks the candidate rejected; no change to `match_decisions` or master product.

---

## How to Test with Repeated Supplier Imports

1. **First import**  
   Run pipeline for a supplier CSV. In review, for a given row, you should see a resolution candidate (e.g. variant or new_product) and the **resolution source** (e.g. “Needs manual review” or “Resolved by exact variant SKU” if it matched). Approve a variant/offer resolution when appropriate.

2. **Check match_decisions**  
   Query `match_decisions` for that `supplier_id` and the row’s `decision_key` (e.g. `supplier_id:supplier_sku`). You should see the stored decision.

3. **Second import**  
   Re-import the same or a similar file (same supplier + same SKU for at least one row). Run the pipeline again.

4. **Verify reuse and auto-attach**  
   For the same supplier + SKU, the resolution candidate for that normalized row should now be **prior_admin_decision** with high confidence. If the pipeline applied **auto-attach** (exact offer, exact variant SKU, prior decision, or high-confidence SKU pattern + variant), the row’s `master_product_id` and `status` will already be set and the candidate status will be `approved`; the review UI will show the resolution source and no Accept/Reject buttons for that candidate.

5. **SKU pattern learning**  
   After approving a family/variant resolution with high confidence (≥ 0.88) and with `inferred_base_sku` set, check `sku_pattern_memory` for that supplier and base SKU. Re-import a row with a full SKU that matches that base + a known size suffix; it should resolve via **SKU pattern memory** (and may auto-attach if confidence ≥ 0.92).

6. **Aliases**  
   Add or rely on seed aliases (e.g. "food safe" → `food_service_grade`). Import a row with grade "food safe" and ensure similarity matching links it to products that have grade `food_service_grade` when appropriate. Similarity matches always require manual review (no auto-attach).

---

## Files Reference

| Area | Path |
|------|------|
| Migration | `supabase/migrations/20260603000001_product_identity_resolution.sql` |
| Types | `catalogos/src/lib/product-resolution/types.ts` |
| Resolution engine | `catalogos/src/lib/product-resolution/resolution-engine.ts` |
| Batch runner | `catalogos/src/lib/product-resolution/run-resolution-for-batch.ts` |
| Alias service | `catalogos/src/lib/product-resolution/alias-service.ts` |
| Match decision service | `catalogos/src/lib/product-resolution/match-decision-service.ts` |
| Resolution data (review) | `catalogos/src/lib/product-resolution/resolution-data.ts` |
| SKU pattern service | `catalogos/src/lib/product-resolution/sku-pattern-service.ts` |
| Pipeline integration | `catalogos/src/lib/ingestion/run-pipeline.ts` |
| Review API | `catalogos/src/app/api/review/staging/[id]/route.ts` |
| Review actions | `catalogos/src/app/actions/review.ts` |
| Review UI | `catalogos/src/components/review/StagedProductDetail.tsx` |
| Public API | `catalogos/src/lib/product-resolution/index.ts` |
