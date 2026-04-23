# GloveCubs Business Logic Integration

## Overview

This document details the integration of real business logic into the GloveCubs agent operations framework, completing the transition from placeholder handlers to production-ready implementations.

## Completed Integrations

### 1. Audit Run Handler (`handleAuditRun`)

**Status**: ✅ Complete

**File**: `storefront/src/lib/jobs/handlers/auditRun.ts`

**Integration Details**:
- Calls `runQAAudit()` from `storefront/src/lib/qa/service.ts`
- Service wraps legacy `lib/qaSupervisor.js` audit logic
- TypeScript adapter at `storefront/src/lib/legacy/qaSupervisor.ts`

**Execution Modes**:
| Mode | Mutations | fix_logs | review_items | audit_reports |
|------|-----------|----------|--------------|---------------|
| `dry_run` | No | No | No | No |
| `review_only` | No | No | Yes | Yes |
| `apply_safe_fixes` | fix_logs only* | Yes | Yes | Yes |

*Note: Source tables (supplier_products, canonical_products, etc.) are NOT updated. Fixes are logged to `fix_logs` for manual application.

**Domain Modules Audited**:
- `supplier_discovery` - Supplier legitimacy, duplicates
- `product_intake` - Field quality, case math, parse confidence
- `product_matching` - Match confidence, false matches
- `competitive_pricing` - Margin floors, MAP violations
- `daily_price_guard` - Action queue quality

**Persistence**:
- `audit_reports` - Full audit result JSON
- `fix_logs` - Individual fix records with prior/new values
- `blocked_actions` - Blocked items with reasons
- `review_queue` - Items requiring human review

---

### 2. Daily Price Guard (`handleDailyPriceGuard`)

**Status**: ✅ Complete

**File**: `storefront/src/lib/jobs/handlers/dailyPriceGuard.ts`

**Integration Details**:
- Calls `runDailyPriceGuard()` from `lib/dailyPriceGuard.js`
- TypeScript adapter at `storefront/src/lib/legacy/dailyPriceGuard.ts`

**Metrics Sources** (REAL DATA):
| Metric | Source | Fallback |
|--------|--------|----------|
| `daily_views` | `product_favorites` count × 10 + `order_items` count × 5 | Hash-based (5-100) |
| `daily_revenue` | 30-day `order_items` sum / 30 | Hash-based from price |
| `days_since_last_sale` | Days since last `order_items.created_at` | Hash-based (31-60) |
| `current_margin_percent` | `(price - cost) / price` | Direct calculation |

**Data Loaded**:
- `canonical_products` - Products with price/cost
- `competitor_offers` - Recent 7-day offers with confidence/pack/brand filtering
- `pricing_recommendations` - Previous lowest prices for change detection
- `order_items` + `orders` - Revenue and sale metrics
- `product_favorites` - Interest proxy

**Persistence**:
- `daily_actions` - Action queue items (upsert by product+date+action)
- `review_queue` - Non-auto-publish items

**Followup Jobs**:
- `competitor_price_check` - For high-priority products
- `pricing_recommendation` - For pricing_review/auto_publish items

---

### 3. Supplier Ingestion (`handleSupplierIngestion`)

**Status**: ✅ Complete

**File**: `storefront/src/lib/jobs/handlers/supplierIngestion.ts`

**Supported Formats**:
- CSV (with proper quote handling)
- JSON (arrays or nested `products`/`items`/`data`)
- XLSX (requires `xlsx` package)

**Processing Flow**:
1. Create import batch record
2. Load file (Storage, URL, or inline content)
3. Detect format and parse
4. Validate rows (checksum, required fields)
5. Persist to `supplier_products_raw` (immutable)
6. Persist to `supplier_products_normalized` (staging)
7. Create review items for bad rows
8. Enqueue `product_normalization` jobs

**File Sources**:
| Source | Input Field | Notes |
|--------|-------------|-------|
| Supabase Storage | `file_id` | Downloads from `supplier-files` bucket |
| URL | `file_url` | Fetches from external URL |
| Inline | `file_content` | Direct content for API/testing |

**Validation**:
- Checksum generation (MD5 hash of normalized row)
- Required field detection (sku, mpn, upc, product_id)
- Product info detection (name, title, description)
- Column mapping support for non-standard headers

**Idempotency**:
- Raw rows upsert by `batch_id,supplier_id,external_id`
- Duplicate detection within file by external_id

---

### 4. Competitor Price Check (`handleCompetitorPriceCheck`)

**Status**: ✅ Complete

**File**: `storefront/src/lib/jobs/handlers/competitorPriceCheck.ts`

**Offer Collection Sources**:
| Priority | Source | Table/API |
|----------|--------|-----------|
| 1 | Scraper Results | `competitor_scraper_results` (if exists) |
| 2 | Existing Offers | `competitor_offers` (14-day lookback) |
| 3 | Placeholder | Deterministic test data (non-production only) |

**Validation Rules**:
- Staleness check (configurable days, default 7)
- Pack size comparability
- Shipping requirement for close prices (<10% diff)
- Price variance limit (default 50%)
- Confidence threshold (default 0.7)

**Persistence**:
- `competitor_offers` - Validated offers (upsert by product+source)
- `review_queue` - Ambiguous pack/shipping issues

**Followup Jobs**:
- `pricing_recommendation` - For products with valid offers

**Configuration** (from `agent_rules`):
- `competitive_pricing.stale_data_days` - Default: 7
- `competitive_pricing.min_offer_confidence` - Default: 0.7
- `competitive_pricing.max_price_variance_percent` - Default: 0.5
- `competitive_pricing.require_shipping_for_close_comparison` - Default: true

---

### 5. TypeScript Adapters

**Location**: `storefront/src/lib/legacy/`

| Adapter | Legacy Module | Exports |
|---------|--------------|---------|
| `productNormalization.ts` | `lib/productNormalization.js` | `normalizeProduct`, `generateCanonicalTitle`, etc. |
| `productMatching.ts` | `lib/productMatching.js` | `matchSingleProduct`, `findMatches`, etc. |
| `competitivePricing.ts` | `lib/competitivePricing.js` | `generateRecommendation`, `validateOffer`, etc. |
| `dailyPriceGuard.ts` | `lib/dailyPriceGuard.js` | `runDailyPriceGuard`, `calculatePriority`, etc. |
| `qaSupervisor.ts` | `lib/qaSupervisor.js` | `runFullAudit`, `auditSupplierDiscovery`, etc. |
| `index.ts` | N/A | Re-exports all adapters |

---

## Integration Tests

**File**: `storefront/src/lib/jobs/__tests__/handlers.test.ts`

**Test Coverage**:
1. Handler Input Validation
   - Supplier Ingestion missing supplier_id rejection
   - Supplier Ingestion missing file source rejection
   - Valid CSV content parsing
   - Empty CSV handling
   - Followup job generation
2. Audit Run
   - dry_run mode support
   - review_only mode support
   - Summary metrics return
3. CSV Parsing
   - Quoted fields handling
   - Fields with commas
   - Missing identifier detection
4. JSON Parsing
   - Array of products
   - Nested products key

**Run Tests**:
```bash
cd storefront
npm run test
```

**Note**: Tests use mocked Supabase client to avoid database dependencies. For full integration testing with real data, see the manual test script at `scripts/test-handlers.js`.

---

## Schema Assumptions

### Tables Used

| Table | Purpose | Handler(s) |
|-------|---------|-----------|
| `canonical_products` | Master product catalog | All pricing/matching handlers |
| `supplier_products` | Normalized supplier products | Normalization, Matching |
| `supplier_products_raw` | Immutable raw rows | Ingestion |
| `supplier_products_normalized` | Staging for review | Ingestion |
| `competitor_offers` | Competitor pricing data | Price Check, Pricing Rec |
| `pricing_recommendations` | Generated recommendations | Pricing Rec, Daily Guard |
| `daily_actions` | Action queue items | Daily Guard |
| `product_matches` | Match results | Product Match |
| `review_queue` | Items for human review | All handlers |
| `audit_reports` | Audit run results | Audit Run |
| `fix_logs` | Applied/logged fixes | Audit Run |
| `blocked_actions` | Blocked items | Audit Run |
| `import_batches` | File import tracking | Ingestion |
| `order_items` | Order line items | Daily Guard (metrics) |
| `product_favorites` | User favorites | Daily Guard (metrics) |

### Schema Gaps

| Missing Table | Impact | Workaround |
|---------------|--------|------------|
| `competitor_scraper_results` | No fresh scraper data | Falls back to existing offers |
| `product_analytics` | No real view counts | Uses favorites × 10 + sales × 5 |

---

## What Still Uses Placeholders

| Component | Placeholder | Notes |
|-----------|-------------|-------|
| Competitor scraper | Uses existing offers | Real scraper integration needed |
| View analytics | Derived from favorites | Real analytics table needed |
| Supplier discovery | Not integrated | `lib/supplierDiscovery.js` doesn't exist |

---

## Remaining Blockers

### Before Production Ready:

1. **Install @supabase/ssr** - Admin pages need this dependency
2. **Create competitor_scraper_results table** - Or integrate with price monitoring API
3. **Add real analytics** - View counts, session data
4. **Test with real data** - Run handlers against production-like dataset
5. **Add error monitoring** - Sentry/similar for production errors
6. **Implement source table updates** - Currently fix_logs only records fixes, doesn't apply them

### Configuration Required:

```sql
-- Ensure agent_rules has these entries:
INSERT INTO agent_rules (agent_name, rule_key, rule_value, is_enabled) VALUES
('competitive_pricing', 'stale_data_days', '7', true),
('competitive_pricing', 'min_offer_confidence', '0.7', true),
('competitive_pricing', 'require_shipping_for_close_comparison', 'true', true),
('daily_price_guard', 'high_traffic_threshold', '50', true),
('daily_price_guard', 'high_revenue_threshold', '500', true),
('daily_price_guard', 'long_tail_traffic_threshold', '5', true)
ON CONFLICT (agent_name, rule_key) DO NOTHING;
```

---

## Files Changed

### New Files
- `storefront/src/lib/legacy/qaSupervisor.ts`
- `storefront/src/lib/jobs/__tests__/e2e-integration.test.ts`

### Modified Files
- `storefront/src/lib/legacy/index.ts` - Added qaSupervisor exports
- `storefront/src/lib/jobs/handlers/dailyPriceGuard.ts` - Real metrics
- `storefront/src/lib/jobs/handlers/supplierIngestion.ts` - Real parsing
- `storefront/src/lib/jobs/handlers/competitorPriceCheck.ts` - Real collection
- `storefront/src/lib/agents/types.ts` - Extended payload types
