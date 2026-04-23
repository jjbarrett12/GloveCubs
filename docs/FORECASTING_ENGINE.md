# Forecasting and Commercial Guidance Engine

## Overview

The Forecasting Engine makes GloveCubs forward-looking by predicting supplier deterioration, price volatility, and recommending commercial interventions. All outputs are labeled as predictive guidance, not facts.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                FORECASTING & GUIDANCE ENGINE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────┐    ┌───────────────────────────────┐    │
│  │ SUPPLIER          │    │ PRICE VOLATILITY              │    │
│  │ FORECASTING       │    │ FORECASTING                   │    │
│  │ • Reliability ↓   │    │ • Coefficient of variation    │    │
│  │ • Review load ↑   │    │ • Price swings                │    │
│  │ • Override risk   │    │ • Anomaly patterns            │    │
│  │ • Freshness ↓     │    │ • Spread widening             │    │
│  └───────────────────┘    └───────────────────────────────┘    │
│           │                           │                         │
│           └───────────────────────────┘                         │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           COMMERCIAL GUIDANCE ENGINE                      │  │
│  │  Triggers:                      Actions:                  │  │
│  │  • Supplier deterioration  →    • Rebid now               │  │
│  │  • Price volatility        →    • Rebid soon              │  │
│  │  • Rejection patterns      →    • Re-source supplier      │  │
│  │  • Stale offers            →    • Monitor closely         │  │
│  │  • Alert patterns          →                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                      │
│                           ▼                                      │
│               ┌───────────────────────┐                         │
│               │  COMMERCIAL RISK      │                         │
│               │  SCORING              │                         │
│               │  • Coverage           │                         │
│               │  • Volatility         │                         │
│               │  • Trust              │                         │
│               │  • Acceptance         │                         │
│               │  • Freshness          │                         │
│               │  • Depth              │                         │
│               └───────────────────────┘                         │
│                           │                                      │
│                           ▼                                      │
│               ┌───────────────────────┐                         │
│               │  OPS PLANNING UI      │                         │
│               │  /admin/commercial-   │                         │
│               │  planning             │                         │
│               └───────────────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Supplier Deterioration Forecasting

### Table: `supplier_forecasts`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| supplier_id | UUID | Target supplier |
| forecast_type | TEXT | Type of forecast |
| forecast_score | NUMERIC(5,4) | 0-1 deterioration score |
| forecast_band | TEXT | high_risk/watch/stable/improving |
| predicted_direction | TEXT | deteriorating/stable/improving/insufficient_signal |
| predicted_impact | TEXT | Expected impact |
| reasoning | TEXT | Explanation |
| evidence | JSONB | Supporting data |
| window_days | INTEGER | Forecast window |
| sample_size | INTEGER | Data points used |
| confidence | NUMERIC(5,4) | 0-1 confidence |
| forecast_as_of | TIMESTAMPTZ | Forecast timestamp |

### Forecast Types

| Type | Description |
|------|-------------|
| reliability_deterioration | Overall reliability trending down |
| review_load_risk | Review items increasing |
| override_risk | Recommendations frequently overridden |
| freshness_risk | Data freshness declining |

### Configuration

```typescript
const FORECAST_CONFIG = {
  min_sample_size: 10,
  window_days: 30,
  comparison_window_days: 60,
  score_decline_threshold: 0.1,    // 10% decline
  override_rate_threshold: 0.3,    // 30% override rate
  freshness_decline_threshold: 0.2, // 20% freshness decline
};
```

### Rules

- **Minimum sample size**: 10 data points required
- **Conservative predictions**: Only flag when signal is clear
- **Insufficient signal**: Return `insufficient_signal` when data is sparse
- **Explicit reasoning**: Always persist explanation

## Phase 2: Price Volatility Forecasting

### Table: `price_volatility_forecasts`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| product_id | UUID | Target product |
| offer_id | UUID | Optional specific offer |
| volatility_score | NUMERIC(5,4) | 0-1 volatility score |
| volatility_band | TEXT | high_volatility/elevated/stable/low_signal |
| predicted_direction | TEXT | increasing/stable/decreasing/insufficient_signal |
| predicted_risk | TEXT | Risk description |
| reasoning | TEXT | Explanation |
| evidence | JSONB | Supporting data |

### Volatility Metrics

- **Coefficient of Variation (CV)**: Standard deviation / mean of prices
- **Price Swings**: Count of direction changes
- **Anomaly Frequency**: Suspicious pricing events
- **Spread Analysis**: Min-max price range

### Band Thresholds

| Band | Criteria |
|------|----------|
| high_volatility | CV ≥ 25% OR (anomalies ≥ 2 AND swings ≥ 3) |
| elevated | CV ≥ 15% OR anomalies ≥ 2 |
| stable | Below thresholds |
| low_signal | Insufficient data |

## Phase 3: Commercial Guidance Engine

### Table: `commercial_guidance_recommendations`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| guidance_type | TEXT | rebid_now/rebid_soon/re_source_supplier/monitor_closely/no_action |
| entity_type | TEXT | product/supplier |
| entity_id | UUID | Target entity |
| guidance_band | TEXT | urgent/high/moderate/low |
| title | TEXT | Guidance headline |
| summary | TEXT | Description |
| reasoning | TEXT | Why recommended |
| recommended_action | TEXT | What to do |
| evidence | JSONB | Supporting data |
| priority_score | NUMERIC(5,4) | For sorting |
| confidence | NUMERIC(5,4) | Signal strength |
| status | TEXT | open/acknowledged/actioned/dismissed/expired |

### Guidance Types

| Type | Trigger |
|------|---------|
| rebid_now | Volatility ≥ 70% or critical risk |
| rebid_soon | Volatility ≥ 40%, stale offers > 45 days |
| re_source_supplier | Deterioration high_risk, rejection rate > 40% |
| monitor_closely | Watch signals, multiple alerts |
| no_action | No significant signals |

### Deduplication Rules

- **Unique constraint**: One active guidance per entity+type
- **Update threshold**: Only update if score changes > 10%
- **Max per entity**: 2 active guidance items per entity
- **Suppress weak signals**: Confidence < 50% AND band = low suppressed

## Phase 4: Commercial Risk Scoring

### Table: `commercial_risk_scores`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| entity_type | TEXT | product/supplier_product |
| entity_id | UUID | Target entity |
| risk_score | NUMERIC(5,4) | 0-1 overall risk |
| risk_band | TEXT | critical/high/moderate/low |
| coverage_score | NUMERIC(5,4) | Trusted supplier coverage |
| volatility_score | NUMERIC(5,4) | Price volatility |
| trust_score | NUMERIC(5,4) | Average offer trust |
| acceptance_score | NUMERIC(5,4) | Recommendation acceptance |
| freshness_score | NUMERIC(5,4) | Data freshness |
| depth_score | NUMERIC(5,4) | Competitive depth |
| data_quality | TEXT | strong/sufficient/sparse/insufficient |

### Risk Factor Weights

| Factor | Weight |
|--------|--------|
| Coverage | 20% |
| Volatility | 20% |
| Trust | 20% |
| Acceptance | 15% |
| Freshness | 15% |
| Depth | 10% |

### Data Quality Levels

| Level | Criteria |
|-------|----------|
| strong | ≥ 20 samples, 4+ factors present |
| sufficient | ≥ 10 samples |
| sparse | ≥ 5 samples |
| insufficient | < 5 samples |

### Important Rule

**Sparse data produces "insufficient signal," not confident warnings.**

## Phase 5: Ops Planning Dashboard

### Route: `/admin/commercial-planning`

The dashboard provides:

1. **Summary Cards**
   - Suppliers at risk
   - Volatile products
   - Urgent actions needed
   - High risk products
   - Weak coverage issues

2. **Guidance Tab**
   - Active guidance recommendations
   - Take Action / Dismiss buttons
   - Confidence indicators
   - Priority scores

3. **Supplier Forecasts Tab**
   - Suppliers likely to deteriorate
   - Direction indicators
   - Forecast bands
   - Sample sizes

4. **Volatility Tab**
   - Products with rising volatility
   - Volatility scores
   - Risk descriptions

5. **Risk Scores Tab**
   - Commercial risk leaderboard
   - Factor breakdown
   - Data quality indicators

6. **Weak Coverage Tab**
   - Products with few trusted suppliers
   - Coverage scores

### UI Note

All items are labeled as **"predictive guidance, not confirmed facts"**

## Phase 6: Forecast Quality Metrics

### Table: `forecast_quality_metrics`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| metric_type | TEXT | Metric type |
| metric_value | NUMERIC(10,4) | Value |
| sample_size | INTEGER | Data points |
| window_start | TIMESTAMPTZ | Period start |
| window_end | TIMESTAMPTZ | Period end |

### Metric Types

| Metric | Description |
|--------|-------------|
| supplier_forecast_precision | % of deterioration predictions that were correct |
| supplier_forecast_recall | % of actual deteriorations that were predicted |
| price_volatility_forecast_precision | % of volatility predictions confirmed |
| commercial_guidance_acceptance_rate | % of guidance actioned |
| commercial_guidance_precision | Actioned / (Actioned + Dismissed) |
| false_positive_guidance_rate | % guidance dismissed |

## Phase 7: Safety Rules

### Critical Requirements

1. **Forecasts are not facts**
   - All outputs labeled as "predictive guidance"
   - UI shows clear disclaimer

2. **Suppress low-signal outputs**
   - Minimum sample sizes enforced
   - Confidence thresholds applied
   - `insufficient_signal` returned when data is sparse

3. **No guidance spam**
   - Deduplication of active guidance
   - Max guidance per entity limit
   - Minimum change threshold for updates

4. **Preserve reasoning**
   - All forecasts include explicit reasoning
   - Evidence counts persisted
   - Sample sizes tracked

5. **No inflation of risk**
   - Sparse data = "insufficient signal"
   - Sparse data ≠ high risk

## Files Created

### Database Migration
- `storefront/supabase/migrations/20260311000010_forecasting_engine.sql`

### Services
- `storefront/src/lib/forecasting/index.ts` - Module exports
- `storefront/src/lib/forecasting/supplierForecasting.ts` - Supplier deterioration
- `storefront/src/lib/forecasting/priceVolatility.ts` - Price volatility
- `storefront/src/lib/forecasting/commercialGuidance.ts` - Guidance engine
- `storefront/src/lib/forecasting/commercialRisk.ts` - Risk scoring
- `storefront/src/lib/forecasting/forecastMetrics.ts` - Quality metrics

### Dashboard
- `storefront/src/app/admin/commercial-planning/page.tsx`

### Modified
- `storefront/src/app/api/internal/cron/nightly/route.ts` - Added forecasting cycle

## Nightly Cycle

The nightly job now includes:

1. Generate supplier deterioration forecasts
2. Generate price volatility forecasts
3. Generate commercial guidance recommendations
4. Calculate commercial risk scores
5. Calculate forecast quality metrics
6. Clean up old forecasts (90 days retention)

## Known Remaining Risks

1. **Cold Start Problem**: New products/suppliers need time to accumulate data for forecasting

2. **Forecast Lag**: 30-day comparison window means rapid changes may not be caught immediately

3. **Correlation vs Causation**: Forecasts identify patterns but cannot prove causation

4. **Threshold Tuning**: Default thresholds may need adjustment based on actual usage patterns

5. **Metric Calculation Cost**: Supplier recall calculation iterates all suppliers; may need optimization at scale

## Success Criteria

✅ Can forecast likely supplier deterioration conservatively
✅ Can identify products/suppliers with rising commercial risk
✅ Can recommend rebid/re-source timing before failures happen
✅ Can surface forward-looking planning guidance to operators
✅ Can measure the quality of forecast/guidance outputs over time
✅ Avoids noisy, weak-signal prediction spam
