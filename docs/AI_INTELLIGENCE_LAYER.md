# GloveCubs AI Intelligence Layer

## Overview

The AI Intelligence Layer transforms GloveCubs from a static ETL pipeline into an AI-assisted procurement intelligence engine. It provides reasoning, explanation, and learning capabilities while maintaining strict safety constraints.

## AI Safety Rules

1. **AI may recommend, infer, summarize, and score**
2. **AI may NOT silently override hard business constraints**
3. **AI may NOT auto-merge records when critical attribute conflicts exist**
4. **All AI outputs are auditable with reasoning text and confidence**
5. **Low-confidence AI outcomes route to review, not silent apply**

---

## 1. AI Product Understanding

### Location
- `storefront/src/lib/ai/reasoning.ts` - `generateExtractionReasoning()`
- `catalogos/src/lib/ai/extraction-service.ts` - AI fallback extraction

### Capabilities
- Synonym resolution for glove terminology (material, color, grade, texture, brand)
- Field-level confidence scoring
- Inferred field tracking
- Ambiguity detection (assorted, variety, variant indicators)

### Synonym Dictionary
Pre-seeded with 50+ glove industry synonyms:
- Materials: `nitril` → `nitrile`, `nbr` → `nitrile`, `pvc` → `vinyl`
- Colors: `blk` → `black`, `wht` → `white`, `blu` → `blue`
- Grades: `exam` → `exam_grade`, `med` → `medical_grade`, `indust` → `industrial`
- Textures: `txtrd` → `textured`, `micro-textured` → `microtextured`
- Pack terms: `bx` → `box`, `cs` → `case`, `/bx` → `per_box`
- Brands: `kimberly clark` → `Kimberly-Clark`, `ammex` → `AMMEX`

### Output Format
```typescript
{
  extracted_attributes: {...},
  field_confidence: { material: 0.95, size: 0.70, ... },
  overall_confidence: 0.82,
  reasoning_summary: "Inferred fields: pack_qty. Warnings: Pack quantity was inferred.",
  inferred_fields: ["pack_qty"],
  synonym_resolutions: { "nitril": "nitrile" },
  ambiguity_warnings: ["Title contains 'assorted'..."]
}
```

---

## 2. AI Match Reasoning

### Location
- `storefront/src/lib/ai/reasoning.ts` - `generateMatchReasoning()`
- `storefront/src/lib/jobs/handlers/productMatch.ts` - Integration

### Hard Constraints (Cannot Be Overridden by AI)
| Constraint | Rule |
|------------|------|
| **Material** | Must match exactly |
| **Size** | Must match exactly |
| **Sterile** | Must match exactly |
| **Thickness** | Max 2 mil difference |
| **Pack Qty** | Must match exactly |

### Soft Attributes (AI Can Reason About)
- Brand match
- Color match
- UPC exact match
- MPN exact match

### Output Format
```typescript
{
  match_recommendation: "likely_match",
  confidence: 0.85,
  evidence_summary: "Exact matches: brand, material, size. Partial matches: color (80%)",
  matched_attributes: [...],
  conflict_summary: "Conflicts: units_per_case (critical)",
  conflicting_attributes: [...],
  hard_constraints_passed: false,
  material_match: true,
  size_match: true,
  sterile_match: true,
  thickness_match: true,
  pack_qty_match: false,
  needs_review: true,
  review_reason: "Hard constraint violations: pack_qty"
}
```

### Integration
- Match reasoning is generated in `productMatch.ts` handler
- Persisted to `ai_match_reasoning` table
- If hard constraints fail but rules suggested a match → escalates to review
- Human decisions captured for learning

---

## 3. AI Pricing Intelligence

### Location
- `storefront/src/lib/ai/reasoning.ts` - `generatePricingAnalysis()`

### Anomaly Detection
| Category | Indicators |
|----------|------------|
| `valid_best_price` | Within expected range, fresh data |
| `suspicious_outlier` | Price < 50% or > 200% of market avg |
| `stale_offer` | Data > 30 days old |
| `unit_normalization_issue` | Price < 30% of avg (likely per-unit listed as case) |
| `feed_error` | Invalid price (≤ 0) or > $10,000 |
| `review_required` | Multiple risk factors |

### Output Format
```typescript
{
  analysis_category: "suspicious_outlier",
  confidence: 0.75,
  reasoning_summary: "Price is 40% of market avg - flagged as outlier",
  anomaly_indicators: [
    { indicator: "price_too_low", value: "40%", threshold: "50%", severity: "medium" }
  ],
  is_suspicious: true,
  is_stale: false,
  has_normalization_issue: false,
  likely_feed_error: false,
  recommended_action: "flag_for_monitoring",
  action_reasoning: "Price is unusual but may be valid - monitor"
}
```

---

## 4. AI Supplier Discovery Intelligence

### Location
- `storefront/src/lib/ai/reasoning.ts` - `generateSupplierAnalysis()`

### Scoring Dimensions
- **Relevance Score**: Keyword detection, domain analysis
- **Category Fit Score**: Product signals, wholesale indicators
- **Catalog Usefulness Score**: Data feed availability, product count
- **Priority Score**: Average of all scores

### Signal Detection
| Signal Type | Examples |
|-------------|----------|
| Green Flags | `relevant_keywords`, `has_data_feed`, `wholesale_pricing` |
| Red Flags | `marketplace_not_distributor`, `duplicate_detected` |

### Duplicate Detection
- Normalized name comparison
- Domain matching

### Output Format
```typescript
{
  relevance_score: 0.75,
  category_fit_score: 0.80,
  catalog_usefulness_score: 0.60,
  priority_score: 0.72,
  classification_reasoning: "Positive: relevant_keywords. Relevance: 75%, Category fit: 80%",
  category_signals: [...],
  red_flags: [],
  green_flags: [{ flag: "relevant_keywords", confidence: 0.9, detail: "..." }],
  potential_duplicates: [],
  duplicate_confidence: 0,
  duplicate_reasoning: null,
  ingestion_recommended: true,
  ingestion_priority: "high",
  recommendation_reasoning: "High relevance (72%) with 1 positive signals"
}
```

---

## 5. AI Ops Copilot

### Location
- `storefront/src/lib/ai/ops-copilot.ts`

### Summary Types
| Type | Trigger | Content |
|------|---------|---------|
| `ingestion` | After ingestion runs | Failures, review items |
| `daily_guard` | After price guard | Anomalies, price changes |
| `audit` | After QA audit | Systemic issues, blocked actions |
| `discovery` | After supplier discovery | High-priority suppliers, duplicates |

### Highlight Categories
- `critical` - Requires immediate action
- `warning` - Should be reviewed soon
- `info` - Informational
- `success` - Positive outcome

### Admin Visibility
- `/admin/ai-intelligence` page shows:
  - AI accuracy by type
  - Recent pipeline summaries
  - Synonym candidates for verification

---

## 6. Learning Loop

### Location
- `storefront/src/lib/ai/feedback.ts`

### Feedback Capture Points
1. **Review Resolution** - Automatic capture when reviews are approved/rejected
2. **Extraction Correction** - When humans correct AI-extracted attributes
3. **Match Correction** - When humans override match decisions
4. **Pricing Override** - When humans change pricing recommendations

### Feedback Types
- `confirmed` - AI was correct
- `partially_corrected` - Some fields corrected
- `fully_corrected` - Major corrections needed
- `rejected` - AI output rejected entirely

### Synonym Learning
When humans correct extractions:
1. System detects field value changes
2. Creates unverified synonym candidate
3. Admin can verify via `/admin/ai-intelligence`
4. Verified synonyms added to production dictionary

### Statistics Tracking
- Total feedback by type
- Accuracy rate by AI function
- Common corrections
- Unused training data count

---

## Database Schema

### New Tables

| Table | Purpose |
|-------|---------|
| `ai_extraction_results` | Persisted extraction reasoning |
| `ai_match_reasoning` | Persisted match reasoning |
| `ai_pricing_analysis` | Persisted pricing analysis |
| `ai_supplier_analysis` | Persisted supplier analysis |
| `ai_ops_summaries` | Pipeline run summaries |
| `ai_feedback` | Human feedback on AI decisions |
| `ai_synonyms` | Synonym dictionary |

### Migration
`storefront/supabase/migrations/20260311000006_ai_intelligence_layer.sql`

---

## Production Integration

### Files Changed/Created

| File | Change |
|------|--------|
| `storefront/src/lib/ai/reasoning.ts` | NEW - Core AI reasoning |
| `storefront/src/lib/ai/ops-copilot.ts` | NEW - Ops summaries |
| `storefront/src/lib/ai/feedback.ts` | NEW - Learning loop |
| `storefront/src/lib/ai/index.ts` | NEW - Exports |
| `storefront/src/lib/jobs/handlers/productMatch.ts` | Added AI reasoning |
| `storefront/src/lib/jobs/handlers/auditRun.ts` | Added ops summary |
| `storefront/src/lib/review/updateReviewStatus.ts` | Added feedback capture |
| `storefront/src/app/admin/ai-intelligence/page.tsx` | NEW - Admin UI |

### Environment Variables

No new environment variables required. Uses existing:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (for AI extraction fallback, disabled by default)

---

## Where AI Is Used in Production Paths

| Pipeline Stage | AI Function | Status |
|----------------|-------------|--------|
| Product Normalization | Extraction reasoning | ✅ Integrated |
| Product Matching | Match reasoning + hard constraints | ✅ Integrated |
| Pricing Recommendation | Pricing analysis | ✅ Available |
| Supplier Discovery | Supplier analysis | ✅ Available |
| Review Resolution | Feedback capture | ✅ Integrated |
| Audit Completion | Ops summary | ✅ Integrated |

---

## Next Steps

1. **Enable AI Extraction Fallback** - Set `CATALOGOS_AI_EXTRACTION_ENABLED=true`
2. **Review Synonym Candidates** - Via `/admin/ai-intelligence`
3. **Monitor AI Accuracy** - Track feedback statistics
4. **Expand Synonym Dictionary** - As human corrections accumulate
