# QA and Self-Healing Supervisor Agent

The QA Supervisor audits all agent outputs, applies safe auto-fixes, and ensures nothing questionable goes live without review.

## Core Principles

1. **Accuracy > Speed** - Never rush a fix
2. **Conservative > Aggressive** - Don't guess
3. **Review > False Certainty** - When in doubt, escalate
4. **Audit Trail** - Every fix is logged

## What Gets Audited

### Supplier Discovery
- Duplicate suppliers
- Fake or low-trust suppliers
- Retailers labeled as wholesalers
- Missing contact information
- Weak trust scoring

### Product Intake
- Missing required fields
- Case math errors
- Suspicious thickness values
- Title/attribute inconsistency
- Inflated confidence scores

### Product Matching
- False exact matches
- Variants incorrectly merged
- Critical field conflicts
- Overconfident match scores

### Competitive Pricing
- Margin floor violations
- MAP violations
- Non-comparable offers
- Unknown shipping
- Large price swings

### Daily Price Guard
- Duplicate actions
- Unsafe auto-publish items
- Missing action reasons

## Fix Strategy

### Level 1: Safe Auto-Fix
Applied automatically when correction is:
- Mechanical (whitespace, capitalization)
- Rule-based (normalize "blk" → "black")
- Mathematically certain (fix case math)
- No business meaning guessed

Examples:
```
✓ Normalize "nitril" → "nitrile"
✓ Fix 100 × 10 ≠ 1200 → 1000
✓ Trim whitespace from names
✓ Downgrade inflated confidence
✓ Set review_required=true
```

### Level 2: Partial Fix + Review
When some data is usable but questionable:
- Retain record but block publishing
- Apply what's safe, flag the rest
- Preserve for human decision

### Level 3: Block and Escalate
When core data is unsafe:
- Block action entirely
- Escalate to review queue
- Log reason clearly

## Usage

```bash
# Run with demo data
node scripts/qa-audit.js --demo

# Audit from file
node scripts/qa-audit.js --input audit-data.json

# Save results
node scripts/qa-audit.js --demo --output report.json

# Show configuration
node scripts/qa-audit.js --config
```

## Output Format

```json
{
  "run_type": "audit_and_fix",
  "run_timestamp": "2026-03-11T12:00:00.000Z",
  "summary": {
    "records_audited": 15,
    "issues_found": 16,
    "safe_auto_fixes_applied": 11,
    "items_sent_to_review": 7,
    "items_blocked": 1,
    "systemic_issues_found": 0
  },
  "module_results": [...],
  "fixes": [...],
  "review_queue": [...],
  "blocked_actions": [...],
  "systemic_issues": [...],
  "self_audit": {
    "passed": true,
    "guessed_anywhere": false,
    "allowed_unsafe_automation": false
  },
  "next_steps": [...]
}
```

## Cross-Checks Performed

| Check | What It Does |
|-------|-------------|
| Field Consistency | Title matches attributes |
| Math Check | Case quantities compute correctly |
| Duplicate Check | Find dupes across all modules |
| Confidence Check | Downgrade when evidence is weak |
| Auto-Publish Safety | Block unsafe automation |

## Confidence Thresholds

| Threshold | Value | Usage |
|-----------|-------|-------|
| Auto-publish | 90% | Minimum for automated changes |
| Auto-fix | 85% | Minimum for safe corrections |
| Downgrade step | 10% | How much to reduce inflated scores |

## Margin Protection

| Rule | Value |
|------|-------|
| Minimum margin % | 15% |
| Minimum margin $ | $1.00 |
| Max auto-publish swing | 5% |
| Max swing without review | 7% |

## Systemic Issue Detection

When patterns repeat (5+ occurrences), the supervisor flags systemic issues:

```
Issue: Recurring confidence_inflation issue (8 occurrences)
Impact: Degraded data quality across multiple records
Fix: Review confidence scoring algorithm - thresholds may be too loose
```

## Self-Audit

After every run, the supervisor audits itself:

1. Did I guess anywhere?
2. Did I allow unsafe automation?
3. Did I miss confidence downgrades?
4. Did I overlook duplicate risk?
5. Did I miss systemic patterns?

```
🔒 SELF-AUDIT
Passed: ✅ Yes
Guessed anywhere: ✅ No
Allowed unsafe automation: ✅ No
```

## Hard Rules

The supervisor NEVER:
- Fabricates supplier facts
- Fabricates product attributes
- Assumes products are identical when pack/size/grade unclear
- Recommends pricing below margin floor
- Ignores MAP
- Treats missing shipping as zero
- Auto-publishes on weak evidence

## Integration

```javascript
const { runFullAudit } = require('./lib/qaSupervisor');

const data = {
  suppliers: [...],
  products: [...],
  matches: [...],
  pricing: [...],
  actions: [...]
};

const result = runFullAudit(data);

// Check blocked items
if (result.summary.items_blocked > 0) {
  console.log('CRITICAL: Items blocked');
}

// Get high-priority reviews
const urgent = result.review_queue.filter(r => r.priority === 'high');
```

## Demo Results

```
SUMMARY
Records Audited:        15
Issues Found:           16
Auto-Fixes Applied:     11
Sent to Review:         7
Blocked:                1

BLOCKED:
🛑 prod-002: Margin 7% below floor 15%

AUTO-FIXES APPLIED:
✓ Fixed case math: 1200 → 1000
✓ Normalized color: blk → black
✓ Normalized material: nitril → nitrile
✓ Downgraded inflated confidence
✓ Blocked unsafe auto-publish

REVIEW QUEUE:
🔴 sup-002: Retailer classified as wholesaler
🟡 prod-002: Missing brand
🟡 Match confidence 72% - verify manually
```

## Related Agents

- [Catalog Orchestrator](./CATALOG_ORCHESTRATOR.md) - Routes work
- [Admin Review Assistant](./ADMIN_REVIEW_ASSISTANT.md) - Explains flagged items
- [Daily Price Guard](./DAILY_PRICE_GUARD.md) - Daily monitoring
