# Product Ingestion Pipeline

AI-assisted pipeline for normalizing supplier product data into consistent, search-friendly, ecommerce-ready catalog records.

## New Pipeline Location

**Note:** The main ingestion pipeline has been moved to `lib/ingestion/`. This legacy pipeline (`glovePipeline.js`) is still available for basic CSV processing but the new pipeline offers:

- AI-powered title and description generation
- Confidence scoring per field
- Review flagging for uncertain data
- Controlled vocabulary validation
- Supabase staging workflow integration

## Usage

### New Pipeline (Recommended)

```bash
# Dry run with verbose output
node scripts/ingest-products.js products.csv --dry-run --verbose

# Export normalized JSON
node scripts/ingest-products.js products.csv --output normalized.json

# Export items needing review to CSV
node scripts/ingest-products.js products.csv --review needs-review.csv
```

### Legacy Pipeline

```bash
node scripts/ingest-supplier-csv.js products-import.csv --dry-run
```

## Pipeline Architecture

```
INPUT → PARSE → EXTRACT → ENRICH → VALIDATE → OUTPUT
  │        │        │         │         │         │
  CSV   Headers  Material   AI Title  Confidence  Supabase
  Excel  Mapping  Color     AI Desc   Flags      Staging
  API    Values   Thickness Keywords  Review
```

## Attribute Extraction

| Attribute | Extraction Method | Confidence |
|-----------|-------------------|------------|
| Material | Column → Regex → AI | 1.0 → 0.9 → 0.7 |
| Thickness | Column → Regex | 1.0 → 0.9 |
| Color | Column → Regex | 1.0 → 0.8 |
| Powder | Column → Regex | 1.0 → 0.9 |
| Grade | Column → AI Classification | 1.0 → 0.7 |
| Pack/Case Qty | Column → Regex → Default | 1.0 → 0.9 → 0.3 |

## AI Enrichment

When `OPENAI_API_KEY` is configured:

1. **Title Generation** — SEO-optimized product titles
2. **Description Generation** — B2B-focused product descriptions
3. **Bullet Features** — 5-6 key selling points
4. **Category Classification** — Disposable vs Work Gloves
5. **Keyword Generation** — Search optimization tags

Fallback heuristics are used when AI is unavailable.

## Review Flags

| Flag | Severity | Trigger |
|------|----------|---------|
| `missing_critical` | error | SKU, material, or cost missing |
| `missing_important` | warning | Title, category, pack_qty missing |
| `low_confidence` | warning | Any field < 50% confidence |
| `vocabulary_mismatch` | warning | Value not in controlled list |
| `price_anomaly` | warning | Cost outside $1-$200 range |
| `image_missing` | warning | No images found |

## Files

| File | Purpose |
|------|---------|
| `lib/ingestion/schema.js` | Normalized schema + vocabularies |
| `lib/ingestion/extractor.js` | Regex attribute extraction |
| `lib/ingestion/enricher.js` | AI enrichment service |
| `lib/ingestion/validator.js` | Confidence + flags |
| `lib/ingestion/pipeline.js` | Main orchestrator |
| `services/ingestionService.js` | Supabase integration |
| `scripts/ingest-products.js` | CLI tool |

## See Also

- `docs/PRODUCT_INGESTION_PIPELINE.md` — Full design document
