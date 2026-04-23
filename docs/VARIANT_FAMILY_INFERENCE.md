# Variant Family Inference

When supplier or manufacturer data includes size-based SKUs for the same glove (e.g. GL-N125FS, GL-N125FM, GL-N125FL, GL-N125FXL), GloveCubs infers a **product family** and **size variants** instead of creating separate standalone products.

## Concepts

- **Product family**: One parent record (`catalogos.product_families`) holding shared attributes (brand, material, thickness, color, grade, packaging, etc.).
- **Product variant**: A row in `catalogos.products` with `family_id` set; each variant has its own SKU (e.g. GL-N125FS), size, and optional variant-specific UPC/image; supplier offers are attached to the variant product.

## How Family Inference Works

1. **Base SKU and size from SKU**
   - The pipeline checks if the SKU ends with a known size suffix: `XXL`, `XL`, `XS`, `S`, `M`, `L` (case-insensitive).
   - Example: `GL-N125FS` → base SKU `GL-N125F`, size `s`.
   - Example: `GL-N125FXL` → base SKU `GL-N125F`, size `xl`.
   - Confidence for this path is **0.95**.

2. **Size from title or specs**
   - If the SKU does not end with a size suffix, size is inferred from combined text (title, description, specs) using patterns such as "Small", "Medium", "Large", "XL", "Extra Large", etc.
   - If an explicit `size` (or `sizes`) field is present in normalized data, it is used with higher confidence (**0.9**); otherwise title/specs give **0.75**.

3. **Family group key**
   - A stable key is built from: **base SKU** + **brand** + **material** + **thickness_mil** + **color** + **powder** + **grade** + **packaging** (normalized, lowercase).
   - Rows with the same key are **candidates** for one family.

4. **Safety rule: only size may differ**
   - Before assigning `family_group_key`, the pipeline checks that **every pair** of rows in the same candidate group has identical values for brand, material, thickness, color, powder, grade, and packaging.
   - If any pair differs on one of these, the whole group is **not** assigned a `family_group_key` (rows stay separate for review).

5. **Confidence threshold**
   - `family_group_key` and `grouping_confidence` are set **only when** inference confidence is **≥ 0.85** (see `FAMILY_GROUPING_CONFIDENCE_THRESHOLD` in `catalogos/src/lib/variant-family/family-inference.ts`).
   - Rows below the threshold or that fail the “only size differs” check have `family_group_key` and `grouping_confidence` set to `null` and are treated as standalone products.

## Base SKU Detection (Summary)

| Source            | Logic                                                                 | Confidence |
|------------------|-----------------------------------------------------------------------|------------|
| SKU suffix        | SKU matches `^(.+?)(xxl\|xl\|xs\|s\|m\|l)$` (longest suffix first)   | 0.95       |
| Explicit size     | `size` / `sizes` from normalized data                                 | 0.9        |
| Title/specs       | Regex over combined text for Small/Medium/Large/XL/etc.                | 0.75       |
| None              | No base/size inferred                                                 | 0          |

## Data Model

- **`catalogos.product_families`**: `id`, `base_sku`, `name`, `category_id`, `brand_id`, `description`, `attributes` (shared), `created_at`, `updated_at`.
- **`catalogos.products`**: existing columns plus **`family_id`** (nullable FK to `product_families`). When set, the row is a size variant.
- **`catalogos.supplier_products_normalized`**: **`inferred_base_sku`**, **`inferred_size`**, **`family_group_key`**, **`grouping_confidence`** (all nullable). Filled during family inference.

Supplier offers continue to reference **`product_id`** (the variant product). Search and storefront still use `catalogos.products` (and `public.canonical_products`); each variant remains one product row, so existing behavior is preserved.

## Staging and Review

- After normalization (and after family inference runs), staging rows may have:
  - **Proposed product family**: rows with the same `family_group_key`.
  - **Proposed variants**: each row’s `inferred_base_sku`, `inferred_size`, and `grouping_confidence`.
- Review UI can use **`getProposedFamiliesForBatch(batchId)`** to list proposed families (groups with ≥ 2 variants).
- Rows that could not be safely grouped keep `family_group_key` null and can be approved/published as standalone products.

## Publish Flow (Variant Group)

- **Publish variant group**: use **`publishVariantGroup(normalizedIds)`** (e.g. from review action) with all normalized IDs that share the same `family_group_key`.
  1. Create or reuse one **`product_families`** row (by `base_sku`).
  2. For each staging row, create a **variant product** (`products.family_id` = family id, variant SKU, size in attributes).
  3. Create one **supplier_offer** per variant (tied to that variant’s `product_id`).
  4. Sync product_attributes and **sync_canonical_products** so the storefront sees each variant.

Uncertain or low-confidence cases are left as separate rows; they are not auto-grouped.

## Test Cases

### 1. GL-N125FS / GL-N125FM / GL-N125FL / GL-N125FXL

- **Input**: Four staging rows with SKUs above; same brand, material, thickness, color, grade, packaging.
- **Expected**:
  - `inferred_base_sku` = `GL-N125F` for all.
  - `inferred_size` = `s`, `m`, `l`, `xl` respectively.
  - Same `family_group_key`; `grouping_confidence` ≥ 0.85.
  - Publish variant group → one family, four variant products, four offers.

### 2. Title-based size detection

- **Input**: Row with SKU `GLOVE-200` (no size suffix), title “Nitrile Gloves Medium”.
- **Expected**: `inferred_size` = `m` from title; base SKU = `GLOVE-200`; confidence from title/specs (e.g. 0.75). If another row has same base + “Large” and same attrs, they can share a `family_group_key`.

### 3. Mixed products that must NOT be grouped

- **Input**: Row A (SKU GL-N125FS, material nitrile, color blue); Row B (SKU GL-N125FM, material nitrile, **color black**).
- **Expected**: Different `family_group_key` (or one row with null key) because color differs. **Only size** may differ for grouping.
- **Input**: Row A (GL-N125FS, 4 mil); Row B (GL-N125FM, **6 mil**).
- **Expected**: Do not group; thickness_mil differs.

## Confidence Thresholds

- **Grouping threshold**: **0.85** (`FAMILY_GROUPING_CONFIDENCE_THRESHOLD`). Only rows at or above this get `family_group_key` and `grouping_confidence`.
- Lower confidence or failed “only size differs” check → no `family_group_key`; rows stay standalone.

## How to Test with a 200–300 Product Crawl/Import

1. Run a crawl or CSV import that produces 200–300 staging rows (e.g. a feed with many size variants).
2. Ensure **family inference** runs after normalization (it runs automatically in `run-pipeline` after batch completion).
3. In the review UI (or via API):
   - For the batch, call **`getProposedFamiliesForBatch(batchId)`** to see proposed families and variant counts.
   - Inspect staging rows: `inferred_base_sku`, `inferred_size`, `family_group_key`, `grouping_confidence`.
4. For a proposed family (same `family_group_key`):
   - Select those normalized IDs and call **`publishVariantGroup(normalizedIds)`**.
   - Verify: one `product_families` row, N `products` rows with `family_id` set, N `supplier_offers` linked to variant products.
5. Run **`sync_canonical_products`** (or rely on publish having run it) and confirm storefront/search still show each variant as a product and that filters (e.g. size) work.

## Limitations

- Only **size** is treated as a variant dimension; color/material/thickness variants are not merged into one family.
- Base SKU is inferred from **suffix** patterns (XXL, XL, XS, S, M, L); non-standard suffixes (e.g. numeric sizes) are not parsed as size suffixes.
- Family inference runs **per batch** after normalization; re-running inference on an existing batch requires a separate call to **`runFamilyInferenceForBatch(batchId)`** (e.g. from an admin or script).
- Storefront today shows one product per variant (one row in `canonical_products` per variant); “other sizes” grouping in the UI is not implemented in this phase.
