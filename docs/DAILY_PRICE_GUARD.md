# Daily Price Guard Agent

The Daily Price Guard Agent monitors your top products daily and generates actionable pricing and catalog decision queues.

## Overview

The agent runs daily to:
1. **Review priority SKUs** - High traffic, revenue, and price-sensitive products first
2. **Detect cost changes** - Alert when supplier costs increase or decrease
3. **Monitor competitor prices** - Identify meaningful competitive shifts
4. **Find overpriced products** - Products priced above market
5. **Find underpriced products** - Margin opportunities being left on the table
6. **Flag stale data** - Products with outdated pricing intelligence
7. **Generate action queues** - Prioritized actions for review or auto-publish

## Usage

```bash
# Run with demo data
node scripts/daily-price-guard.js --demo

# Run from database
node scripts/daily-price-guard.js --from-db

# Run from file
node scripts/daily-price-guard.js --input products.json --output actions.json

# Include long-tail products (normally weekly only)
node scripts/daily-price-guard.js --demo --include-long-tail
```

## Product Prioritization

Products are prioritized for daily monitoring using a scoring system:

| Factor | Points | Threshold |
|--------|--------|-----------|
| High Traffic | 40 | 100+ views/day |
| High Revenue | 30 | $500+/day |
| Price Sensitive | 20 | Margin < 25% |
| Recent Sale | 10 | Within 24 hours |

**Priority levels:**
- `high` - Score 60+
- `medium` - Score 30-59
- `low` - Score < 30

### Long-Tail Products

Products with < 10 views/day are considered "long-tail" and are only checked weekly (Sundays by default) to reduce noise. Use `--include-long-tail` to force checking.

## Change Detection

### Cost Changes
Triggers when supplier cost changes by 2%+ from previous known value:
- **Cost increase**: Triggers `supplier_review` with high priority
- **Cost decrease**: Triggers `supplier_review` with medium priority (opportunity)

### Competitor Price Changes
Triggers when lowest competitor price changes by 5%+:
- **Competitor decrease**: May indicate need to lower price
- **Competitor increase**: Opportunity to raise price

### Staleness Detection
- **Stale pricing**: No competitor data in 7+ days
- **Very stale pricing**: No data in 14+ days
- **Stale cost**: Cost not updated in 30+ days

## Action Types

| Action | Description | Auto-Publish Eligible |
|--------|-------------|----------------------|
| `auto_publish` | Safe, small price changes | Yes |
| `pricing_review` | Price changes needing human review | No |
| `catalog_review` | Data quality issues | No |
| `supplier_review` | Cost-related issues | No |
| `suppress` | Consider pausing listing | No |

### Auto-Publish Criteria

A price change is auto-publish eligible when:
- Price change ≤ 5%
- Confidence ≥ 90%
- No review reasons flagged
- Above margin floor
- Not violating MAP

## Output Format

```json
{
  "run_date": "2026-03-11",
  "run_timestamp": "2026-03-11T12:00:00.000Z",
  "config": { ... },
  "summary": {
    "products_checked": 100,
    "products_skipped": 15,
    "cost_changes_detected": 3,
    "competitor_price_changes_detected": 5,
    "overpriced_detected": 2,
    "underpriced_detected": 1,
    "stale_pricing_detected": 8,
    "auto_publish_candidates": 4,
    "manual_review_count": 12
  },
  "actions": [
    {
      "product_id": "prod-123",
      "sku": "GLV-NIT-BLK-100",
      "title": "Black Nitrile Gloves, 100/Box",
      "action_type": "pricing_review",
      "recommended_change": "lower: $14.99 → $13.99",
      "reason": "Competitors dropped prices by 8%",
      "priority": "high",
      "details": { ... }
    }
  ]
}
```

## Configuration

All thresholds are configurable in `lib/dailyPriceGuard.js`:

```javascript
const GUARD_CONFIG = {
  high_traffic_threshold: 100,      // Views/day for "high traffic"
  high_revenue_threshold: 500,      // $/day for "high revenue"
  price_sensitive_margin: 0.25,     // Below 25% = price sensitive
  
  stale_pricing_days: 7,            // Days until pricing is stale
  very_stale_pricing_days: 14,      // Days until very stale
  stale_cost_days: 30,              // Days until cost is stale
  
  cost_change_threshold: 0.02,      // 2% cost change = significant
  competitor_change_threshold: 0.05, // 5% competitor change
  
  max_auto_publish_change: 0.05,    // Max 5% for auto-publish
  min_auto_publish_confidence: 0.90, // 90% confidence required
  
  long_tail_traffic_threshold: 10,  // Below = long-tail
  long_tail_check_day: 'sunday'     // When to check long-tail
};
```

## Integration

### Database Requirements

For full functionality, the Daily Price Guard expects:

1. **Products table** - Current product data with prices and costs
2. **Pricing history** - Previous costs to detect changes
3. **Competitor data** - Current and historical competitor prices
4. **Metrics** - Traffic, revenue, and conversion data

### Scheduled Runs

Recommended: Schedule via cron or task scheduler

```bash
# Daily at 6 AM
0 6 * * * cd /path/to/glovecubs && node scripts/daily-price-guard.js --from-db --output data/daily-actions.json
```

### Workflow Integration

1. **Morning**: Agent runs and generates action queue
2. **Auto-publish**: Safe changes can be applied automatically
3. **Review queue**: Pricing team reviews flagged items
4. **Supplier alerts**: Procurement reviews cost changes
5. **Catalog cleanup**: Data team addresses stale products

## Related Agents

- **Product Matching Agent** (`lib/productMatching.js`) - Deduplication
- **Competitive Pricing Agent** (`lib/competitivePricing.js`) - Price recommendations
- **Product Normalization Agent** (`lib/productNormalization.js`) - Data cleanup
