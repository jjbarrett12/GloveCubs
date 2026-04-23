# Catalog Intelligence Orchestrator

The Catalog Intelligence Orchestrator coordinates all specialized agents, routes work correctly, and ensures data quality by preventing questionable data from going live without human review.

## Overview

The orchestrator does not do all work itself. It coordinates:

| Agent | Purpose |
|-------|---------|
| **Supplier Discovery** | Find and validate new suppliers |
| **Product Intake** | Normalize raw product data |
| **Product Matching** | Match products to canonical catalog |
| **Competitive Pricing** | Analyze competitor prices |
| **Daily Price Guard** | Daily monitoring and action queues |

## System Goals

1. **Expand supplier base** - Find reliable new sources
2. **Increase catalog depth** - Add quality products
3. **Maintain clean catalog** - No duplicates or bad data
4. **Keep pricing competitive** - While preserving margin
5. **Reduce manual work** - Automate what's safe
6. **Prevent bad decisions** - Escalate questionable items

## Usage

```bash
# Show status and queue stats
node scripts/orchestrator.js status

# Run daily morning cycle
node scripts/orchestrator.js morning-cycle --demo

# Process raw product intake
node scripts/orchestrator.js intake --file raw-products.json

# Show items pending human review
node scripts/orchestrator.js review-queue

# Show auto-publishable actions
node scripts/orchestrator.js next-actions

# List available agents
node scripts/orchestrator.js agents

# List escalation rules
node scripts/orchestrator.js rules
```

## Routing Rules

Work items are automatically routed based on type:

| Trigger | Agent |
|---------|-------|
| `new_company`, `supplier_search` | Supplier Discovery |
| `new_file`, `new_feed`, `catalog_upload` | Product Intake |
| `new_product`, `dedupe_request` | Product Matching |
| `price_event`, `competitor_update` | Competitive Pricing |
| `scheduled_daily`, `morning_review` | Daily Price Guard |

## Escalation Rules

The orchestrator enforces strict quality gates:

| Rule | Threshold | Queue | Reason |
|------|-----------|-------|--------|
| `low_confidence_parse` | < 85% | `intake_review` | Parsed product confidence below threshold |
| `ambiguous_match` | < 75% | `matching_review` | Product match is ambiguous |
| `major_price_swing` | > 7% | `pricing_review` | Price change exceeds safe threshold |
| `thin_margin` | < 15% | `pricing_review` | Margin below minimum |
| `map_conflict` | - | `legal_review` | Potential MAP pricing violation |
| `supplier_concern` | - | `supplier_review` | Supplier legitimacy concern |
| `duplicate_suspected` | - | `catalog_review` | Suspected duplicate product |

## Work Queues

### Processing Queues
- `supplier_discovery` - New supplier evaluation
- `product_intake` - Raw data normalization
- `product_matching` - Catalog matching
- `competitive_pricing` - Price analysis
- `daily_actions` - Auto-publishable changes

### Review Queues (Require Human Action)
- `intake_review` - Low-confidence parsed products
- `matching_review` - Ambiguous product matches
- `pricing_review` - Major price changes, thin margins
- `catalog_review` - Suspected duplicates
- `supplier_review` - Supplier cost changes, concerns
- `legal_review` - MAP conflicts

## Output Format

```json
{
  "status": {
    "session_started": "2026-03-11T12:00:00.000Z",
    "agents_loaded": ["product_intake", "product_matching", "competitive_pricing", "daily_price_guard"],
    "queues": { ... },
    "summary": {
      "total_events": 15,
      "completed": 10,
      "escalated": 3,
      "blocked": 0,
      "pending_review": 3
    }
  },
  "next_actions": [
    {
      "type": "auto_publish",
      "ready": true,
      "sku": "GLV-001",
      "recommended_change": "keep: $14.99"
    }
  ],
  "review_items": [
    {
      "queue": "pricing_review",
      "id": "pricing_review-12345",
      "reason": "Price change exceeds safe threshold",
      "priority": "high",
      "data": { ... }
    }
  ],
  "blocked": []
}
```

## Morning Cycle

The typical daily workflow:

```bash
# 1. Run morning cycle
node scripts/orchestrator.js morning-cycle --from-db --output data/morning-report.json

# 2. Review auto-publish candidates
node scripts/orchestrator.js next-actions

# 3. Check review queue
node scripts/orchestrator.js review-queue

# 4. Human reviews items in review queues
# 5. Approved changes are published
```

## Integration

### Programmatic Usage

```javascript
const { CatalogOrchestrator } = require('./lib/catalogOrchestrator');

const orchestrator = new CatalogOrchestrator({ verbose: true });

// Route work
orchestrator.route({
  type: 'raw_data',
  data: rawProduct,
  source: 'supplier_feed'
});

// Run morning cycle
const results = await orchestrator.runMorningCycle(products);

// Get status
const status = orchestrator.getStatus();

// Get review items
const reviews = orchestrator.getReviewQueue();

// Get auto-publishable actions
const actions = orchestrator.getNextActions();
```

### Database Integration

In production, the orchestrator would:
1. Load products from Supabase `products` table
2. Load pricing history from `pricing_history` table
3. Load competitor data from `competitor_prices` table
4. Write results back to action queues

## Core Principles

1. **Never optimize for speed over correctness**
2. **Never auto-publish questionable data**
3. **Escalate when confidence is low**
4. **Preserve a clean canonical catalog**
5. **Log all decisions for audit**

## Related Documentation

- [Daily Price Guard](./DAILY_PRICE_GUARD.md)
- [Product Normalization](./PRODUCT_NORMALIZATION.md)
- [Product Matching](./PRODUCT_MATCHING.md)
- [Competitive Pricing](./COMPETITIVE_PRICING.md)
