# Supplier-Ingestion Normalization Engine

Normalization engine that runs **rules-first** against the approved GloveCubs attribute dictionary. No new schema; uses existing categories, attributes, allowed values, and requirements.

## File Paths

| File | Purpose |
|------|---------|
| `catalogos/src/lib/normalization/normalization-utils.ts` | Content extraction from raw rows (canonical_title, supplier_sku, supplier_cost, images, etc.). |
| `catalogos/src/lib/normalization/synonym-lookup.ts` | Synonym lookup: raw → allowed value; returns unmapped when not in dictionary. |
| `catalogos/src/lib/normalization/extract-attributes-dictionary.ts` | Deterministic extraction for disposable vs work gloves; dictionary-only values; unmapped list. |
| `catalogos/src/lib/normalization/category-inference.ts` | Infer `disposable_gloves` vs `reusable_work_gloves` from row content. |
| `catalogos/src/lib/normalization/normalization-engine.ts` | Orchestration: content + category + extraction + validation + review flags. |
| `catalogos/src/lib/normalization/staging-payload.ts` | Build and Zod-validate payload for `supplier_products_normalized` insert. |
| `catalogos/src/lib/normalization/types.ts` | `NormalizationResult`, `ReviewFlag`, `NormalizationEngineOptions`. |
| `catalogos/src/lib/normalization/index.ts` | Public API. |
| `catalogos/src/lib/normalization/normalization-engine.test.ts` | Test cases: synonym lookup, extraction, validation, flags, staging payload. |

## Usage

```ts
import { runNormalization, buildStagingPayload } from "@/lib/normalization";

const rawRow = { name: "Blue nitrile PF exam gloves L 4 mil", sku: "NIT-001", cost: 85, material: "nitrile", color: "blue", size: "l", brand: "Acme", case_qty: 1000 };

const result = runNormalization(rawRow, { categoryHint: "disposable_gloves" });
// result.content, result.category_slug, result.filter_attributes, result.confidence_by_key, result.unmapped_values, result.review_flags

const payload = buildStagingPayload({
  result,
  batchId: "...",
  rawId: "...",
  supplierId: "...",
  matchConfidence: 0.9,
  masterProductId: "...",
});
// payload.normalized_data, payload.attributes, payload.status = "pending"
```

## Rules

- **Rules first, AI second** – Engine is fully deterministic; AI can be layered later for low-confidence gaps.
- **Never invent values** – Only dictionary-allowed values are set; unknown values are captured in `unmapped_values` and `review_flags` (code `unmapped_value`).
- **Missing required** – `validateAttributesByCategory` drives `missing_required` and `missing_strongly_preferred` flags.
- **Low confidence** – When `confidence_by_key[key] < threshold` (default 0.6), a `low_confidence` review flag is added.
- **Staging payload** – Zod-validated; `normalized_data` includes content, filter_attributes, confidence_by_key, unmapped_values, anomaly_flags.

## Tests

From `catalogos`:

```bash
npm run test
```

Covers: synonym lookup (PF→powder_free, lg→l, 1000/cs→case_1000_ct), unmapped material, content extraction, category inference, disposable/work extraction, missing-required validation, engine flags, staging payload build.
