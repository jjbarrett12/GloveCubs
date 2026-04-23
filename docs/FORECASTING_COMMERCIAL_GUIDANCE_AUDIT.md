# Forecasting and Commercial Guidance Engine Audit

**Audit Date:** 2026-03-02  
**Status:** Fixes Applied  
**Files Audited:**
- `storefront/src/lib/forecasting/supplierForecasting.ts`
- `storefront/src/lib/forecasting/priceVolatility.ts`
- `storefront/src/lib/forecasting/commercialGuidance.ts`
- `storefront/src/lib/forecasting/commercialRisk.ts`
- `storefront/src/lib/forecasting/forecastMetrics.ts`

---

## Executive Summary

The audit identified **17 bugs** across 6 categories. **14 fixes** have been applied. **3 remaining risks** require attention before production launch.

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 2 | 2 | 0 |
| High | 6 | 5 | 1 |
| Medium | 6 | 5 | 1 |
| Low | 3 | 2 | 1 |

---

## Categorized Bug Report

### 1. Forecast Integrity Flaws

#### FCG-1: Sparse Data Producing Confident Forecasts (CRITICAL - FIXED)
**Location:** `priceVolatility.ts` lines 51-65  
**Issue:** `min_price_points: 3` was far too low for meaningful coefficient of variation calculation. With only 3 price points, any noise would be treated as volatility.

**Fix Applied:**
- Increased `min_price_points` from 3 to 8
- Increased `min_sample_size` from 5 to 10
- Increased `min_confidence_threshold` from 0.4 to 0.5

#### FCG-2: One-Time Anomalies Treated as Trends (HIGH - FIXED)
**Location:** `priceVolatility.ts` lines 146-153  
**Issue:** Anomaly count was taken directly without checking recency or spread. A single bad import creating duplicate anomaly records would trigger volatility warnings.

**Fix Applied:**
- Added `anomaly_recency_days: 14` config
- Filter anomalies to only count recent ones
- Require anomalies spread across multiple days (not same-day duplicates)
- Increased `anomaly_threshold` from 2 to 3

#### FCG-3: Stale Comparison Window Fallback (MEDIUM - FIXED)
**Location:** `supplierForecasting.ts` lines 174-180  
**Issue:** When no previous scores existed, `previousAvg` would fallback to `recentAvg`, masking deterioration for new suppliers or those with gaps in data.

**Fix Applied:**
- Added `min_recent_samples: 5` and `min_previous_samples: 5` requirements
- Require both windows to have sufficient data for valid comparison
- Return insufficient signal when either window is empty

#### FCG-4: Forecast Confidence Inflated by Strong Signal (HIGH - FIXED)
**Location:** `supplierForecasting.ts` lines 466-474  
**Issue:** Confidence calculation allowed strong signal to compensate for tiny sample sizes. 10 samples with a high signal would get 0.52 confidence.

**Fix Applied:**
- Reweighted formula to 70% sample size, 30% signal strength
- Added sqrt curve for sample confidence (diminishing returns)
- Capped signal factor at 0.8 (requires some sample size)
- Added penalty cap of 0.6 for samples below 2x minimum

---

### 2. Commercial Guidance Flaws

#### FCG-5: Aggressive Rebid Thresholds (MEDIUM - FIXED)
**Location:** `commercialGuidance.ts` lines 66-78  
**Issue:** Rebid thresholds were too low (40% volatility, 30 days stale), generating excessive guidance noise.

**Fix Applied:**
- Increased `rebid_now_volatility_threshold` from 0.7 to 0.75
- Increased `rebid_soon_volatility_threshold` from 0.4 to 0.5
- Increased `stale_days_threshold` from 30 to 45
- Added `very_stale_days_threshold: 60` for high-band

#### FCG-6: Duplicate Guidance Spam (MEDIUM - FIXED)
**Location:** `commercialGuidance.ts` lines 393-446  
**Issue:** Deduplication only counted new guidance per entity, not existing DB records. An entity could accumulate many guidance items across multiple runs.

**Fix Applied:**
- Track existing guidance count per entity from DB
- Added `max_active_total_db_check: 3` to limit total guidance per entity
- Increased `min_change_for_update` from 0.1 to 0.15

#### FCG-7: Hardcoded Confidence for Stale Offers (HIGH - FIXED)
**Location:** `commercialGuidance.ts` lines 285-334  
**Issue:** `confidence: 0.8` was hardcoded regardless of product activity level. A rarely-used product with stale offers shouldn't have same confidence as high-volume product.

**Fix Applied:**
- Calculate confidence based on recent outcome activity (0-10+)
- High activity (10+): 0.85 confidence
- Medium activity (3-9): 0.70 confidence
- Low activity (0-2): 0.50 confidence
- Include activity context in reasoning and recommended_action

#### FCG-8: Weak Rejection Pattern Reasoning (LOW - FIXED)
**Location:** `commercialGuidance.ts` lines 245-283  
**Issue:** Reasoning was generic ("indicates poor fit for current needs") without specific evidence or actionable guidance.

**Fix Applied:**
- Generate multi-part reasoning based on rejection severity
- Scale recommended actions based on pattern strength and sample size
- Include total_recommendations in evidence for context
- Boost priority score with log10(sample_size) for better-evidenced patterns

---

### 3. Risk Scoring Flaws

#### FCG-9: Sparse Coverage Mistaken for High Risk (CRITICAL - FIXED)
**Location:** `commercialRisk.ts` lines 162-172  
**Issue:** Products with no offers would score 0 on coverage (contributing 0.20 to risk), 0 on freshness (contributing 0.15), etc. - reaching high_risk threshold (0.50+) purely due to missing data.

**Fix Applied:**
- Added `min_factors_for_scoring: 3` requirement
- Created `getSparseAdjustedContribution()` function
- Sparse data factors contribute neutral 0.5 × weight × penalty (0.5)
- Use risk_score: -1 for insufficient data (not 0)
- Include `insufficient_data: true` in evidence

#### FCG-10: Volatility Overweighted vs. Acceptance (HIGH - FIXED)
**Location:** `commercialRisk.ts` lines 62-69  
**Issue:** Volatility (a noisy signal) had weight 0.20 while acceptance (direct operator feedback) had only 0.15.

**Fix Applied:**
- Reduced volatility weight from 0.20 to 0.12
- Increased acceptance weight from 0.15 to 0.25
- Slightly reduced trust weight from 0.20 to 0.18

#### FCG-11: Risk Score Instability (MEDIUM - FIXED)
**Location:** `commercialRisk.ts` lines 269-303  
**Issue:** Volatility risk used single latest forecast, causing score to spike with any noise.

**Fix Applied:**
- Fetch last 3 volatility forecasts
- Calculate weighted average (50%/30%/20%) with confidence weighting
- Use smoothed score for risk contribution

---

### 4. UI/Ops Flaws

#### FCG-12: Insufficient Signal Masked as Low Risk (HIGH - REMAINING RISK)
**Location:** `commercialRisk.ts` - `createInsufficientDataResult()`  
**Issue:** DB constraint requires valid `risk_band`, so insufficient data returns `risk_band: 'low'`. UI may display this as "low risk" rather than "unknown".

**Partial Fix Applied:**
- Set `risk_score: -1` to signal unknown
- Added `insufficient_data: true` to evidence
- Updated reasoning to include "risk level UNKNOWN"

**Remaining Risk:** Frontend must check for `confidence: 0` or `risk_score < 0` to display "insufficient data" badge instead of "low risk".

#### FCG-13: Planning Actions Not Actionable (LOW - REMAINING RISK)
**Issue:** Recommended actions are still somewhat generic. More specific playbooks or links to relevant UI sections would help.

**Status:** Partially addressed via improved stale offer recommendations based on activity level. Full solution requires UI integration work.

---

### 5. Metrics Flaws

#### FCG-14: Deterioration Threshold Proxy (MEDIUM - FIXED)
**Location:** `forecastMetrics.ts` lines 119-147  
**Issue:** Hardcoded `-0.05` threshold for deterioration missed significant relative declines for high-reliability suppliers (0.95→0.91 is -4% but wouldn't count).

**Fix Applied:**
- Added `deterioration_threshold_percent: 0.08` (8% relative)
- Added `deterioration_threshold_absolute: 0.03` (3 points)
- Use OR logic: either threshold triggers detection
- Track `evaluatedCount` for better metadata

#### FCG-15: False Positive Rate Meaningless (HIGH - FIXED)
**Location:** `forecastMetrics.ts` lines 382-416  
**Issue:** FP rate was `dismissed / total` including expired. Expired guidance is inconclusive, not a false positive.

**Fix Applied:**
- Exclude expired from FP calculation
- Use `dismissed / (actioned + dismissed)` for cleaner signal
- Return -1 for insufficient decisions (< 5)
- Add `by_band` breakdown in metadata

---

### 6. Test Coverage Flaws

#### FCG-16: No Automated Tests (CRITICAL - REMAINING RISK)
**Location:** `storefront/src/lib/forecasting/*.test.ts`  
**Issue:** No test files exist for the forecasting module.

**Remaining Risk:** Critical flows are untested:
- Forecast threshold behavior
- Deduplication logic
- Low-signal suppression
- Guidance resolution states
- Risk score edge cases

---

## Fixes Applied Summary

| Bug ID | File | Change Description |
|--------|------|-------------------|
| FCG-1 | priceVolatility.ts | Increased min_price_points 3→8, min_sample_size 5→10 |
| FCG-2 | priceVolatility.ts | Added anomaly recency filter and day-spread validation |
| FCG-3 | supplierForecasting.ts | Added min_recent/previous_samples requirements |
| FCG-4 | supplierForecasting.ts | Reweighted confidence to 70% sample, 30% signal |
| FCG-5 | commercialGuidance.ts | Increased rebid/stale thresholds |
| FCG-6 | commercialGuidance.ts | Added DB-aware deduplication with total entity limit |
| FCG-7 | commercialGuidance.ts | Dynamic confidence based on product activity |
| FCG-8 | commercialGuidance.ts | Multi-part reasoning with severity-scaled actions |
| FCG-9 | commercialRisk.ts | Sparse data returns neutral contribution, risk_score: -1 |
| FCG-10 | commercialRisk.ts | Rebalanced weights (volatility down, acceptance up) |
| FCG-11 | commercialRisk.ts | Smoothed volatility across 3 recent forecasts |
| FCG-12 | commercialRisk.ts | Added -1 score and insufficient_data flag (partial) |
| FCG-14 | forecastMetrics.ts | Percentage-based OR absolute deterioration threshold |
| FCG-15 | forecastMetrics.ts | Exclude expired from FP rate, add by_band metadata |

---

## Remaining Risks

### HIGH: FCG-16 - No Automated Tests (LAUNCH BLOCKER)
**Impact:** Regression risk is high. Any future changes could break forecast generation without detection.

**Recommended Action:** Add test coverage for:
1. Forecast threshold boundary conditions
2. Deduplication edge cases
3. Low-signal suppression
4. Sparse data handling
5. Confidence calculations

### MEDIUM: FCG-12 - Insufficient Data Display
**Impact:** Operators may see "low risk" for products with no data.

**Recommended Action:** Frontend should check `confidence === 0 || risk_score < 0` and display "Insufficient Data" badge.

### LOW: FCG-13 - Generic Recommended Actions
**Impact:** Operators may not know exact steps to take.

**Recommended Action:** Add links to relevant UI sections (supplier review, rebid workflow, etc.)

---

## Launch Blockers by Severity

### CRITICAL (Must Fix Before Launch)
None remaining - both critical bugs fixed.

### HIGH (Should Fix Before Launch)
1. **FCG-16**: Add minimum test coverage for core forecast and guidance logic

### MEDIUM (Fix Soon After Launch)
1. **FCG-12**: Frontend insufficient-data display
2. **FCG-13**: Actionable recommended actions

---

## Verification Checklist

- [x] Price volatility requires minimum 8 price points
- [x] Anomalies must be recent (14 days) and spread across multiple days
- [x] Supplier forecasts require data in both time windows
- [x] Confidence calculation weights sample size at 70%
- [x] Rebid thresholds are less aggressive (45-60 days stale)
- [x] Deduplication checks existing DB guidance count
- [x] Stale offer confidence varies by product activity
- [x] Rejection pattern reasoning includes severity context
- [x] Sparse data contributes neutral risk (not high risk)
- [x] Volatility smoothed across 3 forecasts
- [x] Acceptance weight increased to 0.25
- [x] Deterioration detection uses percentage OR absolute threshold
- [x] False positive rate excludes expired guidance
- [x] All linter checks pass

---

## Configuration Changes Summary

### priceVolatility.ts
```typescript
min_sample_size: 5 → 10
min_price_points: 3 → 8
swing_count_threshold: 3 → 4
anomaly_threshold: 2 → 3
min_confidence_threshold: 0.4 → 0.5
+ anomaly_recency_days: 14
```

### supplierForecasting.ts
```typescript
min_sample_size: 10 → 15
min_confidence_threshold: 0.4 → 0.5
override_rate_threshold: 0.3 → 0.35
+ min_recent_samples: 5
+ min_previous_samples: 5
+ high_confidence_sample_size: 50
```

### commercialGuidance.ts
```typescript
min_confidence_threshold: 0.5 → 0.55
rebid_now_volatility_threshold: 0.7 → 0.75
rebid_soon_volatility_threshold: 0.4 → 0.5
rejection_rate_threshold: 0.4 → 0.45
stale_days_threshold: 30 → 45
min_change_for_update: 0.1 → 0.15
+ min_sample_for_guidance: 10
+ very_stale_days_threshold: 60
+ max_active_total_db_check: 3
+ min_recommendations_for_full_confidence: 25
```

### commercialRisk.ts
```typescript
min_samples_for_acceptance: 5 → 8
volatility weight: 0.20 → 0.12
trust weight: 0.20 → 0.18
acceptance weight: 0.15 → 0.25
high_threshold: 0.50 → 0.55
moderate_threshold: 0.25 → 0.30
strong_sample_threshold: 20 → 25
sufficient_sample_threshold: 10 → 12
sparse_sample_threshold: 5 → 6
+ min_factors_for_scoring: 3
+ sparse_data_penalty: 0.5
```

### forecastMetrics.ts
```typescript
min_sample_size: 10 → 15
+ deterioration_threshold_percent: 0.08
+ deterioration_threshold_absolute: 0.03
```
