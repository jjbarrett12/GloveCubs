# Procurement Intelligence System

## Overview

The Procurement Intelligence System transforms GloveCubs into a platform that scores trust, prioritizes money, and recommends actions. It layers on top of the existing AI infrastructure without replacing deterministic controls.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROCUREMENT INTELLIGENCE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Supplier    │  │    Offer     │  │      Margin          │  │
│  │ Reliability  │──│    Trust     │──│   Opportunities      │  │
│  │   Scoring    │  │   Scoring    │  │      Engine          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│         │                 │                     │               │
│         └─────────────────┼─────────────────────┘               │
│                           ▼                                      │
│               ┌──────────────────────┐                          │
│               │      Supplier        │                          │
│               │   Recommendations    │                          │
│               └──────────────────────┘                          │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Proactive Alerts                             │  │
│  │  • Margin Opportunities  • Supplier Risk  • Stale Offers │  │
│  │  • Pricing Instability   • Trust Drops   • Better Offers │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                      │
│                           ▼                                      │
│               ┌──────────────────────┐                          │
│               │    Ops Dashboard     │                          │
│               │ /admin/procurement-  │                          │
│               │    intelligence      │                          │
│               └──────────────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Supplier Reliability Scoring

### Table: `supplier_reliability_scores`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| supplier_id | UUID | Foreign key to supplier |
| reliability_score | NUMERIC(5,4) | 0-1 score |
| reliability_band | TEXT | trusted/stable/watch/risky |
| completeness_score | NUMERIC(5,4) | Feed completeness |
| freshness_score | NUMERIC(5,4) | Price update recency |
| accuracy_score | NUMERIC(5,4) | Extraction accuracy |
| stability_score | NUMERIC(5,4) | Price stability |
| override_penalty | NUMERIC(5,4) | Operator override rate |
| anomaly_penalty | NUMERIC(5,4) | Anomaly frequency |
| sample_size | INTEGER | Products evaluated |
| factors | JSONB | Detailed factor breakdown |
| calculated_at | TIMESTAMPTZ | When calculated |

### Scoring Factors

- **Completeness (15%)**: Required field population rate
- **Freshness (20%)**: Age of price updates (1 day = 1.0, 30+ days = 0.2)
- **Accuracy (25%)**: AI extraction confidence + human confirmation rate
- **Stability (15%)**: Price variance over time
- **Anomaly Penalty (10%)**: Pricing anomaly frequency
- **Override Penalty (8%)**: Operator correction rate
- **Error Penalty (4%)**: Job failure rate
- **Correction Penalty (3%)**: Review rejection rate

### Band Thresholds

| Band | Score Range |
|------|-------------|
| trusted | ≥ 0.85 |
| stable | 0.70 - 0.84 |
| watch | 0.50 - 0.69 |
| risky | < 0.50 |

## Phase 2: Offer Trust Scoring

### Table: `offer_trust_scores`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| offer_id | UUID | Foreign key to offer |
| supplier_id | UUID | Supplier reference |
| product_id | UUID | Product reference |
| trust_score | NUMERIC(5,4) | 0-1 score |
| trust_band | TEXT | high_trust/medium_trust/review_sensitive/low_trust |
| supplier_reliability_score | NUMERIC(5,4) | Supplier component |
| match_confidence | NUMERIC(5,4) | AI match confidence |
| pricing_confidence | NUMERIC(5,4) | Pricing analysis confidence |
| freshness_score | NUMERIC(5,4) | Data freshness |
| normalization_confidence | NUMERIC(5,4) | Pack normalization certainty |
| anomaly_penalty | NUMERIC(5,4) | Historical anomalies |
| override_penalty | NUMERIC(5,4) | Historical corrections |

### Trust-Adjusted Pricing

```typescript
function calculateTrustAdjustedPrice(raw_price: number, trust_score: number): number {
  const trustPenalty = (1 - trust_score) * 0.2;
  return raw_price * (1 + trustPenalty);
}
```

Low-trust offers effectively become 20% more expensive in comparisons.

### Band Thresholds

| Band | Score Range |
|------|-------------|
| high_trust | ≥ 0.80 |
| medium_trust | 0.60 - 0.79 |
| review_sensitive | 0.40 - 0.59 |
| low_trust | < 0.40 |

## Phase 3: Margin Opportunity Engine

### Table: `margin_opportunities`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| product_id | UUID | Canonical product |
| best_offer_id | UUID | Best trusted offer |
| current_offer_id | UUID | Current selected offer |
| opportunity_score | NUMERIC(5,4) | 0-1 opportunity score |
| opportunity_band | TEXT | major/meaningful/minor/none |
| estimated_savings_per_case | NUMERIC(10,2) | Dollar savings |
| estimated_savings_percent | NUMERIC(5,2) | Percentage savings |
| market_spread | NUMERIC(5,2) | Price range % |
| trust_adjusted_best_price | NUMERIC(10,2) | Best offer after trust adjustment |
| requires_review | BOOLEAN | Manual review needed |
| review_reason | TEXT | Why review is needed |
| reasoning | TEXT | Explanation |

### Opportunity Factors

- **Market Spread (30%)**: Price variance across suppliers
- **Savings Potential (30%)**: Current vs best trusted offer delta
- **Trust Differential (15%)**: Best offer trust quality
- **Freshness Gap (10%)**: Staleness of current pricing
- **Category Importance (10%)**: Product category weight
- **Pack Risk Penalty (3%)**: Pack normalization uncertainty
- **Anomaly Penalty (2%)**: Historical anomaly patterns

### Band Thresholds

| Band | Criteria |
|------|----------|
| major | Score ≥ 0.7 OR savings ≥ 15% |
| meaningful | Score ≥ 0.4 OR savings ≥ 8% |
| minor | Score ≥ 0.2 OR savings ≥ 3% |
| none | Below thresholds |

## Phase 4: Supplier Recommendations

### Table: `supplier_recommendations`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| product_id | UUID | Canonical product |
| supplier_id | UUID | Recommended supplier |
| offer_id | UUID | Specific offer |
| recommended_rank | INTEGER | 1 = top recommendation |
| recommendation_score | NUMERIC(5,4) | Weighted score |
| recommendation_band | TEXT | strong_recommendation/acceptable/caution/do_not_prefer |
| recommendation_reasoning | TEXT | Why recommended |
| why_not_first | TEXT | Why not ranked first (if applicable) |
| review_required | BOOLEAN | Manual review needed |
| price | NUMERIC(10,2) | Offer price |
| trust_score | NUMERIC(5,4) | Offer trust |

### Critical Rule: Trust-Price Fairness

**A low-trust cheapest offer must not outrank a high-trust offer unless the price advantage exceeds 15%.**

```typescript
const MATERIAL_PRICE_ADVANTAGE_THRESHOLD = 0.15; // 15%

if (lowTrustOffer.price < highTrustOffer.price) {
  const priceDiff = (highTrustOffer.price - lowTrustOffer.price) / highTrustOffer.price;
  
  if (priceDiff < MATERIAL_PRICE_ADVANTAGE_THRESHOLD) {
    // Demote low-trust offer below high-trust offer
    lowTrustOffer.adjusted_score = highTrustOffer.raw_score - 0.05;
  }
}
```

### Recommendation Weights

- **Price (30%)**: Normalized price score
- **Trust (25%)**: Offer trust score
- **Reliability (20%)**: Supplier reliability
- **Freshness (10%)**: Data freshness
- **Lead Time (8%)**: Delivery speed
- **Anomaly Penalty (4%)**
- **Correction Penalty (3%)**

## Phase 5: Proactive Alerts

### Table: `procurement_alerts`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| alert_type | TEXT | Type of alert |
| severity | TEXT | critical/high/normal/low |
| entity_type | TEXT | product/supplier/offer |
| entity_id | UUID | Related entity |
| title | TEXT | Alert headline |
| summary | TEXT | Description |
| reasoning | TEXT | Why this matters |
| recommended_action | TEXT | What to do |
| priority_score | NUMERIC(5,4) | For sorting |
| status | TEXT | open/acknowledged/resolved/dismissed |

### Alert Types

| Type | Triggers |
|------|----------|
| margin_opportunity | Major savings ≥10% detected |
| supplier_risk | Supplier enters watch/risky band |
| stale_offer | Offer not updated in 30+ days |
| pricing_instability | 3+ anomalies in 14 days |
| trust_drop | Low-trust offer in winning position |
| review_load_spike | Supplier generating 2x average reviews |
| better_offer_detected | Strong recommendation available |

### Severity Criteria

| Severity | Criteria |
|----------|----------|
| critical | Savings >20%, supplier now risky, offer 60+ days stale |
| high | Savings 10-20%, supplier watch, 5+ anomalies |
| normal | Standard threshold violations |
| low | Informational |

## Phase 6: Ops Dashboard

### Route: `/admin/procurement-intelligence`

The dashboard provides:

1. **Summary Cards**
   - Average supplier reliability
   - Low-trust winning offers count
   - Major opportunities count
   - Active alerts (with critical count)

2. **Alerts Tab**
   - Real-time alert triage
   - Severity badges
   - Recommended actions
   - Resolve/Dismiss buttons

3. **Suppliers Tab**
   - Reliability leaderboard (top 10)
   - Risky suppliers panel with factor breakdown

4. **Low Trust Tab**
   - Offers in winning positions requiring review
   - Trust score and band display

5. **Opportunities Tab**
   - Major/meaningful margin opportunities
   - Savings percentages
   - Review requirements

## Phase 7: Metrics

### Table: `procurement_intelligence_metrics`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| metric_type | TEXT | Metric category |
| metric_value | NUMERIC(10,4) | Measured value |
| sample_size | INTEGER | Data points |
| metadata | JSONB | Additional context |
| calculated_at | TIMESTAMPTZ | When measured |

### Metric Types

| Metric | Description |
|--------|-------------|
| supplier_reliability_accuracy | % suppliers in trusted/stable |
| offer_trust_accuracy | % offers in high/medium trust |
| recommendation_acceptance_rate | % strong recommendations |
| margin_opportunity_capture_rate | % opportunities realized |
| alert_precision | Resolved / (Resolved + Dismissed) |
| false_alert_rate | Dismissed / Total actioned |
| avg_supplier_reliability | Average reliability score |
| avg_offer_trust | Average trust score |
| critical_alerts_count | Open critical alerts |
| margin_opportunities_found | Major + meaningful opportunities |

## Safety Rules

### Hard Constraints (Never Overridden)

1. **Material equality** - Different materials = cannot match
2. **Size equality** - Different sizes = cannot match
3. **Sterile status** - Must match exactly
4. **Thickness tolerance** - Within acceptable variance
5. **Pack quantity** - Must be normalized correctly

### Trust Rules

1. Low-trust offers cannot silently become best-price winners
2. Recommendation reasoning must always be persisted
3. All logic must be auditable
4. Deterministic business rules remain final authority

### Alert Noise Prevention

1. Deduplicate against existing open alerts
2. Minimum thresholds before alerting
3. Severity tiers prevent minor issues from overwhelming
4. Dismissal tracking enables false positive analysis

## Integration Points

### Nightly Cron

The procurement intelligence cycle runs during nightly jobs:

```typescript
const procurementResult = await runProcurementIntelligenceCycle();
// Returns:
// - suppliers_scored: number
// - opportunities_found: number
// - alerts_generated: number
// - metrics_collected: number
```

### Pipeline Completion

Can also be triggered after major pipeline runs.

## Files Created

### Database Migration
- `storefront/supabase/migrations/20260311000008_procurement_intelligence.sql`

### Services
- `storefront/src/lib/procurement/index.ts` - Module exports
- `storefront/src/lib/procurement/supplierReliability.ts` - Supplier scoring
- `storefront/src/lib/procurement/offerTrust.ts` - Offer trust scoring
- `storefront/src/lib/procurement/marginOpportunity.ts` - Opportunity engine
- `storefront/src/lib/procurement/supplierRecommendation.ts` - Recommendation engine
- `storefront/src/lib/procurement/alerts.ts` - Alert generation
- `storefront/src/lib/procurement/metrics.ts` - Metrics collection

### Dashboard
- `storefront/src/app/admin/procurement-intelligence/page.tsx`

### Modified
- `storefront/src/app/api/internal/cron/nightly/route.ts` - Added procurement cycle

## Known Remaining Risks

1. **Initial Data Quality**: System depends on historical data; new deployments may have sparse scoring initially

2. **Supplier ID Resolution**: Some queries assume direct supplier_id relationships that may need joins in production

3. **Performance at Scale**: Batch operations may need pagination for very large product catalogs

4. **Feedback Loop**: recommendation_acceptance_rate requires order/purchase tracking not yet implemented

5. **Alert Volume**: Initial deployment may generate many alerts; thresholds may need tuning

6. **Trust Calibration**: Trust scoring weights are heuristic; may need adjustment based on operator feedback

## Success Criteria

✅ Can distinguish trusted vs risky suppliers
✅ Can distinguish trusted vs suspicious offers  
✅ Can identify meaningful savings opportunities
✅ Can recommend suppliers using weighted intelligence
✅ Can proactively surface high-value issues
✅ Can measure recommendation quality over time
