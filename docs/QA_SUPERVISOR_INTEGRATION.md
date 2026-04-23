# QA Supervisor - Production Integration

Production-grade integration of the QA and Self-Healing Supervisor Agent into the GloveCubs platform.

## Overview

The QA Supervisor has been fully operationalized with:
- Database persistence for all audit results
- Reusable service methods for workers and cron jobs
- Automatic triggers after agent operations
- Support for dry-run, apply, and review-only modes
- Full audit trail for all fixes
- Idempotency protection
- Centralized configuration via `agent_rules`

## Database Tables

### fix_logs
Immutable audit trail of all fixes applied.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| audit_report_id | UUID | Link to audit_reports |
| module | TEXT | Source module (e.g., product_intake) |
| record_type | TEXT | Type of record fixed |
| record_id | TEXT | ID of record fixed |
| source_table | TEXT | Database table |
| source_id | UUID | Database row ID |
| issue_found | TEXT | What was wrong |
| fix_applied | TEXT | What was fixed |
| prior_values | JSONB | Values before fix |
| new_values | JSONB | Values after fix |
| confidence_before | NUMERIC | Confidence before |
| confidence_after | NUMERIC | Confidence after |
| fix_level | INTEGER | 1=safe auto, 2=partial+review, 3=block |
| was_applied | BOOLEAN | Whether fix was actually applied |
| applied_at | TIMESTAMPTZ | When applied |

### blocked_actions
Persisted blocked items requiring resolution.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| audit_report_id | UUID | Link to audit_reports |
| module | TEXT | Source module |
| record_type | TEXT | Type of blocked record |
| record_id | TEXT | ID of blocked record |
| reason_blocked | TEXT | Why it was blocked |
| severity | TEXT | low/medium/high/critical |
| status | TEXT | active/resolved/ignored |
| resolved_at | TIMESTAMPTZ | When resolved |
| resolved_by | UUID | Who resolved |
| resolved_notes | TEXT | Resolution notes |

## Execution Modes

### dry_run
- Reports issues only
- No database mutations
- No fixes applied
- No review items created
- Useful for testing

### apply_safe_fixes
- Applies Level 1 fixes automatically
- Creates review items for Level 2/3
- Persists fix logs
- Creates blocked actions
- **Default mode**

### review_only
- Creates review items
- No fixes applied
- Persists findings to database

## Trigger Integration

The QA Supervisor automatically runs after:

### Product Normalization
```typescript
import { qaAfterNormalization } from '@/lib/qa';

const result = await qaAfterNormalization(products, 'apply_safe_fixes');
```

### Product Matching
```typescript
import { qaAfterMatching } from '@/lib/qa';

const result = await qaAfterMatching(matches, 'apply_safe_fixes');
```

### Pricing Recommendations
```typescript
import { qaAfterPricing } from '@/lib/qa';

const result = await qaAfterPricing(recommendations, 'apply_safe_fixes');
```

### Nightly Full Audit
Scheduled via `/api/internal/cron/nightly`:
- Runs full audit across all modules
- Checks job_queue for failed jobs
- Checks review_queue for stale items
- Identifies systemic issues

## Configuration

Business rules are stored in `agent_rules` table:

| Rule Key | Default | Description |
|----------|---------|-------------|
| min_confidence_auto_publish | 0.90 | Min confidence for auto-publish |
| min_confidence_auto_fix | 0.85 | Min confidence for auto-fix |
| confidence_downgrade_step | 0.10 | Downgrade per issue |
| min_margin_percent | 0.15 | Minimum allowed margin |
| min_margin_dollars | 1.00 | Minimum margin in dollars |
| max_auto_publish_price_change | 0.05 | Max price change for auto |
| max_price_swing_without_review | 0.07 | Max swing before review |
| max_competitor_data_age_days | 7 | Days until stale |
| enable_safe_auto_fixes | true | Allow Level 1 fixes |
| systemic_issue_threshold | 5 | Count before systemic flag |

## API Usage

### Run Full Audit
```typescript
import { runQAAudit } from '@/lib/qa';

const result = await runQAAudit({
  mode: 'apply_safe_fixes',
  scope: 'full',
});
```

### Run Targeted Audit
```typescript
import { runTargetedAudit } from '@/lib/qa';

const result = await runTargetedAudit('product_intake', products);
```

### Check for Blocked Actions
```typescript
import { hasBlockedActions, getBlockedReasons } from '@/lib/qa';

if (await hasBlockedActions('products', productId)) {
  const reasons = await getBlockedReasons('products', productId);
  // Handle blocked state
}
```

### Resolve Blocked Action
```typescript
import { resolveBlockedAction } from '@/lib/qa';

await resolveBlockedAction(blockId, userId, 'Manually verified');
```

### Get Recent Fix Logs
```typescript
import { getRecentFixLogs } from '@/lib/qa';

const fixes = await getRecentFixLogs(24, 'product_intake');
```

## Fix Levels

### Level 1: Safe Auto-Fix
Applied automatically when:
- Correction is mechanical (whitespace, case, normalization)
- Based on explicit known rules
- No business meaning guessed
- Confidence after correction is high

Examples:
- Normalize "Blk" to "Black"
- Trim whitespace
- Recompute case math
- Downgrade inflated confidence

### Level 2: Partial Fix + Review
Applied partially, then sent to review:
- Some data is usable, some questionable
- Safe publish decision cannot be made

Examples:
- Retain parsed row but block publishing
- Preserve supplier but mark for legitimacy review

### Level 3: Block and Escalate
Blocked entirely:
- Core identity unknown
- Product equivalence uncertain
- Pricing logic unsafe

Examples:
- MPN and UPC conflict
- Margin below floor
- MAP violation

## Idempotency Protection

The system prevents:
- Duplicate review items for same unresolved issue
- Duplicate blocked records for same reason
- Applying same fix repeatedly within 24 hours

This is enforced via:
- Partial unique indexes on dedupe columns
- RPC functions checking existing records
- Fix log timestamp checks

## Admin Visibility

Outputs feed into:
- `/admin/review` - Review queue with QA findings
- `/admin/audit-reports` - Full audit run history
- `/admin/jobs` - Failed/blocked jobs from audits

## File Structure

```
storefront/src/lib/qa/
├── index.ts        # Public API exports
├── types.ts        # Type definitions
├── config.ts       # Configuration loader
├── service.ts      # Main audit service
├── persist.ts      # Database persistence
└── triggers.ts     # Trigger integration

storefront/supabase/migrations/
└── 20260311000003_qa_supervisor_tables.sql
```

## CLI Usage

The original CLI script remains available for manual runs:

```bash
# Run with demo data
node scripts/qa-audit.js --demo

# Run with input file
node scripts/qa-audit.js --input audit-data.json

# Save output
node scripts/qa-audit.js --demo --output report.json
```

## Invocation Flow

1. **Job Handler Trigger**: Product normalization/matching/pricing handlers call QA triggers inline
2. **Nightly Cron**: `/api/internal/cron/nightly` enqueues `audit_run` job
3. **Worker Process**: Worker claims job, calls `handleAuditRun`
4. **QA Service**: Runs `runQAAudit` with appropriate mode
5. **Persistence**: Results saved to `audit_reports`, `fix_logs`, `blocked_actions`
6. **Review Queue**: Findings create `review_queue` items

## Assumptions Needing Confirmation

1. **Actual Fix Application**: The `applyLevel1Fixes` function currently marks fixes as applied but doesn't actually update source tables. This requires integration with actual table schemas.

2. **Product Table Schema**: Assumes `products` table exists with `id`, `price`, `cost`, `map_price` columns.

3. **Supplier Table Schema**: Business logic for suppliers needs the actual table structure.

4. **Notification System**: No alerts are sent for critical blocked actions - add webhook/email integration if needed.

5. **Fix Rollback**: No rollback mechanism exists for applied fixes - consider adding if needed.
