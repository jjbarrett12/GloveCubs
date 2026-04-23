# CatalogOS AI Fallback Architecture

## Principle: Rules First, AI Second

- **Deterministic extraction and matching always run first.**
- **AI is invoked only when confidence is below threshold** (e.g. extraction confidence &lt; 0.6 or match confidence &lt; 0.6).
- **Human review is required when the system is still uncertain** (low confidence or AI-used flag).
- **AI-generated guesses must never be silently published** — they are stored with explainability and warnings so the review queue surfaces them.

## Flow

```
Raw row
  → Rules-based attribute extraction
  → Extraction confidence computed
  → IF extraction_confidence < EXTRACTION_AI_THRESHOLD AND AI_EXTRACTION_ENABLED
       → AI extraction fallback (structured JSON)
       → Merge rules + AI (rules take precedence where present; AI fills gaps)
       → Set extraction_explanation, ai_extraction_used = true
  → Normalized row + attributes

Normalized row
  → Rules-based matching (UPC → attributes → fuzzy title)
  → Match confidence computed
  → IF match_confidence < MATCH_AI_THRESHOLD AND AI_MATCHING_ENABLED
       → AI matching fallback (structured JSON)
       → Use AI suggestion only as recommendation; store explanation
       → Set match_explanation, ai_matching_used = true
  → Staging row (pending) with optional master_product_id, confidence, explanation
  → IF ai_extraction_used OR ai_matching_used
       → Add anomaly/warning "AI_SUGGESTED_NEEDS_REVIEW" so it never publishes silently
```

## Service Boundaries

| Layer | Responsibility |
|-------|----------------|
| **Rules extraction** | Deterministic parsing (material, color, size, thickness, etc.). |
| **AI extraction contract** | Input: raw row + rules result + confidence. Output: normalized category, attributes, confidence, explanation, suggested title. Zod-validated. |
| **Rules matching** | UPC exact → attribute match → fuzzy title. |
| **AI matching contract** | Input: normalized row + candidate summaries. Output: suggested master id or no-match, confidence, explanation. Zod-validated. |
| **Orchestration** | Decides when to call AI; merges rules + AI; sets explainability fields; enforces "AI used" warning. |

## Feature Flags

- `CATALOGOS_AI_EXTRACTION_ENABLED` (env): enable AI extraction fallback. Default `false`.
- `CATALOGOS_AI_MATCHING_ENABLED` (env): enable AI matching fallback. Default `false`.
- When disabled, pipeline behaves as today (rules only); no AI calls.

## Confidence Thresholds

- `EXTRACTION_CONFIDENCE_AI_THRESHOLD` (default 0.6): below this, consider AI extraction.
- `MATCH_CONFIDENCE_AI_THRESHOLD` (default 0.6): below this, consider AI matching.
- Human review: always when `ai_extraction_used` or `ai_matching_used` is true; or when final confidence &lt; 0.6.

## DB Fields for AI and Explainability

Store on **supplier_products_normalized** (or equivalent staging table):

| Field | Type | Purpose |
|-------|------|--------|
| `extraction_explanation` | TEXT | Why attributes were chosen (rules vs AI; which fields came from AI). |
| `ai_extraction_used` | BOOLEAN | True if AI extraction was invoked for this row. |
| `ai_extraction_result` | JSONB | Full AI extraction response (for audit and debugging). |
| `match_explanation` | TEXT | Why this master product was matched (or no match). |
| `ai_matching_used` | BOOLEAN | True if AI matching was invoked. |
| `ai_match_result` | JSONB | Full AI match response (suggested id, confidence, explanation). |

Add anomaly/warning when `ai_extraction_used OR ai_matching_used`: code `AI_SUGGESTED_NEEDS_REVIEW`, severity `warning`, message "AI-assisted; verify before publish."

## Retry and Failure Safety

- **AI extraction**: On failure (timeout, invalid JSON, Zod validation error), keep rules-only result; set optional `ai_extraction_failed: true` in metadata; do not block pipeline.
- **AI matching**: On failure, keep rules-only match result; set optional `ai_matching_failed: true`; do not block pipeline.
- **Structured output**: All AI responses are validated with Zod; invalid responses are discarded and the pipeline continues with rules-only.

## Warning System

- Any row with `ai_extraction_used` or `ai_matching_used` must have an anomaly/warning so the review UI shows "AI-suggested; verify before publish."
- Publish workflow must not auto-publish rows that have this warning without explicit admin approval.

---

## Example prompts (glove products)

**Extraction (ambiguous row):**  
Raw: `{ "name": "NTRL PF EXM 4mil M Blk 100/CS", "sku": "NCF235", "description": "" }`  
Rules may get material=nitrile, powder_free=true, size=M, color=black from abbreviations; thickness and case_qty from "4mil" and "100/CS". When description is empty and title is highly abbreviated, rules productTypeConfidence may be &lt; 0.6, so AI is invoked. AI prompt includes rules-extracted attributes and asks for normalized_category_slug, extracted_attributes (fill gaps), explanation, suggested_canonical_title (e.g. "Nitrile Powder-Free Exam Glove, 4 mil, Medium, Black, 100/CS").

**Matching (no UPC, partial overlap):**  
Normalized product: nitrile, 4mil, M, black, 100/CS. Rules match finds no UPC and attribute overlap 0.5 (below threshold). AI matching receives normalized name/attributes and candidate master list (id, sku, name). AI returns suggested_master_product_id (if a candidate is likely the same product), match_confidence, explanation ("Same material, size, thickness; brand differs"), no_match_recommendation=false, possible_duplicate=false.
