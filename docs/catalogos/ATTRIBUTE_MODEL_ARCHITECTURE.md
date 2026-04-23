# GloveCubs CatalogOS — Attribute Model and Ingestion Architecture

## 1. Schema design for attribute definitions and product attribute values

- **attribute_definitions**: One row per (category_id, attribute_key). Defines label, value_type (string, number, boolean, string_array), is_required, is_filterable, sort_order. Universal filters (material, size, color, brand) are defined on each category that uses them.
- **attribute_allowed_values**: One row per allowed value for a facet: (attribute_definition_id, value_text) or (attribute_definition_id, value_number). Enables storefront facet UI and validation. New values (e.g. 12mil) are inserted at ingestion via `ensureAllowedValue` so "if a glove doesn't match the set filters, create the new filter."
- **product_attributes**: Normalized (product_id, attribute_definition_id, value_text | value_number | value_boolean) for master products; used for faceted filtering and search.
- **products.attributes**: JSONB denormalized copy for display and quick access.

## 2. Category-specific attribute model

**Disposable gloves:** material, size, color, brand, thickness_mil, powder, grade, industries, compliance_certifications, texture, cuff_style, hand_orientation, packaging, sterility.

**Reusable work gloves:** material, size, color, brand, cut_level_ansi, puncture_level, abrasion_level, flame_resistant, arc_rating, warm_cold_weather.

## 3. Exact Supabase SQL tables

- **categories** — existing (slug, name, description, sort_order).
- **attribute_definitions** — existing (category_id, attribute_key, label, value_type, is_required, is_filterable, sort_order).
- **attribute_allowed_values** — existing (attribute_definition_id, value_text, value_number, sort_order); unique (attribute_definition_id, value_text).
- **products** — existing (sku, name, category_id, brand_id, description, attributes JSONB, …).
- **product_attributes** — existing (product_id, attribute_definition_id, value_text, value_number, value_boolean); one row per product per attribute for filtering.
- **supplier_products_raw** — existing (batch_id, supplier_id, external_id, raw_payload JSONB); immutable.
- **supplier_products_normalized** — existing (batch_id, raw_id, supplier_id, normalized_data JSONB, attributes JSONB, match_confidence, master_product_id, status, …).
- **supplier_offers** — existing (supplier_id, product_id, supplier_sku, cost, raw_id, normalized_id, …).
- **import_batches** — existing (feed_id, supplier_id, status, started_at, completed_at, stats JSONB).
- **review_flags** — new in `20260315000001_catalogos_filters_and_review_flags.sql` (normalized_id, flag_type, attribute_key, message, severity, payload, created_at).

## 4. Seed data for all filter options

In the same migration: categories (reusable_work_gloves), attribute_definitions and attribute_allowed_values for disposable_gloves and reusable_work_gloves with every option you specified (material, size, color, thickness_mil, powder, grade, industries, compliance_certifications, texture, cuff_style, hand_orientation, packaging, sterility, cut_level_ansi, puncture_level, abrasion_level, flame_resistant, arc_rating, warm_cold_weather). See migration file.

## 5. TypeScript types for normalized product model

- **`catalogos/src/lib/catalogos/normalized-product-types.ts`**: `NormalizedProductCore` (canonical_title, short_description, long_description, product_details, specifications, bullets, brand, manufacturer_part_number, supplier_sku, upc, supplier_cost, images, stock_status, case_qty, box_qty, lead_time_days), `FilterAttributes` (universal + category-specific keys), `NormalizedProduct` (core + category_slug + filter_attributes), `NormalizedStagingRow`, `ReviewFlag`.
- **`catalogos/src/lib/catalogos/filter-attributes.ts`**: Const arrays and types for every filter option (MATERIAL_OPTIONS, SIZE_OPTIONS, COLOR_OPTIONS, etc.).

## 6. Zod schemas for validated normalized ingestion output

- **`catalogos/src/lib/catalogos/normalized-product-schema.ts`**: `filterAttributesSchema`, `normalizedProductCoreSchema`, `normalizedProductSchema`, `reviewFlagSchema`. Used to validate ingestion output and API payloads.

## 7. Rules-based extraction functions

- **`catalogos/src/lib/catalogos/extract-filters.ts`**: `extractMaterial`, `extractSize`, `extractColor`, `extractThicknessMil`, `extractPowder`, `extractGrade`, `extractIndustries`, `extractCompliance`, `extractTexture`, `extractCuffStyle`, `extractPackaging`, `extractSterility`, `extractCutLevelAnsi`, `extractPunctureLevel`, `extractAbrasionLevel`, `extractWarmColdWeather`, `extractDisposableGloveFilters`, `extractWorkGloveFilters`. All deterministic from raw row text.

## 8. AI fallback interface for uncertain extraction

- **`catalogos/src/lib/catalogos/ai-extraction-fallback.ts`**: `runAIExtractionFallback(input)`. Invoked when rules confidence is below threshold or required attributes (material, size, color) are missing. Calls OpenAI with structured prompt; returns merged filter_attributes + core_overrides or null. Caller keeps rules result on failure or when AI is disabled.

## 9. Review-queue logic for missing or invalid filter attributes

- **`catalogos/src/lib/catalogos/review-flags.ts`**: `createReviewFlag(input)` persists to `review_flags`. `evaluateReviewFlags({ normalizedId, categorySlug, filterAttributes, confidenceByKey, core })` creates flags for: missing required filter attributes (material, size, color), low-confidence attributes (below 0.6), missing canonical title, invalid/negative supplier cost. Returns count of flags created.

## 10. Example ingestion outputs

See **`docs/catalogos/FILTER_ATTRIBUTES_AND_EXAMPLES.md`** for full JSON examples: disposable nitrile gloves, exam gloves, food service vinyl gloves, cut-resistant reusable gloves, insulated winter work gloves.

## Ensuring new filter values (e.g. 12mil)

- **`catalogos/src/lib/catalogos/ensure-allowed-value.ts`**: `ensureAllowedValue({ categorySlug, attributeKey, valueText, valueNumber })` inserts into `attribute_allowed_values` if not present. `ensureExtractedValuesInAllowed(categorySlug, filterAttributes)` calls it for each extracted attribute so new values (e.g. thickness "12") get a filter option created automatically.

## Naming and scalability

- All attribute keys use snake_case. Allowed values use lowercase snake_case (e.g. powder_free, medical_exam_grade). Categories use slugs: disposable_gloves, reusable_work_gloves.
- Architecture is reusable for broader PPE and SourceIt: add categories and attribute_definitions per category, extend FilterAttributes and extraction rules per category.
