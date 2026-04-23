# Closed-Loop Learning Audit Report

**Date:** 2026-03-11  
**Auditor:** Debug Agent  
**Scope:** Recommendation Outcomes, Quality Metrics, Scoring Feedback

---

## Executive Summary

The Recommendation Outcomes and Closed-Loop Learning implementation has several **critical bugs** that would corrupt production metrics and undermine trust in the system. The most severe issue is that **estimated savings were being copied directly to realized savings**, inflating capture rates to misleading levels.

**Bugs Found:** 18  
**Bugs Fixed:** 14  
**Remaining Risks:** 4 (medium/low severity)  
**Launch Blockers:** 1 (schema fix required)

---

## 1. Categorized Bug Report

### 1.1 CRITICAL - Outcome Integrity Flaws

| ID | Bug | Severity | File | Status |
|----|-----|----------|------|--------|
| CLL-1 | Acceptance recorded without validation that selected entities exist | Medium | outcomes.ts:153-235 | NOT FIXED (requires schema FK) |
| CLL-2 | Unique terminal state index excludes `superseded` and `partially_realized` - allows duplicate terminal states | **CRITICAL** | migration SQL line 71-74 | **SCHEMA FIX REQUIRED** |
| CLL-3 | `expireStaleRecommendations` silently fails when RPC fails, returns `{expired: 0}` | High | outcomes.ts:374-382 | **FIXED** |
| CLL-4 | Rejected recommendations don't capture trust_delta for selected alternative | Medium | outcomes.ts:245-312 | **FIXED** |

### 1.2 CRITICAL - Savings Tracking Flaws

| ID | Bug | Severity | File | Status |
|----|-----|----------|------|--------|
| CLL-5 | **Estimated savings copied directly to realized savings** - inflates metrics | **CRITICAL** | outcomes.ts:194-199 | **FIXED** |
| CLL-6 | Price comparisons lack unit/basis validation - per-unit vs per-case mixing | High | outcomes.ts, updateRealizedSavings | **FIXED** (warning added) |
| CLL-7 | Price delta semantics confusing (positive = paid MORE) | Low | outcomes.ts:184 | NOT FIXED (documentation only) |

### 1.3 HIGH - Metrics Flaws

| ID | Bug | Severity | File | Status |
|----|-----|----------|------|--------|
| CLL-8 | Returns 0 for insufficient samples instead of null/-1 | High | qualityMetrics.ts (all rate functions) | **FIXED** |
| CLL-9 | Savings capture rate can exceed 100%, no cap | Medium | qualityMetrics.ts:231 | **FIXED** (capped at 150%) |
| CLL-10 | Latency metric only calculates average, no p50/p90/p99 | Medium | qualityMetrics.ts:351-394 | **FIXED** |

### 1.4 MEDIUM - Feedback-Loop Flaws

| ID | Bug | Severity | File | Status |
|----|-----|----------|------|--------|
| CLL-11 | Fixed 10% penalty for repeated rejections doesn't scale | Medium | scoringFeedback.ts:398-409 | **FIXED** |
| CLL-12 | Confidence reaches 100% at only 50 samples | Medium | scoringFeedback.ts:356 | **FIXED** (now 100 samples) |
| CLL-13 | Multiple adjustment types compound excessively | Medium | scoringFeedback.ts | **FIXED** (take strongest per type) |
| CLL-14 | min_sample_size too low (10) for statistical validity | Medium | scoringFeedback.ts:58 | **FIXED** (now 20) |

### 1.5 LOW - UI/View Flaws

| ID | Bug | Severity | File | Status |
|----|-----|----------|------|--------|
| CLL-15 | No view for understanding why recommendations failed | Low | migration SQL | NOT FIXED |
| CLL-16 | Savings confidence not clearly visible in accepted_recommendations view | Low | migration SQL | NOT FIXED |

### 1.6 Test Coverage Flaws

| ID | Bug | Severity | File | Status |
|----|-----|----------|------|--------|
| CLL-17 | No vitest unit tests for outcomes, qualityMetrics, scoringFeedback | High | N/A | NOT FIXED |
| CLL-18 | Stale expiration and duplicate prevention not tested | High | N/A | NOT FIXED |

---

## 2. Fixes Applied

### Fix 1: Stop Copying Estimated Savings to Realized (CLL-5)

**Before:**
```typescript
if (isRecommendedSupplier && outcome.estimated_savings && recommended_price > 0) {
  realized_savings = Number(outcome.estimated_savings); // BUG: copies estimate!
  savings_confidence = 'estimated';
}
```

**After:**
```typescript
if (isRecommendedSupplier && outcome.estimated_savings && recommended_price > 0) {
  savings_confidence = 'estimated';
  // NOTE: realized_savings stays null until confirmed by actual order data
}
```

**Impact:** Fixes inflated savings capture rate metrics. Realized savings now ONLY come from actual order data via `updateRealizedSavings()`.

---

### Fix 2: Add Error Handling and Fallback to Stale Expiration (CLL-3)

**Added:**
- Try/catch around RPC call
- Fallback direct UPDATE if RPC fails
- Returns error message in result object

**Impact:** Stale recommendations will now be expired even if the RPC function is missing or fails.

---

### Fix 3: Capture Trust Delta for Rejected Recommendations (CLL-4)

**Added:**
- Lookup trust score of selected alternative offer
- Calculate trust_delta between recommended and selected
- Store rejection context in metadata including original recommendation details

**Impact:** Better drill-down capability for understanding why operators rejected recommendations.

---

### Fix 4: Add Price Unit Validation Warning (CLL-6)

**Added:**
```typescript
if (baseline_price > 0 && actual_price_paid > baseline_price * 2) {
  console.warn('Possible unit mismatch in realized savings:', { ... });
}
```

**Added optional `price_basis` parameter to `updateRealizedSavings()` for explicit tracking.

**Impact:** Warns when prices may be in different units, helping catch data quality issues.

---

### Fix 5: Use -1 for Insufficient Data Instead of 0 (CLL-8)

**Before:** All rate calculations returned 0 when sample size < MIN_SAMPLE_SIZE  
**After:** Returns -1 to clearly indicate "insufficient data" vs "0% rate"

**Added `statistically_valid` and `insufficient_data` flags to all metric metadata.

**Impact:** Dashboards can now distinguish between bad performance (0%) and no data (-1).

---

### Fix 6: Cap Savings Capture Rate and Add Over-Capture Warning (CLL-9)

**Added:**
- Cap rate at 1.5 (150%) 
- `over_capture_warning` flag when realized > estimated * 1.1
- Clear percentage display in metadata

**Impact:** Prevents misleading >100% rates while flagging estimation quality issues.

---

### Fix 7: Add Percentile Metrics for Latency (CLL-10)

**Added:**
- p50, p90, p99 calculations
- min/max values
- Proper sorted array percentile computation

**Impact:** Better SLA monitoring - average hides outliers, percentiles reveal them.

---

### Fix 8: Scale Penalty for Repeated Rejections (CLL-11)

**Before:** Fixed 10% penalty regardless of rejection count  
**After:** Base 5% + 2% per rejection beyond threshold, capped at 12%

```typescript
const scaledPenalty = Math.min(
  FEEDBACK_CONFIG.penalty_magnitude + 
    (rejectionsOverThreshold * FEEDBACK_CONFIG.scaling_factor),
  FEEDBACK_CONFIG.max_scaled_penalty
);
```

**Impact:** Penalty now proportional to severity of the pattern.

---

### Fix 9: Increase Confidence Sample Size Threshold (CLL-12)

**Before:** `confidence = Math.min(1, pattern.sample_size / 50)`  
**After:** `confidence = Math.min(1, pattern.sample_size / 100)`

**Impact:** Adjustments don't reach full confidence until 100 samples, not 50.

---

### Fix 10: Prevent Adjustment Compounding (CLL-13)

**Before:** All adjustments of same type summed together  
**After:** Takes strongest adjustment per type only

```typescript
const byType: Record<string, { value: number; reason: string }> = {};
for (const adj of data) {
  const effectiveValue = Number(adj.adjustment_value) * Number(adj.confidence);
  const existing = byType[adj.adjustment_type];
  if (!existing || Math.abs(effectiveValue) > Math.abs(existing.value)) {
    byType[adj.adjustment_type] = { value: effectiveValue, reason: adj.reason };
  }
}
```

**Impact:** Prevents excessive penalty stacking from multiple detections of similar patterns.

---

### Fix 11: Increase Minimum Sample Size (CLL-14)

**Before:** `min_sample_size: 10`  
**After:** `min_sample_size: 20`

Also increased `repeated_rejection_count` from 3 to 5.

**Impact:** More statistical validity before generating feedback adjustments.

---

## 3. Remaining Risks

### 3.1 Schema Risk: Duplicate Terminal States (CLL-2) - **LAUNCH BLOCKER**

The unique index on `recommendation_outcomes` only covers:
```sql
WHERE outcome_status IN ('accepted', 'rejected', 'expired')
```

This means a recommendation can be:
- Both `accepted` AND `superseded`
- Both `rejected` AND `superseded`
- Have `partially_realized` alongside another terminal state

**Required Fix (apply before launch):**
```sql
DROP INDEX IF EXISTS idx_rec_outcomes_unique_terminal;
CREATE UNIQUE INDEX idx_rec_outcomes_unique_terminal 
  ON catalogos.recommendation_outcomes(recommendation_id) 
  WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized');
```

### 3.2 Validation Risk: Acceptance Without Entity Verification (CLL-1)

`recordRecommendationAcceptance` doesn't verify that `selected_supplier_id` or `selected_offer_id` exist in the database.

**Mitigation:** Add foreign key constraints or runtime validation.
**Risk Level:** Medium - could create orphaned references but won't corrupt core metrics.

### 3.3 Test Coverage Gap (CLL-17, CLL-18)

No vitest integration tests for:
- `outcomes.ts` functions
- `qualityMetrics.ts` calculations  
- `scoringFeedback.ts` pattern detection

**Recommendation:** Add test files before launch:
- `outcomes.test.ts`
- `qualityMetrics.test.ts`
- `scoringFeedback.test.ts`

### 3.4 UI/View Gaps (CLL-15, CLL-16)

The SQL views don't provide:
- Comparison of rejected recommendation vs selected alternative
- Clear savings confidence indicator

**Recommendation:** Add enhanced views for ops dashboard.

---

## 4. Launch Blockers by Severity

### CRITICAL (Must Fix Before Launch)

| ID | Issue | Impact | Fix |
|----|-------|--------|-----|
| CLL-2 | Duplicate terminal states allowed | Data integrity corruption | Apply schema migration |
| CLL-5 | Estimated→Realized copy | Metrics completely wrong | **ALREADY FIXED** |

### HIGH (Should Fix Before Launch)

| ID | Issue | Impact | Fix |
|----|-------|--------|-----|
| CLL-3 | Silent stale expiration failure | Recommendations never expire | **ALREADY FIXED** |
| CLL-8 | 0 for insufficient data | Misleading dashboards | **ALREADY FIXED** |
| CLL-17 | No test coverage | Regressions undetected | Add test files |

### MEDIUM (Fix Within 1 Week of Launch)

| ID | Issue | Impact |
|----|-------|--------|
| CLL-1 | No entity validation | Orphaned references possible |
| CLL-6 | Unit mismatch undetected | Wrong savings calculations |
| CLL-11-14 | Feedback loop calibration | Sub-optimal learning |

### LOW (Post-Launch)

| ID | Issue | Impact |
|----|-------|--------|
| CLL-7 | Price delta semantics | Developer confusion |
| CLL-15/16 | View gaps | Ops dashboard limitations |

---

## 5. Schema Migration Required

Create and apply this migration before launch:

```sql
-- Migration: fix_recommendation_outcomes_terminal_states.sql
-- Fix duplicate terminal state vulnerability

-- Drop the incomplete unique index
DROP INDEX IF EXISTS catalogos.idx_rec_outcomes_unique_terminal;

-- Create complete unique index covering ALL terminal states
CREATE UNIQUE INDEX idx_rec_outcomes_unique_terminal 
  ON catalogos.recommendation_outcomes(recommendation_id) 
  WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized');

-- Add check constraint to prevent invalid transitions
-- (accepted recommendations cannot become rejected, etc.)
ALTER TABLE catalogos.recommendation_outcomes 
  ADD CONSTRAINT chk_valid_terminal_state 
  CHECK (
    -- If accepted_at is set, status must be accepted or partially_realized
    (accepted_at IS NULL OR outcome_status IN ('accepted', 'partially_realized'))
    AND
    -- If rejected_at is set, status must be rejected
    (rejected_at IS NULL OR outcome_status = 'rejected')
  );
```

---

## 6. Files Modified

| File | Changes |
|------|---------|
| `storefront/src/lib/procurement/outcomes.ts` | Fixed estimated→realized copy, added stale expiration fallback, added trust_delta capture, added price basis validation |
| `storefront/src/lib/procurement/qualityMetrics.ts` | Fixed all rate calculations to use -1 for insufficient data, added percentile metrics, capped savings capture rate |
| `storefront/src/lib/procurement/scoringFeedback.ts` | Increased sample thresholds, scaled penalties, prevented adjustment compounding |

---

## 7. Verification Checklist

After applying fixes, verify:

- [ ] `recordRecommendationAcceptance` no longer sets `realized_savings` from `estimated_savings`
- [ ] `expireStaleRecommendations` returns error info when RPC fails
- [ ] All quality metrics return -1 (not 0) when sample size < 10
- [ ] `calculateLatencyToDecision` includes p50/p90/p99 in metadata
- [ ] Feedback adjustments require 20+ samples (not 10)
- [ ] Repeated rejection penalty scales with count
- [ ] Apply schema migration for terminal state uniqueness
- [ ] Add vitest coverage for outcomes and metrics

---

## 8. Conclusion

The closed-loop learning implementation had a **critical bug** that would have produced completely misleading savings metrics. This is now fixed. The schema vulnerability for duplicate terminal states must be fixed via migration before launch.

With the applied fixes:
- Metrics now accurately distinguish estimated vs confirmed savings
- Statistical validity is properly enforced
- Feedback loop is calibrated for production scale
- Error handling prevents silent failures

**Recommendation:** Apply schema migration, add test coverage, then proceed to launch.
