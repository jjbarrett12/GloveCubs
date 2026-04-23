# AI-Assisted Product Ingestion Pipeline — GLOVECUBS

## Overview

A production-ready pipeline for normalizing supplier product data into consistent, search-friendly, ecommerce-ready catalog records for bulk gloves and safety products.

---

## 1. Normalized Internal Product Schema

### Core Fields

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| `supplier_sku` | string | ✅ | supplier | Original supplier part number |
| `internal_sku` | string | generated | system | `GC-{supplier_sku}` |
| `canonical_title` | string | ✅ | AI+rules | SEO-optimized product title |
| `brand` | string | nullable | extracted | Canonical brand name |
| `manufacturer_part_number` | string | nullable | supplier | MPN if different from SKU |
| `upc` | string | nullable | supplier | UPC/EAN barcode |

### Glove Attributes

| Field | Type | Values | Extraction |
|-------|------|--------|------------|
| `material` | enum | nitrile, latex, vinyl, polyethylene, neoprene, blended | regex + AI |
| `thickness_mil` | string | 2-20 | regex from title/desc |
| `color` | enum | blue, black, white, purple, orange, etc. | regex + AI |
| `powder` | enum | powder_free, powdered | regex + AI |
| `sterility` | enum | sterile, non_sterile | regex + AI |
| `grade` | enum | medical_exam, industrial, food_service, janitorial, automotive | AI classification |
| `size_range` | string[] | XS, S, M, L, XL, XXL, 2XL, 3XL | parsed from sizes field |
| `texture` | enum | smooth, fingertip_textured, fully_textured | AI extraction |
| `cuff_style` | enum | beaded, non_beaded, extended | AI extraction |

### Quantities

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `pack_qty` | integer | 100 | Gloves per box |
| `case_qty` | integer | 1000 | Gloves per case |
| `boxes_per_case` | integer | 10 | Calculated: case_qty / pack_qty |

### Pricing

| Field | Type | Notes |
|-------|------|-------|
| `supplier_cost` | decimal | Raw cost from supplier |
| `suggested_price` | decimal | Cost × margin |
| `bulk_price` | decimal | Volume discount price |

### Content (AI-Generated)

| Field | Type | Max Length | Notes |
|-------|------|------------|-------|
| `short_description` | string | 160 | Meta description |
| `long_description` | string | 2000 | Full product description |
| `bullet_features` | string[] | 5-7 | Key selling points |
| `technical_specs` | object | - | Key-value specifications |
| `search_keywords` | string[] | 20 | SEO keywords |
| `seo_slug` | string | 100 | URL-safe slug |

### Categorization

| Field | Type | Values |
|-------|------|--------|
| `category` | enum | disposable_gloves, reusable_work_gloves |
| `subcategory` | string | Nitrile Exam, Cut Resistant, Coated, etc. |
| `industries` | string[] | healthcare, food_service, janitorial, etc. |
| `compliance` | string[] | fda_approved, astm_tested, food_safe, etc. |

### Images

| Field | Type | Notes |
|-------|------|-------|
| `primary_image` | string | Main product image URL |
| `images` | string[] | All image URLs |
| `image_filename_mapping` | object | Original → processed filenames |

### Metadata

| Field | Type | Notes |
|-------|------|-------|
| `import_batch_id` | uuid | Links to import batch |
| `supplier_id` | uuid | Source supplier |
| `raw_payload` | jsonb | Original supplier data |
| `confidence_scores` | object | Per-field confidence 0-1 |
| `review_flags` | array | Fields needing review |
| `status` | enum | pending, approved, rejected, merged |
| `created_at` | timestamp | - |
| `updated_at` | timestamp | - |

---

## 2. Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRODUCT INGESTION PIPELINE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   INPUT      │    │   STAGE 1    │    │   STAGE 2    │                  │
│  │   SOURCES    │───▶│   PARSE &    │───▶│   EXTRACT    │                  │
│  │              │    │   VALIDATE   │    │   ATTRIBUTES │                  │
│  │ • CSV        │    │              │    │              │                  │
│  │ • Excel      │    │ • Parse rows │    │ • Material   │                  │
│  │ • API feed   │    │ • Map cols   │    │ • Thickness  │                  │
│  │ • Web scrape │    │ • Validate   │    │ • Color etc  │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                 │                           │
│                                                 ▼                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   STAGE 5    │    │   STAGE 4    │    │   STAGE 3    │                  │
│  │   OUTPUT     │◀───│   VALIDATE   │◀───│   AI ENRICH  │                  │
│  │              │    │   & FLAG     │    │              │                  │
│  │ • Supabase   │    │              │    │ • Title gen  │                  │
│  │ • Staging    │    │ • Confidence │    │ • Desc gen   │                  │
│  │ • Review UI  │    │ • Missing    │    │ • Keywords   │                  │
│  │              │    │ • Conflicts  │    │ • Category   │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Transformation Rules

### 3.1 Material Extraction

```javascript
const MATERIAL_PATTERNS = [
  { pattern: /\bnitrile\b/i, value: 'nitrile', priority: 1 },
  { pattern: /\blatex\b(?!\s*free)/i, value: 'latex', priority: 1 },
  { pattern: /\bvinyl\b|\bpvc\b/i, value: 'vinyl', priority: 1 },
  { pattern: /\bpoly(?:ethylene)?\b|\bpe\b/i, value: 'polyethylene', priority: 2 },
  { pattern: /\bneoprene\b/i, value: 'neoprene', priority: 1 },
  { pattern: /\bhppe\b.*\bnitrile\b|\bnitrile\b.*\bhppe\b/i, value: 'hppe_nitrile', priority: 0 },
  { pattern: /\bnylon\b.*\bnitrile\b|\bnitrile\b.*\bnylon\b/i, value: 'nylon_nitrile', priority: 0 },
  { pattern: /\bleather\b|\bcowhide\b/i, value: 'leather', priority: 1 },
];
```

### 3.2 Thickness Extraction

```javascript
// Patterns: "4 mil", "4mil", "4-mil", "4 MIL"
const thicknessMil = text.match(/(\d+(?:\.\d+)?)\s*[-]?\s*mil\b/i)?.[1];
// Validate range: 1-20 mil for disposable, higher for work gloves
if (thicknessMil && parseFloat(thicknessMil) >= 1 && parseFloat(thicknessMil) <= 20) {
  return thicknessMil;
}
```

### 3.3 Pack/Case Quantity Parsing

```javascript
const PACK_PATTERNS = [
  /(\d+)\s*(?:\/|per)\s*(?:box|bx|pk|pack)\b/i,  // "100/box", "100 per box"
  /(?:box|bx)\s*(?:of\s*)?(\d+)\b/i,              // "box of 100"
  /(\d+)\s*ct\s*(?:box|bx)/i,                     // "100ct box"
];

const CASE_PATTERNS = [
  /(\d+)\s*(?:\/|per)\s*(?:case|cs)\b/i,
  /(\d+)\s*(?:bx|boxes)\s*(?:\/|per)\s*(?:case|cs)\b/i, // "10 bx/cs"
  /(?:case|cs)\s*(?:of\s*)?(\d+)\b/i,
];
```

### 3.4 Grade/Use Case Classification

| Keywords | Grade |
|----------|-------|
| exam, medical, healthcare, clinical | medical_exam |
| industrial, manufacturing, warehouse | industrial |
| food, restaurant, kitchen, culinary | food_service |
| janitorial, sanitation, cleaning | janitorial |
| automotive, mechanic, garage | automotive |

### 3.5 SEO Slug Generation

```javascript
function generateSlug(brand, material, color, thickness, sku) {
  const parts = [brand, material, color, thickness ? `${thickness}-mil` : null]
    .filter(Boolean)
    .map(s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const base = parts.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const skuSafe = sku.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${base}-${skuSafe}`.substring(0, 100);
}
```

---

## 4. AI Enrichment Rules

### 4.1 When to Use AI

| Scenario | AI Action | Fallback |
|----------|-----------|----------|
| Missing description | Generate from attributes | Template-based |
| Ambiguous material | Classify from title + context | Flag for review |
| Unknown brand | Extract and normalize | Keep raw value |
| Missing category | Classify from keywords | Default + flag |
| Incomplete specs | Infer from similar products | Mark as uncertain |

### 4.2 AI Prompt Templates

**Title Generation:**
```
Generate an SEO-optimized product title for a B2B glove product.

Input attributes:
- Brand: {brand}
- Material: {material}
- Thickness: {thickness}mil
- Color: {color}
- Powder: {powder}
- Grade: {grade}
- Pack Size: {pack_qty}/box, {case_qty}/case

Rules:
- Start with brand if known
- Include material, key differentiators
- Keep under 80 characters
- Target keywords: {material} gloves, {grade} gloves
- No marketing fluff

Output only the title, no explanation.
```

**Description Generation:**
```
Generate a product description for B2B buyers.

Product: {canonical_title}
Attributes: {attributes_json}

Target audience: janitorial companies, food service, medical clinics, industrial workers

Include:
1. One-sentence overview
2. Key benefits (3-4 sentences)
3. Compliance/certifications if known
4. Pack/case information

Do NOT:
- Invent specifications not in the input
- Add compliance claims unless stated
- Include pricing
- Use excessive marketing language

Output only the description (150-300 words).
```

### 4.3 Hallucination Prevention

```javascript
const AI_RULES = {
  // Never invent these fields - must come from source data
  STRICT_FIELDS: ['upc', 'supplier_sku', 'supplier_cost', 'images'],
  
  // Can be AI-generated but mark confidence
  ENRICHED_FIELDS: ['short_description', 'long_description', 'bullet_features', 'search_keywords'],
  
  // Can be AI-classified from context
  INFERRED_FIELDS: ['grade', 'industries', 'category', 'subcategory'],
  
  // Must match controlled vocabulary or flag
  VOCABULARY_FIELDS: ['material', 'color', 'powder', 'sterility', 'texture'],
};
```

---

## 5. Confidence Scoring

### 5.1 Per-Field Confidence

| Source | Confidence |
|--------|------------|
| Explicit column match | 1.0 |
| Regex from title | 0.9 |
| Regex from description | 0.8 |
| AI classification | 0.7 |
| AI generation | 0.6 |
| Inferred from similar | 0.5 |
| Default value | 0.3 |

### 5.2 Overall Row Confidence

```javascript
function calculateRowConfidence(confidenceScores) {
  const criticalFields = ['supplier_sku', 'material', 'supplier_cost'];
  const importantFields = ['canonical_title', 'category', 'pack_qty'];
  
  const criticalAvg = average(criticalFields.map(f => confidenceScores[f] || 0));
  const importantAvg = average(importantFields.map(f => confidenceScores[f] || 0));
  
  // Critical fields weighted 60%, important 40%
  return criticalAvg * 0.6 + importantAvg * 0.4;
}
```

### 5.3 Review Flags

| Flag Type | Severity | Trigger |
|-----------|----------|---------|
| `missing_critical` | error | SKU, material, or cost missing |
| `missing_important` | warning | Name, category, or pack_qty missing |
| `low_confidence` | warning | Any field confidence < 0.5 |
| `vocabulary_mismatch` | warning | Value not in controlled vocabulary |
| `possible_duplicate` | warning | SKU exists in database |
| `price_anomaly` | warning | Cost outside expected range |
| `image_missing` | warning | No image URLs found |

---

## 6. Files & Services to Create

### 6.1 Core Pipeline

| File | Purpose |
|------|---------|
| `lib/ingestion/schema.js` | Normalized product schema + validation |
| `lib/ingestion/parser.js` | CSV/Excel parsing with column mapping |
| `lib/ingestion/extractor.js` | Attribute extraction (regex + rules) |
| `lib/ingestion/enricher.js` | AI enrichment service |
| `lib/ingestion/validator.js` | Validation + confidence scoring |
| `lib/ingestion/flagging.js` | Review flag generation |
| `lib/ingestion/pipeline.js` | Orchestrates all stages |

### 6.2 Services

| File | Purpose |
|------|---------|
| `services/ingestionService.js` | High-level batch import API |
| `services/aiEnrichmentService.js` | OpenAI integration with fallbacks |

### 6.3 Scripts

| File | Purpose |
|------|---------|
| `scripts/ingest-products.js` | CLI for batch import |
| `scripts/validate-import.js` | Pre-import validation |
| `scripts/export-staging.js` | Export staging for review |

---

## 7. Supabase Output Format

### 7.1 Target Tables

**catalogos.supplier_products_raw:**
```sql
{
  batch_id, supplier_id, external_id (supplier_sku),
  raw_payload (original JSON), checksum
}
```

**catalogos.supplier_products_normalized:**
```sql
{
  batch_id, raw_id, supplier_id,
  normalized_data: {
    canonical_title, brand, short_description, long_description,
    bullet_features, search_keywords, seo_slug, supplier_cost,
    images, pack_qty, case_qty
  },
  attributes: {
    material, thickness_mil, color, powder, sterility, grade,
    industries, compliance, texture, cuff_style, size_range
  },
  match_confidence, master_product_id, status,
  review_flags: [{ flag_type, attribute_key, message, severity }]
}
```

### 7.2 Insert Flow

```javascript
async function insertToSupabase(batch) {
  const { batchId, supplierId, rows } = batch;
  
  // 1. Insert raw records
  const rawRecords = rows.map(r => ({
    batch_id: batchId,
    supplier_id: supplierId,
    external_id: r.supplier_sku,
    raw_payload: r._raw,
    checksum: computeChecksum(r._raw)
  }));
  const rawResult = await supabase.from('catalogos.supplier_products_raw')
    .insert(rawRecords).select('id, external_id');
  
  // 2. Insert normalized records
  const normalizedRecords = rows.map((r, i) => ({
    batch_id: batchId,
    raw_id: rawResult.data[i].id,
    supplier_id: supplierId,
    normalized_data: extractNormalizedData(r),
    attributes: extractAttributes(r),
    match_confidence: r._confidence.overall,
    status: r._confidence.overall >= 0.7 ? 'pending' : 'review_required'
  }));
  
  return supabase.from('catalogos.supplier_products_normalized')
    .insert(normalizedRecords);
}
```

---

## 8. Implementation Priority

### Phase 1: Core Pipeline (MVP)
1. ✅ Schema definition with Zod validation
2. ✅ CSV parser with flexible column mapping
3. ✅ Rule-based attribute extraction
4. ✅ Basic confidence scoring
5. ✅ Supabase insertion

### Phase 2: AI Enrichment
1. Title generation service
2. Description generation service
3. Category classification
4. Keyword extraction
5. Fallback handling

### Phase 3: Quality & Review
1. Duplicate detection
2. Review flagging system
3. Staging UI integration
4. Bulk approval workflow

### Phase 4: Advanced
1. Image processing pipeline
2. Similar product matching
3. Price validation
4. Inventory sync hooks
