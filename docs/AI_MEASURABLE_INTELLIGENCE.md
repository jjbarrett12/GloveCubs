# AI Measurable Intelligence System

## Overview

This document describes the GloveCubs AI Intelligence System enhancements that enable measurement, improvement, and operational intelligence.

## Components

### 1. AI Evaluation Harness

**Location**: `storefront/src/lib/ai/evaluation/`

Provides dataset-based evaluation for measuring AI accuracy:

- **`extractionEval.ts`**: Measures attribute extraction accuracy
- **`matchingEval.ts`**: Measures product matching accuracy
- **`pricingEval.ts`**: Measures pricing anomaly detection precision
- **`synonymEval.ts`**: Measures synonym resolution quality
- **`reportGenerator.ts`**: Generates comprehensive evaluation reports

**Metrics calculated**:
- Precision
- Recall
- Accuracy
- False positive rate
- False negative rate
- F1 score
- Confidence calibration

**Usage**:
```bash
npm run ai:evaluate
```

**Datasets**: `/data/ai-evals/`
- `extraction_dataset.json`
- `matching_dataset.json`
- `pricing_dataset.json`

### 2. AI Performance Metrics

**Location**: `storefront/src/lib/ai/metrics.ts`

**Database Table**: `catalogos.ai_performance_metrics`

Persistent tracking of AI performance over time:

| Metric Type | Description |
|-------------|-------------|
| `extraction_accuracy` | Extraction correctness rate |
| `match_accuracy` | Match recommendation accuracy |
| `pricing_anomaly_precision` | Anomaly detection precision |
| `review_rate` | Rate of items sent to review |
| `auto_approval_rate` | Auto-approval percentage |
| `operator_correction_rate` | Human correction rate |
| `confidence_calibration` | How well confidence predicts accuracy |
| `hard_constraint_accuracy` | Hard constraint check accuracy |
| `llm_escalation_rate` | LLM escalation frequency |

**Key Functions**:
- `recordAiMetrics()` - Record metrics after pipeline runs
- `collectPipelineMetrics()` - Collect metrics from AI tables
- `getAggregatedMetrics()` - Get aggregated metrics for dashboards
- `getMetricTrend()` - Get metric trends over time

### 3. Selective LLM Escalation

**Location**: `storefront/src/lib/ai/llmEscalation.ts`

**Database Table**: `catalogos.ai_llm_usage`

LLM is activated ONLY when confidence is low:

| Escalation Type | Threshold |
|-----------------|-----------|
| Extraction | < 65% confidence |
| Matching | < 70% confidence |
| Pricing | < 65% confidence |

**Safety Rules**:
- LLM cannot override hard constraints (material, size, sterile, thickness, pack qty)
- LLM confidence capped at 85% to prevent over-reliance
- Hard constraint conflicts force review even if LLM suggests match
- Cost guard auto-disables escalation if daily limit exceeded

**Key Functions**:
- `resolveExtractionAmbiguity()` - LLM resolution for extraction
- `resolveMatchAmbiguity()` - LLM resolution for matching
- `resolvePricingAnomaly()` - LLM resolution for pricing
- `getLLMEscalationStatus()` - Current LLM status and costs

**Cost Controls**:
- Daily cost limit (configurable, default $10)
- Rate limiter (default 60 requests/minute)
- Usage tracking per request

### 4. Operational Prioritization

**Location**: `storefront/src/lib/ai/prioritization.ts`

Review queue priority scoring based on:

| Factor | Weight |
|--------|--------|
| Confidence (inverse) | 20% |
| Margin impact | 25% |
| Supplier reliability | 10% |
| Price spread | 15% |
| Data completeness | 10% |
| Issue severity | 15% |
| Age factor | 5% |

**Priority Bands**:
- `critical` (score ≥ 0.8)
- `high` (score ≥ 0.6)
- `normal` (score ≥ 0.3)
- `low` (score < 0.3)

**Database Columns**: Added to `review_queue`:
- `priority_score` - Numeric priority score
- `priority_band` - Priority band label

### 5. Enhanced Ops Copilot

**Location**: `storefront/src/lib/ai/ops-copilot.ts`

Daily intelligence reports include:

- Top anomalies (type, count, severity)
- Largest price spreads (product, spread %, savings opportunity)
- Most corrected AI decisions (type, correction rate)
- Suppliers with most errors
- Frequent synonym corrections
- AI accuracy summary
- Actionable recommendations

**Key Function**: `generateDailyOpsReport()`

### 6. Feedback Loop Improvements

**Location**: `storefront/src/lib/ai/feedback.ts`

Enhanced learning from operator corrections:

**Structured Corrections**:
```typescript
interface StructuredCorrection {
  corrected_field: string;
  original_prediction: unknown;
  corrected_value: unknown;
  confidence_delta: number;
}
```

**Learning Candidates**:
- Identifies patterns in corrections
- Generates synonym candidates
- Suggests rule adjustments
- Recommends threshold changes

**Key Functions**:
- `generateLearningCandidates()` - Find patterns in corrections
- `applyLearningCandidate()` - Apply learned synonyms
- `captureStructuredCorrections()` - Capture detailed corrections

### 7. Safety & Cost Controls

**Database Table**: `catalogos.ai_llm_usage`

**Columns**:
- `request_type` - Type of LLM request
- `model` - Model used (default: gpt-4o-mini)
- `tokens_input` / `tokens_output` / `tokens_total`
- `cost_estimate` - Estimated cost in USD
- `latency_ms` - Request latency
- `success` - Whether request succeeded
- `error_message` - Error details if failed

**Agent Rules** (in `catalogos.agent_rules`):
- `daily_llm_cost_limit` - Max daily spend
- `llm_rate_limit_per_minute` - Rate limiter
- `llm_escalation_enabled` - Master enable/disable
- Confidence thresholds per escalation type

## Database Migrations

**File**: `storefront/supabase/migrations/20260311000007_ai_performance_metrics.sql`

Creates:
1. `catalogos.ai_performance_metrics` - Performance tracking
2. `catalogos.ai_llm_usage` - LLM usage and costs
3. `catalogos.ai_llm_daily_costs` view - Daily cost aggregation
4. Agent rule seeds for AI system configuration
5. Priority columns on `review_queue`
6. `get_ai_performance_trend()` function

## Integration Points

### Nightly Cron
- Collects and records AI metrics
- Updates review queue priorities
- Generates daily ops report
- Creates learning candidates

### Admin UI
**Route**: `/admin/ai-intelligence`

**Tabs**:
1. **Overview** - Accuracy by type, pipeline summaries
2. **Metrics** - Performance metrics history
3. **Learning** - Synonym verification
4. **LLM** - Escalation status and configuration

## Files Created/Modified

### New Files
- `storefront/src/lib/ai/evaluation/types.ts`
- `storefront/src/lib/ai/evaluation/extractionEval.ts`
- `storefront/src/lib/ai/evaluation/matchingEval.ts`
- `storefront/src/lib/ai/evaluation/pricingEval.ts`
- `storefront/src/lib/ai/evaluation/synonymEval.ts`
- `storefront/src/lib/ai/evaluation/reportGenerator.ts`
- `storefront/src/lib/ai/evaluation/index.ts`
- `storefront/src/lib/ai/metrics.ts`
- `storefront/src/lib/ai/llmEscalation.ts`
- `storefront/src/lib/ai/prioritization.ts`
- `storefront/scripts/ai-evaluate.ts`
- `data/ai-evals/extraction_dataset.json`
- `data/ai-evals/matching_dataset.json`
- `data/ai-evals/pricing_dataset.json`
- `storefront/supabase/migrations/20260311000007_ai_performance_metrics.sql`

### Modified Files
- `storefront/src/lib/ai/index.ts` - Added exports
- `storefront/src/lib/ai/ops-copilot.ts` - Added daily report
- `storefront/src/lib/ai/feedback.ts` - Added learning candidates
- `storefront/src/app/admin/ai-intelligence/page.tsx` - Enhanced dashboard
- `storefront/src/app/api/internal/cron/nightly/route.ts` - AI metrics collection
- `storefront/package.json` - Added ai:evaluate script

## Success Criteria

The AI layer now:
- ✅ Measures its own performance via evaluation harness
- ✅ Improves using operator feedback via learning candidates
- ✅ Escalates to LLM only when needed (confidence-based)
- ✅ Prioritizes operator attention with scoring
- ✅ Provides operational intelligence via daily reports
- ✅ Remains deterministic-first with LLM as advisory
- ✅ Has cost and safety guardrails for LLM usage
