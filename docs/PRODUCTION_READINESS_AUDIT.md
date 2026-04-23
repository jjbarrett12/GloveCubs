# GLOVECUBS Production Readiness Audit

**Audit Date:** 2026-03-02  
**Auditor:** Principal Engineer  
**Status:** CONDITIONAL GO

---

## Executive Summary

The GLOVECUBS platform has significant infrastructure in place but contains **3 LAUNCH BLOCKERS** and **7 HIGH-RISK issues** that must be addressed before production deployment.

| Severity | Count | Status |
|----------|-------|--------|
| **LAUNCH BLOCKER** | 3 | Must fix |
| High Risk | 7 | Should fix |
| Medium Risk | 8 | Fix soon after launch |
| Low Risk | 5 | Address as time permits |

---

## 1. LAUNCH BLOCKERS (Must Fix Before Launch)

### LB-1: Missing RLS on Procurement Intelligence Tables (CRITICAL)
**Location:** `storefront/supabase/migrations/20260311000008_procurement_intelligence.sql`

**Issue:** The following tables have NO row-level security policies:
- `supplier_reliability_scores`
- `offer_trust_scores`
- `margin_opportunities`
- `supplier_recommendations`
- `procurement_alerts`
- `procurement_intelligence_metrics`

**Impact:** Any authenticated user could potentially read/write all supplier reliability scores, manipulate recommendation rankings, or inject false procurement alerts.

**Fix Required:**
```sql
ALTER TABLE catalogos.supplier_reliability_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.offer_trust_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.margin_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.procurement_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.procurement_intelligence_metrics ENABLE ROW LEVEL SECURITY;

-- Add admin-only policies (these are internal scoring tables)
CREATE POLICY "admin_only_supplier_reliability" ON catalogos.supplier_reliability_scores
  FOR ALL USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');
-- ... repeat for all tables
```

---

### LB-2: Missing RLS on Forecasting and Closed-Loop Tables (CRITICAL)
**Location:** `storefront/supabase/migrations/20260311000010_forecasting_engine.sql`, `20260311000009_recommendation_outcomes.sql`

**Issue:** The following tables have NO row-level security policies:
- `supplier_forecasts`
- `price_volatility_forecasts`
- `commercial_guidance_recommendations`
- `commercial_risk_scores`
- `forecast_quality_metrics`
- `recommendation_outcomes`
- `recommendation_quality_metrics`
- `scoring_feedback_adjustments`

**Impact:** Suppliers could potentially view or manipulate their own forecasts, competitive intelligence, or recommendation outcomes.

**Fix Required:** Same pattern as LB-1 - enable RLS and add admin-only policies.

---

### LB-3: Supplier Portal Upload Data Leakage Risk (CRITICAL)
**Location:** `storefront/src/lib/supplier-portal/feedUpload.ts` line 843-896

**Issue:** The `correctRow` and `getUploadRows` functions fetch data by `upload_id` without verifying that the upload belongs to the requesting supplier's session.

```typescript
// VULNERABLE: No supplier_id verification
export async function getUploadRows(
  upload_id: string,
  filter?: 'all' | 'valid' | 'warning' | 'error'
): Promise<ParsedRow[]> {
  let query = supabaseAdmin
    .from('supplier_feed_upload_rows')
    .select('*')
    .eq('upload_id', upload_id)  // <-- No supplier verification!
```

**Impact:** A malicious supplier could access another supplier's feed upload data by guessing or discovering upload_ids.

**Fix Required:**
```typescript
export async function getUploadRows(
  upload_id: string,
  supplier_id: string,  // ADD THIS PARAMETER
  filter?: 'all' | 'valid' | 'warning' | 'error'
): Promise<ParsedRow[]> {
  // First verify upload belongs to supplier
  const { data: upload } = await supabaseAdmin
    .from('supplier_feed_uploads')
    .select('id')
    .eq('id', upload_id)
    .eq('supplier_id', supplier_id)
    .single();
    
  if (!upload) throw new Error('Upload not found');
  // ... rest of function
}
```

---

## 2. HIGH-RISK Issues

### HR-1: No Database Transactions in Feed Upload Commit
**Location:** `storefront/src/lib/supplier-portal/feedUpload.ts` lines 902-1006

**Issue:** The `commitFeedUpload` function iterates over rows and creates/updates offers individually without a transaction wrapper. A failure mid-commit leaves partial data.

**Impact:** Partial uploads could corrupt supplier pricing data, leaving some products updated and others not.

**Fix Required:** Use a Postgres function with transaction control or implement a two-phase commit pattern.

---

### HR-2: No Row Locking for Concurrent Recommendation Recording
**Location:** `storefront/src/lib/procurement/outcomes.ts`

**Issue:** No `SELECT FOR UPDATE` or advisory locks are used when recording recommendation outcomes. Two concurrent requests could create duplicate terminal states.

**Impact:** Race conditions could corrupt outcome tracking and feedback loops.

**Fix Required:** Add explicit locking or use the partial unique index constraint defensively.

---

### HR-3: Password Hashing Uses SHA-256 (Weak)
**Location:** `storefront/src/lib/supplier-portal/auth.ts` lines 54-68

**Issue:** Supplier passwords are hashed with SHA-256 + salt, which is fast and vulnerable to GPU attacks.

```typescript
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || randomBytes(16).toString('hex');
  const hash = createHash('sha256')  // <-- SHA-256 is too fast
    .update(password + useSalt)
    .digest('hex');
```

**Impact:** If the database is breached, supplier passwords could be cracked relatively quickly.

**Fix Required:** Use bcrypt, scrypt, or argon2:
```typescript
import { hash, compare } from 'bcrypt';
const SALT_ROUNDS = 12;
const passwordHash = await hash(password, SALT_ROUNDS);
```

---

### HR-4: No Rate Limiting on Supplier Login
**Location:** `storefront/src/lib/supplier-portal/auth.ts`

**Issue:** The `max_login_attempts` and `lockout_duration_minutes` config exists but is NOT enforced in the `loginSupplier` function.

**Impact:** Brute force attacks against supplier accounts are possible.

**Fix Required:** Implement login attempt tracking and lockout.

---

### HR-5: Session Token in Cookie Without HttpOnly
**Location:** `storefront/src/app/supplier-portal/api/auth/route.ts` (implied)

**Issue:** Need to verify that session cookies are set with `HttpOnly`, `Secure`, and `SameSite=Strict` flags.

**Impact:** XSS attacks could steal session tokens.

---

### HR-6: Missing Forecasting Test Coverage
**Location:** `storefront/src/lib/forecasting/*.ts`

**Issue:** No test files exist for the forecasting module. Critical thresholds, deduplication logic, and guidance resolution are untested.

**Impact:** Regressions could silently break forecasting accuracy.

---

### HR-7: AI Extraction Without Confidence Floor
**Location:** `storefront/src/lib/supplier-portal/feedUpload.ts` lines 350-389

**Issue:** AI-extracted fields from product names are accepted even with confidence scores as low as 0.7. No absolute floor prevents low-confidence extractions from being used.

**Impact:** Incorrect pack sizes, materials, or sizes could be committed to the database.

**Fix Required:** Add minimum confidence floor (e.g., 0.5) below which extraction is rejected.

---

## 3. MEDIUM-RISK Issues

### MR-1: Insufficient Data Displayed as "Low Risk"
**Location:** `storefront/src/lib/forecasting/commercialRisk.ts`

**Issue:** Products with insufficient data get `risk_band: 'low'` due to DB constraints, potentially confusing operators.

**Status:** Partially mitigated with `confidence: 0` and `risk_score: -1`. Frontend must check these flags.

---

### MR-2: No Index on recommendation_outcomes.product_id
**Location:** `storefront/supabase/migrations/20260311000009_recommendation_outcomes.sql`

**Issue:** Common queries filter by `product_id` but no index exists.

**Fix:** `CREATE INDEX idx_rec_outcomes_product ON catalogos.recommendation_outcomes(product_id);`

---

### MR-3: Stale Session Cleanup Not Scheduled
**Location:** `storefront/src/lib/supplier-portal/auth.ts`

**Issue:** `cleanupExpiredSessions` exists but may not be called regularly.

**Fix:** Add to nightly cron.

---

### MR-4: No File Size Limit on Upload
**Location:** `storefront/src/app/supplier-portal/api/feed-upload/route.ts`

**Issue:** No check for file size before processing. Large files could cause memory issues.

**Fix:** Add file size validation (e.g., max 10MB).

---

### MR-5: Fuzzy Match Threshold Too Low
**Location:** `storefront/src/lib/supplier-portal/feedUpload.ts` line 444

**Issue:** `best.score >= 0.6` allows matches with 60% token overlap, which can produce false positives.

**Recommendation:** Consider raising to 0.7 or adding attribute verification.

---

### MR-6: No Duplicate Outcome Prevention in Application Layer
**Location:** `storefront/src/lib/procurement/outcomes.ts`

**Issue:** Relies entirely on database unique index to prevent duplicates. No application-level check before insert.

**Status:** Partially addressed by terminal-state uniqueness migration. Add explicit check.

---

### MR-7: Missing Foreign Key on supplier_offers.product_id
**Location:** Review schema

**Issue:** Need to verify FK constraint exists.

---

### MR-8: Cron Jobs Missing CRON_SECRET in Development
**Location:** `storefront/src/app/api/internal/cron/nightly/route.ts` line 25

**Issue:** Falls back to allowing all requests in development mode without authentication.

```typescript
if (!cronSecret) return process.env.NODE_ENV === 'development';
```

**Risk:** Development environment could be exploited if exposed.

---

## 4. LOW-RISK Issues

### LR-1: Generic Recommended Actions
**Issue:** Commercial guidance recommended_action text is generic.

### LR-2: Missing Audit Log Index on entity_id
**Location:** `supplier_audit_log` table

### LR-3: No Pagination Limit Validation
**Issue:** API endpoints accept arbitrary limit values.

### LR-4: Log Level Not Configurable
**Issue:** No environment variable for log level.

### LR-5: No Health Check Endpoint
**Issue:** Missing `/api/health` endpoint for load balancers.

---

## 5. Missing Tests

| Area | Critical Tests Missing |
|------|----------------------|
| **Forecasting** | Threshold behavior, deduplication, low-signal suppression |
| **RLS Policies** | Cross-supplier access prevention |
| **Feed Upload Commit** | Transaction rollback on failure |
| **Outcome Recording** | Concurrent request handling |
| **Password Auth** | Rate limiting, lockout behavior |
| **Session Management** | Token expiration, refresh |
| **Price Anomaly Detection** | Edge cases, false positive rates |
| **Migrations** | Rollback safety |

---

## 6. Recommended Hardening Improvements

### Security
1. Implement rate limiting on all public APIs
2. Add CSRF protection for supplier portal
3. Implement audit log for admin actions
4. Add IP allowlisting option for supplier accounts

### Reliability
1. Add circuit breaker for AI extraction calls
2. Implement retry with exponential backoff for DB operations
3. Add dead letter queue for failed jobs
4. Implement graceful degradation for forecasting

### Observability
1. Add structured logging with correlation IDs
2. Implement distributed tracing
3. Add performance metrics (p50/p95/p99 latencies)
4. Create alerting rules for critical failures

### Performance
1. Add read replicas for reporting queries
2. Implement caching for supplier dashboard data
3. Add connection pooling configuration
4. Optimize batch insert sizes for feed uploads

---

## Files Requiring Modification

| File | Issue | Priority |
|------|-------|----------|
| `storefront/supabase/migrations/20260311000008_procurement_intelligence.sql` | Add RLS policies | BLOCKER |
| `storefront/supabase/migrations/20260311000010_forecasting_engine.sql` | Add RLS policies | BLOCKER |
| `storefront/supabase/migrations/20260311000009_recommendation_outcomes.sql` | Add RLS policies | BLOCKER |
| `storefront/src/lib/supplier-portal/feedUpload.ts` | Add supplier_id verification | BLOCKER |
| `storefront/src/lib/supplier-portal/feedUpload.ts` | Add transaction wrapper | HIGH |
| `storefront/src/lib/supplier-portal/auth.ts` | Use bcrypt, add rate limiting | HIGH |
| `storefront/src/lib/procurement/outcomes.ts` | Add row locking | HIGH |
| `storefront/src/app/supplier-portal/api/feed-upload/route.ts` | Add file size limit | MEDIUM |

---

## Verdict

### Is GLOVECUBS ready for production launch?

# CONDITIONAL GO

The system is **NOT READY** in its current state due to 3 launch blockers:

1. **LB-1:** Missing RLS on procurement intelligence tables
2. **LB-2:** Missing RLS on forecasting/closed-loop tables
3. **LB-3:** Supplier upload data leakage risk

### Conditions for GO:

1. ✅ Fix all 3 launch blockers (estimated: 2-4 hours)
2. ✅ Deploy terminal-state uniqueness migration
3. ✅ Run duplicate preflight check
4. ⚠️ Address at least HR-3 (password hashing) and HR-4 (rate limiting)

### Post-Launch Priority:

1. Add forecasting test coverage
2. Implement transaction wrapper for feed commits
3. Add monitoring and alerting
4. Complete security hardening

---

## Verification Checklist

- [ ] All RLS policies added to procurement tables
- [ ] All RLS policies added to forecasting tables
- [ ] Supplier upload functions verify ownership
- [ ] Terminal-state uniqueness migration deployed
- [ ] Password hashing upgraded to bcrypt
- [ ] Rate limiting implemented on login
- [ ] Session cookies have HttpOnly/Secure flags
- [ ] File upload size limit added
- [ ] Health check endpoint added
- [ ] Monitoring configured
