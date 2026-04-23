# Audit Run Job Handler

## Overview

The `handleAuditRun` function is the job handler that executes the QA Supervisor across domain and operational modules.

## What Actually Gets Audited

### Domain Modules (Business QA)

These modules audit actual business data loaded from the database:

| Module | What It Audits | Data Source |
|--------|---------------|-------------|
| `supplier_discovery` | Supplier legitimacy, duplicates, classification | `suppliers`, `supplier_discovery_queue` |
| `product_intake` | Product normalization, field quality, case math | `supplier_products`, `canonical_products` |
| `product_matching` | Match confidence, false matches, conflicts | `product_matches` |
| `competitive_pricing` | Margin floors, MAP violations, price swings | `pricing_recommendations`, `competitor_offers` |
| `daily_price_guard` | Action queue quality, duplicates | `daily_actions`, `action_queue` |

### Operational Modules (System Health)

These modules audit system operational health:

| Module | What It Checks |
|--------|---------------|
| `ops_job_health` | Job queue failure rates, blocked jobs |
| `ops_review_backlog` | Review queue staleness, duplicate patterns |

## Execution Modes

### `dry_run`
- No mutations of any kind
- No fix_logs created
- No review items persisted
- Results are preview only
- Use for: Testing, understanding what would happen

### `review_only`
- Review items are created
- No fix_logs created
- Source tables not modified
- Use for: Creating human review queue without auto-fixes

### `apply_safe_fixes`
- Level 1 fixes are logged to `fix_logs` table
- Review items are created
- **NOTE: Source tables are NOT updated**
- Use for: Production audit with fix tracking

## Data Loading

The handler uses `loadAuditData()` from `lib/qa/loader.ts` to:

1. Check if data was provided directly in the payload (targeted audits)
2. If not, load from database tables based on modules being audited
3. Apply `since` filter to only audit recent records

```typescript
// Example: Load products modified in last 24 hours
const data = await loadAuditData(input, ['product_intake']);
// Returns: { suppliers: [], products: [...], matches: [], pricing: [], actions: [] }
```

## Review Item Handling

Review items are persisted in two ways:

1. **Inside QA Service**: `persistAuditResult()` calls `persistReviewItems()`
2. **In Handler**: Explicit `createReviewItem()` calls with deduplication

This ensures review items are created even if one mechanism fails.

## Fix Metrics - Honest Accounting

| Metric | What It Means |
|--------|--------------|
| `fixes_logged_to_fix_logs` | Fixes recorded in `fix_logs` table |
| `suggested_fixes_not_applied` | Fixes identified but not logged (dry_run/review_only) |
| `skipped_fixes` | Fixes that couldn't be applied (Level 2/3, conflicts) |

**CRITICAL**: `fixes_logged_to_fix_logs` does NOT mean source tables were updated. To actually apply fixes, implement table-specific update functions.

## Self-Audit Checks

The audit performs self-validation:

| Check | What It Detects |
|-------|----------------|
| `guessed_anywhere` | Fixes based on assumptions rather than data |
| `unsafe_automation` | Level 2/3 fixes incorrectly marked as applied |
| `missed_confidence_downgrade` | Match issues without confidence adjustments |
| `missed_duplicate_risk` | Records with multiple issues (possible audit duplication) |
| `missed_systemic_pattern` | Repeated issue categories not flagged as systemic |

## Configuration Rules Applied

The audit applies rules from `agent_rules` table:

| Rule | Effect |
|------|--------|
| `min_margin_percent` | Blocks pricing below margin floor |
| `block_on_map_risk` | Blocks prices below MAP |
| `max_price_swing_without_review` | Requires review for large price changes |
| `min_confidence_auto_publish` | Blocks low-confidence auto-publish |
| `enable_safe_auto_fixes` | Master toggle for auto-fix logging |

## Output Structure

```typescript
{
  report_id: string,           // Audit report ID in database
  run_id: string,              // Unique run identifier
  mode: 'dry_run' | 'apply_safe_fixes' | 'review_only',
  scope: 'full' | 'targeted',
  
  summary: {
    records_audited: number,
    issues_found: number,
    fixes_logged_to_fix_logs: number,    // NOT source table updates
    suggested_fixes_not_applied: number,
    skipped_fixes: number,
    review_items_created: number,
    items_blocked: number,
    systemic_issues: number,
  },
  
  domain_audits: [...],        // Results per domain module
  ops_health: [...],           // Results per ops module
  systemic_issues: [...],      // Cross-cutting issues
  next_steps: [...],           // Recommended actions
  self_audit: {...},           // Self-validation results
  persisted: {...},            // What was persisted
  mode_notes: [...],           // Explanation of mode behavior
}
```

## Remaining Gaps

| Gap | Status | Required To Fix |
|-----|--------|-----------------|
| Source table updates | NOT IMPLEMENTED | Implement `applySupplierFixes()`, `applyProductFixes()`, etc. |
| Rollback mechanism | NOT IMPLEMENTED | Track applied changes with rollback capability |
| Real-time blocking | NOT IMPLEMENTED | Block actions before they happen, not just audit after |

## Usage

### Nightly Full Audit (via cron)
```typescript
await enqueueJob({
  job_type: 'audit_run',
  payload: { full_audit: true },
});
```

### Targeted Audit (after product normalization)
```typescript
await enqueueJob({
  job_type: 'audit_run',
  payload: { 
    modules: ['product_intake'],
    since: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // Last hour
  },
});
```

### Dry Run Preview
```typescript
await enqueueJob({
  job_type: 'audit_run',
  payload: { 
    full_audit: true,
    dry_run: true,
  },
});
```
