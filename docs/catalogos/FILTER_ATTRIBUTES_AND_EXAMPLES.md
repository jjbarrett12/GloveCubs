# GloveCubs CatalogOS — Filter Attributes and Example Ingestion Outputs

## Schema design (attribute definitions and product attribute values)

- **categories**: One row per product category (e.g. `disposable_gloves`, `reusable_work_gloves`). Storefront filter "category" uses these slugs.
- **attribute_definitions**: Per-category. Each row = one filter facet: `attribute_key`, `label`, `value_type` (string, number, boolean, string_array), `is_required`, `is_filterable`, `sort_order`. Universal facets (material, size, color, brand) are defined on each category that uses them.
- **attribute_allowed_values**: Allowed values for enum-like facets. One row per (attribute_definition_id, value_text) or (attribute_definition_id, value_number). New values (e.g. 12mil) can be inserted at ingestion time so "if a glove doesn't match the set filters, create the new filter."
- **products**: Master catalog; `attributes` JSONB holds denormalized filter values for display; `product_attributes` table holds normalized (product_id, attribute_definition_id, value_text | value_number | value_boolean) for faceted filtering.
- **supplier_products_raw**: Immutable raw payload per row.
- **supplier_products_normalized**: Staging row with `normalized_data` (full NormalizedProduct) and `attributes` (FilterAttributes) for matching and review.
- **supplier_offers**: Many offers per master product; supplier SKU ≠ master product.
- **import_batches**: One per run; traceability root.
- **review_flags**: Per normalized_id; flag_type, attribute_key, message, severity for missing/conflicting/incomplete data.

## Category-specific attribute model

**Disposable gloves:** material, size, color, brand, thickness_mil, powder, grade, industries, compliance_certifications, texture, cuff_style, hand_orientation, packaging, sterility.

**Reusable work gloves:** material, size, color, brand, cut_level_ansi, puncture_level, abrasion_level, flame_resistant, arc_rating, warm_cold_weather.

## Example ingestion outputs

### 1. Disposable nitrile gloves

```json
{
  "canonical_title": "Nitrile Exam Gloves, Powder-Free, 4 mil, Medium, Blue, 100/Box",
  "short_description": "Powder-free nitrile exam gloves, 4 mil thickness, medium size, blue.",
  "long_description": "Disposable nitrile gloves suitable for exam and light duty. Powder-free, 4 mil, blue, medium. 100 per box.",
  "product_details": "4 mil nitrile; powder-free; beaded cuff; ambidextrous.",
  "specifications": { "thickness": "4 mil", "length": "9.5 in", "material": "nitrile" },
  "bullets": ["Powder-free", "4 mil thickness", "Beaded cuff", "100/box"],
  "brand": "Acme Gloves",
  "manufacturer_part_number": "NG4M-BLU",
  "supplier_sku": "NG4M-BLU-100",
  "upc": "012345678901",
  "supplier_cost": 12.50,
  "images": ["https://example.com/ng4m-1.jpg"],
  "stock_status": "in_stock",
  "case_qty": 1000,
  "box_qty": 100,
  "lead_time_days": 5,
  "category_slug": "disposable_gloves",
  "filter_attributes": {
    "material": "nitrile",
    "size": "m",
    "color": "blue",
    "brand": "Acme Gloves",
    "thickness_mil": "4",
    "powder": "powder_free",
    "grade": "medical_exam_grade",
    "industries": ["healthcare", "food_service"],
    "compliance_certifications": ["fda_approved", "latex_free", "astm_tested"],
    "texture": "smooth",
    "cuff_style": "beaded_cuff",
    "hand_orientation": "ambidextrous",
    "packaging": "box_100_ct",
    "sterility": "non_sterile"
  }
}
```

### 2. Exam gloves (medical grade)

```json
{
  "canonical_title": "Latex Exam Gloves, Powdered, 3 mil, Small, White, 200/Box",
  "short_description": "White latex exam gloves, 3 mil, powdered, small. 200 per box.",
  "supplier_sku": "LEX3S-WHT-200",
  "supplier_cost": 18.00,
  "images": [],
  "category_slug": "disposable_gloves",
  "filter_attributes": {
    "material": "latex",
    "size": "s",
    "color": "white",
    "thickness_mil": "3",
    "powder": "powdered",
    "grade": "medical_exam_grade",
    "compliance_certifications": ["astm_tested"],
    "texture": "smooth",
    "cuff_style": "beaded_cuff",
    "packaging": "box_200_250_ct",
    "sterility": "non_sterile"
  }
}
```

### 3. Food service vinyl gloves

```json
{
  "canonical_title": "Vinyl Gloves, Food Service Grade, Powder-Free, Clear, Large, 1000/Case",
  "short_description": "Clear vinyl food service gloves, powder-free, large. 1000 per case.",
  "supplier_sku": "VFS-L-CLR-1000",
  "supplier_cost": 45.00,
  "images": ["https://example.com/vfs-1.jpg"],
  "case_qty": 1000,
  "category_slug": "disposable_gloves",
  "filter_attributes": {
    "material": "vinyl",
    "size": "l",
    "color": "clear",
    "thickness_mil": "3",
    "powder": "powder_free",
    "grade": "food_service_grade",
    "industries": ["food_service", "food_processing"],
    "compliance_certifications": ["food_safe", "fda_approved"],
    "texture": "smooth",
    "packaging": "case_1000_ct",
    "sterility": "non_sterile"
  }
}
```

### 4. Cut-resistant reusable gloves

```json
{
  "canonical_title": "Cut-Resistant Work Gloves, ANSI A5, Puncture P3, Abrasion Level 3, Gray, Large",
  "short_description": "Gray cut-resistant work gloves, ANSI A5, puncture P3, abrasion level 3.",
  "supplier_sku": "CR-A5-P3-L-GRY",
  "supplier_cost": 22.00,
  "images": ["https://example.com/cr-1.jpg"],
  "category_slug": "reusable_work_gloves",
  "filter_attributes": {
    "material": "nitrile",
    "size": "l",
    "color": "gray",
    "cut_level_ansi": "a5",
    "puncture_level": "p3",
    "abrasion_level": "level_3"
  }
}
```

### 5. Insulated winter work gloves

```json
{
  "canonical_title": "Insulated Winter Work Gloves, Flame Resistant, ARC Category 2, Black, XL",
  "short_description": "Black insulated winter work gloves, flame resistant, ARC category 2.",
  "supplier_sku": "INS-FR-ARC2-XL-BLK",
  "supplier_cost": 38.00,
  "images": [],
  "category_slug": "reusable_work_gloves",
  "filter_attributes": {
    "material": "nitrile",
    "size": "xl",
    "color": "black",
    "flame_resistant": "flame_resistant",
    "arc_rating": "category_2",
    "warm_cold_weather": "winter"
  }
}
```

## File reference

- **SQL**: `supabase/migrations/20260315000001_catalogos_filters_and_review_flags.sql` — review_flags table, reusable_work_gloves category, attribute_definitions and attribute_allowed_values seeds for disposable_gloves and reusable_work_gloves.
- **Types**: `catalogos/src/lib/catalogos/normalized-product-types.ts`, `filter-attributes.ts`, `extraction-types.ts`.
- **Zod**: `catalogos/src/lib/catalogos/normalized-product-schema.ts`.
- **Rules extraction**: `catalogos/src/lib/catalogos/extract-filters.ts`.
- **Ensure new filter value**: `catalogos/src/lib/catalogos/ensure-allowed-value.ts`.
- **Review flags**: `catalogos/src/lib/catalogos/review-flags.ts`.
- **AI fallback**: `catalogos/src/lib/catalogos/ai-extraction-fallback.ts`.
