# Recommendation Outcomes and Closed-Loop Learning

## Overview

The Recommendation Outcomes system enables GloveCubs to measure whether recommendations were actually good, track realized outcomes, and improve future scoring through closed-loop learning.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLOSED-LOOP LEARNING                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │   Supplier       │    │     RECOMMENDATION OUTCOMES       │  │
│  │ Recommendations  │───▶│  - pending / accepted / rejected  │  │
│  │   (existing)     │    │  - superseded / expired           │  │
│  └──────────────────┘    └──────────────────────────────────┘  │
│                                     │                           │
│                                     ▼                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  OUTCOME CAPTURE                          │  │
│  │  • Operator acceptance    • Alternative selection         │  │
│  │  • Operator rejection     • Expiration                    │  │
│  │  • Supersession           • Order data import             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                     │                           │
│              ┌──────────────────────┼──────────────────────┐   │
│              ▼                      ▼                      ▼   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐│
│  │ REALIZED SAVINGS │  │ QUALITY METRICS  │  │ SCORING        ││
│  │ • Estimated      │  │ • Acceptance %   │  │ FEEDBACK       ││
│  │ • Realized       │  │ • Override %     │  │ • Penalties    ││
│  │ • Confirmed      │  │ • Savings Error  │  │ • Bonuses      ││
│  └──────────────────┘  └──────────────────┘  └────────────────┘│
│                                     │                           │
│                                     ▼                           │
│               ┌──────────────────────────────────┐             │
│               │       SCORING SYSTEMS            │             │
│               │  • Supplier Reliability ±        │             │
│               │  • Offer Trust ±                 │             │
│               │  • Opportunity Confidence ±      │             │
│               └──────────────────────────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Recommendation Outcomes Table

### Table: `recommendation_outcomes`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| recommendation_id | UUID | Links to supplier_recommendations |
| product_id | UUID | Product reference |
| supplier_id | UUID | Recommended supplier |
| offer_id | UUID | Recommended offer |
| outcome_status | TEXT | pending/accepted/rejected/superseded/expired/partially_realized |
| decision_source | TEXT | operator/system/imported_order_data/manual_review |
| accepted | BOOLEAN | Was recommendation accepted? |
| accepted_at | TIMESTAMPTZ | When accepted |
| rejected_at | TIMESTAMPTZ | When rejected |
| rejection_reason | TEXT | Why rejected |
| selected_supplier_id | UUID | Actually chosen supplier |
| selected_offer_id | UUID | Actually chosen offer |
| selected_price | NUMERIC | Actual price |
| recommended_price | NUMERIC | Price at recommendation time |
| recommended_rank | INTEGER | Rank at recommendation time |
| recommended_trust_score | NUMERIC | Trust at recommendation time |
| recommended_reasoning | TEXT | Original reasoning |
| price_delta | NUMERIC | selected - recommended |
| trust_delta | NUMERIC | Trust change |
| estimated_savings | NUMERIC | Savings estimate at recommendation |
| realized_savings | NUMERIC | Actual confirmed savings |
| realized_savings_percent | NUMERIC | Realized as % |
| savings_confidence | TEXT | confirmed/estimated/unknown |
| superseded_by_id | UUID | If superseded, by which outcome |
| supersedes_id | UUID | If this supersedes another |

### Outcome Statuses

| Status | Description |
|--------|-------------|
| pending | Awaiting operator decision |
| accepted | Operator accepted recommendation |
| rejected | Operator rejected recommendation |
| superseded | Replaced by newer recommendation |
| expired | No decision within expiry period |
| partially_realized | Accepted but savings not fully confirmed |

### Decision Sources

| Source | Description |
|--------|-------------|
| operator | Manual operator action |
| system | Automated system decision |
| imported_order_data | From order/procurement system |
| manual_review | From review queue |

## Phase 2: Outcome Capture Workflows

### Functions

```typescript
// Create pending outcome when recommendation is generated
createPendingOutcome(recommendation_id, product_id, supplier_id, offer_id, ...)

// Record acceptance with actual selection
recordRecommendationAcceptance({
  recommendation_id,
  decision_source,
  selected_supplier_id,
  selected_offer_id,
  selected_price,
})

// Record rejection with reason
recordRecommendationRejection({
  recommendation_id,
  decision_source,
  rejection_reason,
  selected_supplier_id,  // If chose alternative
  selected_offer_id,
  selected_price,
})

// Mark old recommendation as superseded
recordRecommendationSuperseded(old_recommendation_id, new_recommendation_id)

// Expire stale pending recommendations
expireStaleRecommendations(expiry_days = 14)
```

### Idempotency Rules

- Creating same pending outcome twice returns existing ID
- Recording acceptance/rejection twice does not create duplicates
- Terminal states cannot be changed to other terminal states
- All operations are safe to retry

## Phase 3: Realized Savings Tracking

### Savings Confidence Levels

| Level | Description |
|-------|-------------|
| confirmed | Actual order data imported |
| estimated | Calculated from recommendation |
| unknown | Insufficient data |

### Update Function

```typescript
// Update with actual order data
updateRealizedSavings(
  outcome_id,
  actual_price_paid,   // What was actually paid
  baseline_price,      // What would have been paid
  'imported_order_data'
)
```

### Rules

- Never report realized savings without actual price data
- Never mix estimated with realized
- Partial data remains partial, not guessed
- Confidence is set to 'confirmed' only with order data

## Phase 4: Recommendation Quality Metrics

### Table: `recommendation_quality_metrics`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| metric_type | TEXT | Type of metric |
| metric_value | NUMERIC | Value |
| sample_size | INTEGER | Data points |
| window_start | TIMESTAMPTZ | Period start |
| window_end | TIMESTAMPTZ | Period end |

### Metric Types

| Metric | Description |
|--------|-------------|
| recommendation_acceptance_rate | % accepted of decided |
| trusted_recommendation_acceptance_rate | % accepted when trust ≥ 0.8 |
| rejected_due_to_low_trust_rate | % rejected citing trust |
| realized_savings_capture_rate | Realized / Estimated |
| estimated_vs_realized_savings_error | Mean absolute % error |
| false_positive_recommendation_rate | Rejected or no realized savings |
| superseded_recommendation_rate | % superseded |
| recommendation_latency_to_decision | Avg hours to decision |
| top_rank_acceptance_rate | % of #1 recommendations accepted |
| override_rate | % where operator chose different supplier |

### Minimum Sample Size

All metrics require minimum 10 samples for statistical validity.

## Phase 5: Feedback into Scoring Systems

### Table: `scoring_feedback_adjustments`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| adjustment_type | TEXT | Type of adjustment |
| entity_type | TEXT | supplier/offer/product |
| entity_id | UUID | Target entity |
| adjustment_value | NUMERIC | -0.15 to +0.15 |
| reason | TEXT | Why adjustment was made |
| sample_size | INTEGER | Supporting data points |
| confidence | NUMERIC | 0-1 confidence |
| effective_from | TIMESTAMPTZ | When active from |
| effective_until | TIMESTAMPTZ | Expiry (90 days default) |
| applied | BOOLEAN | Has been applied |

### Adjustment Types

| Type | Trigger |
|------|---------|
| supplier_reliability_penalty | High override rate (>40%) or low acceptance (<30%) |
| supplier_reliability_bonus | High acceptance rate (>80%) |
| offer_trust_penalty | Repeated low-trust rejections (3+) |
| offer_trust_bonus | Consistent acceptance of offer |
| opportunity_confidence_adjustment | Opportunities frequently rejected |

### Conservative Rules

- **Minimum sample size**: 10 before generating adjustments
- **Max adjustment**: ±15% cumulative
- **Decay**: Adjustments expire after 90 days
- **Confidence weighting**: High sample = high confidence
- **No single-run overrides**: Weighted signals only

### Pattern Detection

```typescript
// Detect patterns from outcomes
detectFeedbackPatterns(window_days = 30)
// Returns: FeedbackPattern[]

// Generate adjustments from patterns
generateScoringAdjustments(patterns)
// Returns: ScoringAdjustment[]

// Get effective adjustment for scoring
getEffectiveAdjustment(adjustment_type, entity_type, entity_id)
// Returns: number (weighted by confidence)

// Get all adjustments for a supplier
getSupplierAdjustments(supplier_id)
// Returns: { reliability_adjustment, reasons[] }
```

## Phase 6: Admin/Ops Visibility

### Route: `/admin/recommendation-outcomes`

The dashboard provides:

1. **Summary Cards**
   - Acceptance rate
   - Pending count
   - Rejected count
   - Estimated savings
   - Realized savings

2. **Accepted Tab**
   - List of accepted recommendations
   - Click for detail modal with full context

3. **Rejected Tab**
   - List of rejected recommendations
   - Rejection reasons
   - Alternative selections

4. **Expiring Tab**
   - Pending recommendations nearing expiration
   - Age in days

5. **Suppliers Tab**
   - Top accepted suppliers
   - Most overridden suppliers with rejection rates

6. **Savings Accuracy Tab**
   - Estimated vs realized comparison
   - Error tracking
   - Confidence levels

### Detail Modal Shows

- Original recommendation reasoning
- Trust score at recommendation time
- Recommended vs selected price
- Rejection reason (if rejected)
- Alternative selected (if different)
- Savings delta (estimated vs realized)
- Savings confidence

## Phase 7: Outcome Evaluation Harness

### Pure Function Tests

```typescript
testRealizedSavingsCalculation()     // Savings math
testEstimatedVsRealizedDelta()       // Delta calculation
testOutcomeStatusTransitions()        // State machine rules
testIdempotencyRules()                // Duplicate handling
```

### Integration Tests

```typescript
testAcceptanceTracking()              // Full acceptance flow
testRejectionTracking()               // Full rejection flow
testSupersededHandling()              // Supersession flow
testRealizedSavingsUpdate()           // Order data import
```

### Run Evaluation

```typescript
// Pure function tests only
runPureFunctionTests()

// Include DB integration tests
runIntegrationTests()

// Full evaluation
runFullEvaluation(includeIntegration = true)
```

## Phase 8: Safety Rules

### Critical Requirements

1. **Never infer acceptance without evidence**
   - Outcomes start as 'pending'
   - Acceptance requires explicit operator action or order data

2. **Never mix estimated with realized**
   - `savings_confidence` clearly distinguishes
   - Realized only set from confirmed data

3. **No duplicate terminal outcomes**
   - Unique constraint on terminal states
   - Idempotent recording functions

4. **Auditability**
   - All decisions have timestamps
   - Rejection reasons preserved
   - Original reasoning stored

5. **Conservative feedback**
   - Minimum sample sizes enforced
   - Max adjustment caps
   - Automatic expiry

## Files Created

### Database Migration
- `storefront/supabase/migrations/20260311000009_recommendation_outcomes.sql`

### Services
- `storefront/src/lib/procurement/outcomes.ts` - Outcome capture
- `storefront/src/lib/procurement/qualityMetrics.ts` - Quality metrics
- `storefront/src/lib/procurement/scoringFeedback.ts` - Feedback integration
- `storefront/src/lib/procurement/evaluation/outcomeEval.ts` - Evaluation harness

### Dashboard
- `storefront/src/app/admin/recommendation-outcomes/page.tsx`

### Modified
- `storefront/src/lib/procurement/index.ts` - Added exports
- `storefront/src/app/api/internal/cron/nightly/route.ts` - Added outcome tracking

## Nightly Cycle

The procurement intelligence cycle now includes:

1. Score all suppliers
2. Find margin opportunities
3. Generate alerts
4. Collect procurement metrics
5. **Expire stale recommendations** (14 days default)
6. **Calculate quality metrics from outcomes**
7. **Run feedback cycle to detect patterns and create adjustments**
8. **Clean up expired adjustments**

## Known Remaining Risks

1. **Order Data Integration**: Full realized savings requires order/procurement system integration (stub exists for `imported_order_data`)

2. **Feedback Loop Latency**: Patterns take 30 days to detect; may be slow to correct initial scoring errors

3. **Sample Size Ramp-Up**: New deployments need time to accumulate enough outcomes for valid metrics

4. **Adjustment Interactions**: Multiple penalties/bonuses may compound; capped at ±15% but monitoring advised

5. **Supersession Chains**: Long chains of superseded recommendations could create data volume; consider archival

## Success Criteria

✅ Can record whether recommendations were accepted or rejected
✅ Can distinguish estimated vs realized savings
✅ Can measure recommendation quality using actual outcomes
✅ Can learn conservatively from operator acceptance/rejection patterns
✅ Can expose recommendation results clearly to operators and admins
