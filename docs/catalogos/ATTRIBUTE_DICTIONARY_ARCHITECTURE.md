# GloveCubs CatalogOS — Attribute Dictionary Architecture

## 1. Architecture

The attribute dictionary is the single source of truth for:

- **Supplier ingestion**: Raw values are normalized via synonym maps and validated against allowed values.
- **Normalized product records**: Staging and master products store filter attributes that reference these definitions.
- **Review queue validation**: Required vs strongly_preferred is enforced per category; missing required attributes block or flag.
- **Storefront faceted filtering**: Filter groups (display_group) and sort_order drive UI; allowed values come from attribute_allowed_values.
- **Search metadata**: Attributes are indexed for search (e.g. material, size, color).
- **Product matching**: Matching uses normalized attributes (material, size, thickness, etc.).
- **SEO consistency**: Canonical titles and structured data use the same slugs and labels.

**Design principles:**

- Controlled definitions only; no ad hoc freeform attribute keys or values in the dictionary.
- Category-specific attribute sets and requirement levels.
- Machine-safe slugs (lowercase, snake_case) and human-readable labels in attribute_definitions.
- Single-select vs multi-select: single = one value per attribute; multi = array (industries, compliance_certifications).
- Synonym maps (attribute_value_synonyms + in-memory fallback) normalize supplier text to allowed values.

## 2. SQL tables (migration 20260316000001)

- **categories**: slug, name, description, sort_order. Values: disposable_gloves, reusable_work_gloves.
- **attribute_definitions**: category_id, attribute_key, label, value_type, data_type, cardinality, display_group, is_required, is_filterable, sort_order. Extended with display_group, data_type, cardinality.
- **attribute_allowed_values**: attribute_definition_id, value_text, value_number, sort_order. One row per allowed value.
- **category_attribute_requirements**: category_id, attribute_definition_id, requirement_level (required | strongly_preferred).
- **attribute_value_synonyms**: attribute_definition_id, raw_value, normalized_value. Used during ingestion to map e.g. "PF" → "powder_free".

Indexes and constraints: unique (category_id, attribute_key), unique (attribute_definition_id, value_text), unique (category_id, attribute_definition_id), unique (attribute_definition_id, raw_value).

## 3. Seed data

Migration seeds:

- Categories: disposable_gloves, reusable_work_gloves.
- Attribute definitions for both categories (universal + category-specific), with display_group (universal, disposable_specs, work_glove_specs) and cardinality (single | multi).
- All allowed values for category, material, size, color, thickness_mil, powder, grade, industries, compliance_certifications, texture, cuff_style, hand_orientation, packaging, sterility, cut_level_ansi, puncture_level, abrasion_level, flame_resistant, arc_rating, warm_cold_weather.
- category_attribute_requirements: required and strongly_preferred per category as specified.
- attribute_value_synonyms: PF → powder_free, powder free → powder_free, exam grade → medical_exam_grade, foodservice → food_service_grade, lg → l, xlrg → xl, blk → black, blu → blue, ambi → ambidextrous, 1000/cs → case_1000_ct, 100 ct → box_100_ct, etc.

## 4. TypeScript types

- **CategorySlug**: disposable_gloves | reusable_work_gloves.
- **AttributeSlug**: universal + disposable or work glove keys.
- **AllowedValueSlug**: union of all allowed value literal types.
- **NormalizedDisposableGloveAttributes**: interface with category, material, size, color, brand, price_range, thickness_mil, powder, grade, industries, compliance_certifications, texture, cuff_style, hand_orientation, packaging, sterility.
- **NormalizedWorkGloveAttributes**: category, size, color, brand, price_range, cut_level_ansi, puncture_level, abrasion_level, flame_resistant, arc_rating, warm_cold_weather (material optional).
- **NormalizedProductContent**: canonical_title, short_description, long_description, product_details, specifications, bullets, brand, manufacturer_part_number, supplier_sku, upc, supplier_cost, images, stock_status, case_qty, box_qty, lead_time_days.
- **NormalizedSupplierProductPayload**: content + category_slug + filter_attributes.

## 5. Zod schemas

- normalizedProductContentSchema
- normalizedDisposableGloveAttributesSchema
- normalizedWorkGloveAttributesSchema
- normalizedSupplierProductPayloadSchema

Used to validate ingestion output before writing to supplier_products_normalized.

## 6. Synonym / normalization maps

- **DB**: attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value).
- **In-memory** (synonym-normalize.ts): SYNONYM_MAP by attribute_key; normalizeAttributeValue(attributeKey, rawValue), normalizeToAllowed(attributeKey, rawValue, allowedValues). Examples: PF → powder_free, powder free → powder_free, exam grade → medical_exam_grade, foodservice → food_service_grade, lg → l, xlrg → xl, blk → black, blu → blue, ambi → ambidextrous, 1000/cs → case_1000_ct, 100 ct → box_100_ct.

## 7. Single-select vs multi-select

- **Single-select**: category, material, size, color, brand, price_range, thickness_mil, powder, grade, texture, cuff_style, hand_orientation, packaging, sterility, cut_level_ansi, puncture_level, abrasion_level, flame_resistant, arc_rating, warm_cold_weather. One value per attribute.
- **Multi-select**: industries, compliance_certifications. Array of allowed values. Stored as string_array in attribute_definitions; cardinality = 'multi'.

## 8. Validation logic

- **validateAttributesByCategory(categorySlug, filterAttributes)** returns { valid, missing_required, missing_strongly_preferred, errors }.
- Disposable required: category, material, size, color, brand, packaging, powder, grade.
- Disposable strongly preferred: thickness_mil, texture, cuff_style, sterility, industries, compliance_certifications.
- Work glove required: category, size, color, brand.
- Work glove strongly preferred: cut_level_ansi, puncture_level, abrasion_level, flame_resistant, arc_rating, warm_cold_weather.

## 9. Example normalized outputs

### Blue nitrile powder-free exam gloves large 4 mil case 1000

```json
{
  "content": {
    "canonical_title": "Nitrile Exam Gloves, Powder-Free, 4 mil, Large, Blue, 1000/Case",
    "supplier_sku": "NIT-PF-4-L-BLU-1000",
    "supplier_cost": 85.00,
    "images": [],
    "case_qty": 1000
  },
  "category_slug": "disposable_gloves",
  "filter_attributes": {
    "category": "disposable_gloves",
    "material": "nitrile",
    "size": "l",
    "color": "blue",
    "brand": "Acme",
    "packaging": "case_1000_ct",
    "powder": "powder_free",
    "grade": "medical_exam_grade",
    "thickness_mil": "4"
  }
}
```

### Black latex industrial gloves xl powdered 100 ct

```json
{
  "content": {
    "canonical_title": "Latex Industrial Gloves, Powdered, Black, XL, 100/Box",
    "supplier_sku": "LAT-XL-BLK-100",
    "supplier_cost": 12.00,
    "images": [],
    "box_qty": 100
  },
  "category_slug": "disposable_gloves",
  "filter_attributes": {
    "category": "disposable_gloves",
    "material": "latex",
    "size": "xl",
    "color": "black",
    "brand": "Acme",
    "packaging": "box_100_ct",
    "powder": "powdered",
    "grade": "industrial_grade"
  }
}
```

### Clear vinyl food service gloves medium box 200

```json
{
  "content": {
    "canonical_title": "Vinyl Food Service Gloves, Clear, Medium, 200/Box",
    "supplier_sku": "VIN-M-CLR-200",
    "supplier_cost": 28.00,
    "images": [],
    "box_qty": 200
  },
  "category_slug": "disposable_gloves",
  "filter_attributes": {
    "category": "disposable_gloves",
    "material": "vinyl",
    "size": "m",
    "color": "white",
    "brand": "Acme",
    "packaging": "box_200_250_ct",
    "grade": "food_service_grade"
  }
}
```

*(Note: "clear" not in allowed color list in spec; use white or add clear to seed if needed.)*

### ANSI A4 cut resistant work gloves large

```json
{
  "content": {
    "canonical_title": "Cut-Resistant Work Gloves, ANSI A4, Large",
    "supplier_sku": "CR-A4-L",
    "supplier_cost": 22.00,
    "images": []
  },
  "category_slug": "reusable_work_gloves",
  "filter_attributes": {
    "category": "reusable_work_gloves",
    "size": "l",
    "color": "black",
    "brand": "Acme",
    "cut_level_ansi": "a4"
  }
}
```

### Insulated winter work gloves xl

```json
{
  "content": {
    "canonical_title": "Insulated Winter Work Gloves, XL",
    "supplier_sku": "INS-WIN-XL",
    "supplier_cost": 35.00,
    "images": []
  },
  "category_slug": "reusable_work_gloves",
  "filter_attributes": {
    "category": "reusable_work_gloves",
    "size": "xl",
    "color": "black",
    "brand": "Acme",
    "warm_cold_weather": "winter"
  }
}
```

## 10. File reference

- **SQL**: `supabase/migrations/20260316000001_catalogos_attribute_dictionary.sql`
- **Types**: `catalogos/src/lib/catalogos/attribute-dictionary-types.ts`
- **Zod**: `catalogos/src/lib/catalogos/attribute-dictionary-schema.ts`
- **Synonyms**: `catalogos/src/lib/catalogos/synonym-normalize.ts`
- **Validation**: `catalogos/src/lib/catalogos/attribute-validation.ts`
