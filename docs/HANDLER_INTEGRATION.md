# Handler Integration Documentation

This document describes how the TypeScript job handlers are integrated with the existing JavaScript business logic modules.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     TypeScript Handlers                          │
│  storefront/src/lib/jobs/handlers/*.ts                          │
├─────────────────────────────────────────────────────────────────┤
│                     TypeScript Adapters                          │
│  storefront/src/lib/legacy/*.ts                                 │
├─────────────────────────────────────────────────────────────────┤
│                  JavaScript Business Logic                       │
│  lib/productNormalization.js                                    │
│  lib/productMatching.js                                         │
│  lib/competitivePricing.js                                      │
│  lib/dailyPriceGuard.js                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Handler → Legacy Module Mapping

### 1. Product Normalization Handler

**Handler:** `storefront/src/lib/jobs/handlers/productNormalization.ts`  
**Legacy Module:** `lib/productNormalization.js`

| Handler Function | Legacy Function | Purpose |
|-----------------|-----------------|---------|
| `handleProductNormalization` | `normalizeProduct()` | Transform raw supplier data to normalized format |
| Validation logic | `validateAndScore()` | Compute parse_confidence and review_required |
| Title generation | `generateCanonicalTitle()` | Create standardized product title |
| Bullet generation | `generateBulletPoints()` | Generate marketing bullet points |

**Output Mapping:**

```typescript
// Legacy output fields → Handler output
normalized.material        → output.material
normalized.color           → output.color
normalized.grade           → output.grade
normalized.parse_confidence → output.confidence
normalized.review_required → output.review_required
normalized.canonical_title → output.canonical_title
normalized.review_reasons  → output.issues
```

**Persistence:**
- Normalized product saved to `supplier_products` table
- Review items created in `review_queue` for low-confidence products
- Followup `product_match` job queued for high-confidence products

---

### 2. Product Match Handler

**Handler:** `storefront/src/lib/jobs/handlers/productMatch.ts`  
**Legacy Module:** `lib/productMatching.js`

| Handler Function | Legacy Function | Purpose |
|-----------------|-----------------|---------|
| `handleProductMatch` | `matchSingleProduct()` | Find best match in catalog |
| | `findMatches()` | Find all potential matches |
| | `determineMatchResult()` | Classify as exact/likely/variant/new/review |

**Match Result Types:**

| Result | Handler Action | Persistence |
|--------|---------------|-------------|
| `exact_match` | `link_to_existing` | Creates link in `supplier_product_links` |
| `likely_match` | `human_review` | Creates review item |
| `variant` | `create_variant` | Creates variant link + review item |
| `new_product` | `create_new_canonical` | Creates new `canonical_products` row |
| `review` | `human_review` | Creates review item |

**Output Mapping:**

```typescript
// Legacy output → Handler output
matchResult.match_result       → output.match_result
matchResult.match_confidence   → output.match_confidence
matchResult.canonical_product_id → output.canonical_product_id
matchResult.recommended_action → output.action
matchResult.matched_fields     → output.matched_fields (count)
matchResult.conflicting_fields → output.conflicting_fields (count)
```

---

### 3. Pricing Recommendation Handler

**Handler:** `storefront/src/lib/jobs/handlers/pricingRecommendation.ts`  
**Legacy Module:** `lib/competitivePricing.js`

| Handler Function | Legacy Function | Purpose |
|-----------------|-----------------|---------|
| `handlePricingRecommendation` | `generateRecommendation()` | Compute optimal price |
| Offer validation | `validateOffer()` | Filter competitor offers |
| | `normalizeOffers()` | Weight and filter offers |
| Margin checks | `calculateMargin()` | Verify margin floors |
| | `meetsMarginFloor()` | Check min margin requirement |

**Pricing Actions:**

| Action | Meaning | Auto-Publish? |
|--------|---------|---------------|
| `keep` | Price is competitive | Yes (if confident) |
| `lower` | We're overpriced | Depends on swing % |
| `raise` | We're underpriced | Depends on swing % |
| `review` | Cannot decide safely | Never |
| `suppress` | Product should be hidden | Never |

**Output Mapping:**

```typescript
// Legacy output → Handler output
recommendation.action                → output.recommendation.action
recommendation.recommended_price     → output.recommendation.recommended_price
recommendation.confidence            → output.recommendation.confidence
recommendation.auto_publish_eligible → output.recommendation.auto_publish_eligible
recommendation.review_reasons        → output.review_reasons
```

**Persistence:**
- Recommendation saved to `pricing_recommendations` table
- Review items created for non-auto-publish changes

---

### 4. Daily Price Guard Handler

**Handler:** `storefront/src/lib/jobs/handlers/dailyPriceGuard.ts`  
**Legacy Module:** `lib/dailyPriceGuard.js`

| Handler Function | Legacy Function | Purpose |
|-----------------|-----------------|---------|
| `handleDailyPriceGuard` | `runDailyPriceGuard()` | Daily monitoring run |
| Priority calculation | `calculatePriority()` | Determine high/medium/low |
| Change detection | `detectCostChange()` | Find supplier cost changes |
| | `detectCompetitorPriceChange()` | Find competitor movements |
| | `detectStaleness()` | Find stale pricing data |
| Long-tail filtering | `isLongTailProduct()` | Filter low-traffic SKUs |

**Action Types Generated:**

| Action Type | Meaning | Followup Jobs |
|-------------|---------|---------------|
| `auto_publish` | Safe to auto-update | `pricing_recommendation` |
| `pricing_review` | Price change needs approval | `pricing_recommendation` |
| `supplier_review` | Cost change detected | None |
| `catalog_review` | Stale data needs refresh | `competitor_price_check` |

**Output Mapping:**

```typescript
// Legacy output → Handler output
result.summary.products_checked     → output.summary.products_checked
result.summary.auto_publish_candidates → output.summary.auto_publish_candidates
result.summary.manual_review_count  → output.summary.manual_review_count
result.actions                      → Persisted to daily_actions + review_queue
```

---

## TypeScript Adapter Layer

The adapters in `storefront/src/lib/legacy/` provide typed interfaces for the JavaScript modules:

### Adapter Files

| Adapter | Purpose |
|---------|---------|
| `productNormalization.ts` | Types for normalization functions |
| `productMatching.ts` | Types for matching functions |
| `competitivePricing.ts` | Types for pricing functions |
| `dailyPriceGuard.ts` | Types for daily guard functions |
| `index.ts` | Unified export of all adapters |

### Usage in Handlers

```typescript
// Import from unified adapter
import { 
  normalizeProduct,
  matchSingleProduct,
  generateRecommendation,
  runDailyPriceGuard,
} from '../../legacy';

// Functions are now typed
const normalized: NormalizedProduct = normalizeProduct(rawData);
const match: ProductMatchResult = matchSingleProduct(incoming, catalog);
```

---

## Persistence Strategy

### What Gets Persisted

| Handler | Table | Records |
|---------|-------|---------|
| Normalization | `supplier_products` | Normalized product data |
| Normalization | `review_queue` | Low-confidence items |
| Match | `product_matches` | Match results |
| Match | `supplier_product_links` | Product links |
| Match | `canonical_products` | New products |
| Match | `review_queue` | Uncertain matches |
| Pricing | `pricing_recommendations` | Price recommendations |
| Pricing | `review_queue` | Non-auto-publish changes |
| Daily Guard | `daily_actions` | Action items |
| Daily Guard | `review_queue` | Manual review items |

### Review Item Creation

All handlers use `createReviewItem()` for consistent review queue management:

```typescript
import { createReviewItem } from '../../review/createReviewItem';

// Creates review item with deduplication
const created = await createReviewItem({
  review_type: 'catalog',
  priority: 'medium',
  source_table: 'supplier_products',
  source_id: productId,
  title: 'Review needed',
  issue_category: 'low_confidence',
  issue_summary: 'Details here',
  recommended_action: 'VERIFY - check data',
  agent_name: 'product_intake',
  confidence: 0.75,
  details: { ... },
});
```

---

## Testing

### Integration Test Script

Run the integration tests:

```bash
node scripts/test-handlers.js
```

Options:
- `--verbose` - Show detailed output
- `--module <name>` - Test specific module (norm, match, pricing, guard)

### Test Coverage

| Module | Tests | Coverage |
|--------|-------|----------|
| Normalization | 8 | Field normalization, full product, confidence scoring |
| Matching | 5 | Similarity, exact match, new product, variant, batch |
| Pricing | 6 | Margin, min price, offer validation, recommendations |
| Daily Guard | 6 | Priority, change detection, staleness, full run |

---

## Schema Assumptions

The handlers assume these tables exist:

| Table | Required Columns |
|-------|-----------------|
| `supplier_products` | id, supplier_id, normalized fields, parse_confidence |
| `canonical_products` | id, sku, name, all product attributes |
| `product_matches` | supplier_product_id, canonical_product_id, match_result |
| `supplier_product_links` | supplier_product_id, canonical_product_id, match_type |
| `competitor_offers` | canonical_product_id, visible_price, confidence |
| `pricing_recommendations` | canonical_product_id, recommended_price, action |
| `daily_actions` | product_id, action_type, run_date, status |
| `review_queue` | Standard review queue schema |

---

## Remaining Gaps

### Not Yet Implemented

1. **Supplier Discovery** - No existing `lib/supplierDiscovery.js`
2. **Supplier Ingestion** - Partial; uses `lib/ingestion/` modules
3. **Competitor Price Check** - Needs scraper integration

### Known Limitations

1. **Daily metrics** - Uses random placeholder data
   - TODO: Integrate with analytics tables

2. **Catalog loading** - Loads up to 1000 products
   - TODO: Add pagination for large catalogs

3. **Competitor offers** - Loaded from database only
   - TODO: Integrate live scraper when available

---

## Configuration

Handlers read rules from `agent_rules` table:

```sql
-- Example rules
INSERT INTO agent_rules (agent_name, rule_key, rule_value) VALUES
('product_intake', 'min_publish_confidence', '0.90'),
('product_intake', 'require_brand', 'true'),
('product_matching', 'exact_match_confidence_threshold', '0.95'),
('product_matching', 'block_on_pack_mismatch', 'true'),
('competitive_pricing', 'minimum_margin_percent', '0.22'),
('competitive_pricing', 'max_auto_publish_swing_percent', '0.05'),
('daily_price_guard', 'high_traffic_threshold', '100');
```

Rules are loaded via `getAgentRule()`:

```typescript
const minConfidence = await getAgentRule<number>(
  'product_intake',
  'min_publish_confidence',
  0.90 // default
);
```
