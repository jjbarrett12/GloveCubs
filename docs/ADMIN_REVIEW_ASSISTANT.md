# Admin Review Assistant

The Admin Review Assistant helps administrators quickly clear the review queue by explaining exactly what each flagged item needs and why.

## Overview

For every flagged record, the assistant provides:
- **What the issue is** - Clear problem statement
- **Why it matters** - Business impact
- **What likely caused it** - Root cause analysis
- **Recommended action** - Direct guidance
- **Verification checklist** - Steps before approval

## Usage

```bash
# Run with demo data
node scripts/admin-review.js --demo

# Load from file
node scripts/admin-review.js --file review-items.json

# Compact summary view
node scripts/admin-review.js --demo --compact

# Save analysis
node scripts/admin-review.js --demo --output analysis.json
```

## Issue Categories

### Supplier Issues

| Issue | Severity | Action |
|-------|----------|--------|
| Supplier legitimacy | High | HOLD - Verify before onboarding |
| Cost increase | High | REVIEW PRICING - Check margins |
| Cost decrease | Low | APPROVE - Update cost, opportunity |
| Stale cost data | Medium | REQUEST UPDATE from supplier |
| Missing MOQ | Medium | HOLD - Get MOQ before listing |

### Catalog Issues

| Issue | Severity | Action |
|-------|----------|--------|
| Duplicate product | High | MERGE or DELETE duplicates |
| Near-duplicate | Medium | INVESTIGATE - variant or dupe? |
| Conflicting attributes | High | VERIFY SOURCE - check spec sheet |
| Missing case pack | Medium | HOLD - add pack qty first |
| Low confidence parse | Medium | MANUAL REVIEW - verify fields |
| Ambiguous match | Medium | MANUAL MATCH - admin decides |

### Pricing Issues

| Issue | Severity | Action |
|-------|----------|--------|
| MAP conflict | Critical | BLOCK - do not violate MAP |
| Major price swing | High | REVIEW CAREFULLY - verify data |
| Low margin risk | High | REJECT - raise floor or drop |
| Suspicious competitor | Medium | IGNORE OFFER - verify manually |
| Stale pricing data | Medium | REFRESH DATA before deciding |
| Underpriced | Medium | RAISE PRICE - capture margin |

## Output Format

### Full Report

```
══════════════════════════════════════════════════════════════════════
     ADMIN REVIEW QUEUE
══════════════════════════════════════════════════════════════════════

Total Items: 9
Critical: 1 | High: 3 | Medium: 4 | Low: 1

----------------------------------------------------------------------
🔴 [CRITICAL] Pricing
   SKU: GLV-MED-EXAM-100
   MediGrade Blue Nitrile Exam Gloves, 100/Box

   ISSUE: Potential MAP (Minimum Advertised Price) violation

   WHY IT MATTERS:
   MAP violations can result in losing supplier authorization...

   LIKELY CAUSE:
   Recommended price is below manufacturer MAP floor.

   RECOMMENDED ACTION:
   → BLOCK - Do not publish below MAP

   VERIFY BEFORE APPROVAL:
   ☐ Confirm MAP price with manufacturer
   ☐ Ensure published price meets or exceeds MAP
   ☐ If MAP changed, update system
   ☐ If intentional violation, escalate to legal/leadership
```

### Compact Report

```
REVIEW QUEUE SUMMARY
══════════════════════════════════════════════════
Total: 9 | 🔴 1 | 🟠 3 | 🟡 4 | 🟢 1

🔴 GLV-MED-EXAM-100: MAP violation
   → BLOCK - Do not publish below MAP

🟠 GLV-VIN-CLR-100: Supplier cost increased 9.5%
   → ACKNOWLEDGE - Update cost, consider price adjustment
```

## Severity Levels

| Level | Icon | Meaning |
|-------|------|---------|
| Critical | 🔴 | Legal/compliance risk - block immediately |
| High | 🟠 | Significant business impact - same-day action |
| Medium | 🟡 | Should address soon - within 2-3 days |
| Low | 🟢 | Opportunity or minor issue - weekly review |

## Recommended Actions

| Action | Meaning |
|--------|---------|
| BLOCK | Do not publish. Hard stop. |
| HOLD | Do not proceed until resolved |
| REJECT | Decline the change |
| MERGE | Combine duplicate records |
| DELETE | Remove from catalog |
| INVESTIGATE | Gather more information |
| MANUAL REVIEW | Human must verify all fields |
| REFRESH DATA | Get current data before deciding |
| APPROVE | Safe to proceed |
| ACKNOWLEDGE | Accept and update system |

## Integration

### Programmatic Usage

```javascript
const { processReviewQueue, generateReviewReport } = require('./lib/adminReviewAssistant');

const items = [/* review items from orchestrator */];
const results = processReviewQueue(items);
const report = generateReviewReport(results);

console.log(report);

// Access structured data
console.log(results.by_severity);   // { critical: 1, high: 3, ... }
console.log(results.by_category);   // { Supplier: 2, Catalog: 3, ... }
console.log(results.items);         // Analyzed items with recommendations
```

### Orchestrator Integration

```javascript
const { CatalogOrchestrator } = require('./lib/catalogOrchestrator');
const { processReviewQueue } = require('./lib/adminReviewAssistant');

const orchestrator = new CatalogOrchestrator();
const reviewItems = orchestrator.getReviewQueue();
const analysis = processReviewQueue(reviewItems);
```

## Workflow

1. **Morning**: Review queue populated by Daily Price Guard
2. **Admin opens queue**: Sees prioritized list with explanations
3. **Critical first**: Handle MAP/legal issues immediately
4. **High priority**: Address cost changes, duplicates, margin issues
5. **Medium priority**: Handle data quality issues
6. **Low priority**: Process opportunities (cost decreases)
7. **Clear queue**: Approve, reject, or escalate each item

## Best Practices

1. **Critical items first** - Don't let legal issues sit
2. **Use verification checklists** - Don't skip steps
3. **When uncertain, investigate** - Ask questions before approving
4. **Document decisions** - Note why you approved/rejected
5. **Escalate appropriately** - Some items need leadership review
