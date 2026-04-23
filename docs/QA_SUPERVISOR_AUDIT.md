# QA Supervisor Implementation Audit

## Honest Assessment

### What Actually Works

| Component | Status | Details |
|-----------|--------|---------|
| Issue Detection | ✅ Works | Detects supplier legitimacy, product quality, match conflicts, pricing issues |
| Audit Logging | ✅ Works | Persists to `audit_reports` table |
| Fix Logging | ✅ Works | Persists to `fix_logs` table with idempotency |
| Blocked Action Logging | ✅ Works | Persists to `blocked_actions` table with idempotency |
| Review Queue Creation | ✅ Works | Creates items via `createReviewItem` with deduplication |
| Input Validation | ✅ Works | Validates audit input before processing |
| Dedupe Keys | ✅ Works | Stable keys for fixes, reviews, blocked actions |
| Execution Modes | ⚠️ Partial | Modes exist but see limitations below |
| Job Integration | ✅ Works | Callable from `audit_run` jobs |
| Trigger Integration | ⚠️ Partial | `qaAfterNormalization` and `qaAfterPricing` wired |

### What Does NOT Work

| Feature | Status | Reality |
|---------|--------|---------|
| Source Table Updates | ❌ NOT IMPLEMENTED | `was_applied=true` only means "logged", NOT "applied to source" |
| Actual Self-Healing | ❌ NOT IMPLEMENTED | No code writes corrections to `suppliers`, `products`, etc. |
| CLI Persistence | ❌ NOT AVAILABLE | CLI is advisory-only, no database writes |

---

## The Big Lie: `was_applied`

The `was_applied` field on fixes is misleading:

```typescript
// This does NOT write to source tables
fix.was_applied = true;
fix.audit_note += ' [LOGGED - source table NOT updated]';
```

**What it really means:**
- `was_applied=true` → The fix was LOGGED to `fix_logs` table
- `was_applied=true` → The source record (`suppliers`, `products`, etc.) was **NOT** updated

**What would need to be implemented:**

```typescript
// To actually apply fixes, you'd need:
async function applySupplierFixes(fixes: QAFix[]): Promise<void> {
  for (const fix of fixes) {
    await supabase
      .from('suppliers')
      .update(fix.new_values)
      .eq('id', fix.source_id);
  }
}
```

---

## Execution Modes

| Mode | What It Claims | What It Does |
|------|----------------|--------------|
| `dry_run` | Report only, no mutations | ✅ Correct - no persistence at all |
| `apply_safe_fixes` | Apply Level 1 fixes | ⚠️ Only LOGS fixes, doesn't apply them |
| `review_only` | Create review items only | ✅ Correct - creates review queue items |

---

## Current Classification

**This implementation is: ADVISORY + LOGGING**

It:
- ✅ Detects issues
- ✅ Logs what WOULD be fixed
- ✅ Creates review queue items
- ✅ Blocks unsafe actions (records them)
- ❌ Does NOT actually fix source records

---

## What Would Make It Self-Healing

To be a true "self-healing" system, you would need to:

### 1. Implement Table-Specific Update Functions

```typescript
// lib/qa/apply.ts
export async function applySupplierFixes(fixes: QAFix[]): Promise<ApplyResult> {
  for (const fix of fixes.filter(f => f.record_type === 'supplier')) {
    const { error } = await supabase
      .from('suppliers')
      .update(fix.new_values)
      .eq('id', fix.source_id);
    
    if (!error) {
      // Mark as truly applied
      await supabase
        .from('fix_logs')
        .update({ was_applied: true, applied_at: new Date().toISOString() })
        .eq('id', fixLogId);
    }
  }
}
```

### 2. Add Fix Application to Service

```typescript
// In service.ts
if (input.mode === 'apply_safe_fixes' && config.enable_safe_auto_fixes) {
  // First log the fixes
  await persistFixLogs(result.fixes, auditReportId);
  
  // Then actually apply them
  await applySupplierFixes(result.fixes);
  await applyProductFixes(result.fixes);
  await applyMatchFixes(result.fixes);
  await applyPricingFixes(result.fixes);
}
```

### 3. Add Rollback Mechanism

```typescript
export async function rollbackFix(fixLogId: string): Promise<boolean> {
  const { data: fix } = await supabase
    .from('fix_logs')
    .select('*')
    .eq('id', fixLogId)
    .single();
  
  if (!fix) return false;
  
  // Restore prior values
  await supabase
    .from(fix.source_table)
    .update(fix.prior_values)
    .eq('id', fix.source_id);
  
  return true;
}
```

---

## Files Changed in This Audit

| File | Change |
|------|--------|
| `storefront/src/lib/qa/validate.ts` | **NEW** - Input validation + dedupe key generators |
| `storefront/src/lib/qa/service.ts` | Added validation, honest comments about `was_applied` |
| `storefront/src/lib/qa/persist.ts` | Added dedupe key support in `persistFixLogs` |
| `storefront/src/lib/qa/types.ts` | Added `dedupe_key` to `QAFix`, `QAReviewItem`, `QABlockedAction` |
| `storefront/src/lib/qa/index.ts` | Exported validation functions, added honest header comment |
| `scripts/qa-audit.js` | Removed fake `--from-orchestrator` option, clarified advisory-only |

---

## CLI vs Service Comparison

| Capability | CLI (`scripts/qa-audit.js`) | Service (`lib/qa/service.ts`) |
|------------|----------------------------|-------------------------------|
| Detect issues | ✅ | ✅ |
| Print report | ✅ | ✅ (returns result) |
| Persist audit_reports | ❌ | ✅ |
| Persist fix_logs | ❌ | ✅ |
| Persist blocked_actions | ❌ | ✅ |
| Create review_queue items | ❌ | ✅ |
| Apply fixes to source tables | ❌ | ❌ (not implemented) |
| Input validation | ❌ | ✅ |
| Idempotency checks | ❌ | ✅ |
| Dedupe keys | ❌ | ✅ |

---

## Recommendations

1. **Keep the current implementation** as an audit + logging system
2. **Do not claim** it applies fixes until table-specific update functions are implemented
3. **Use review queue** for human verification before any source table updates
4. **Implement actual fixes** only for the safest Level 1 normalizations (whitespace, color/material maps)
5. **Add rollback capability** before enabling any automated source table updates

---

## Summary

**The QA Supervisor is currently:**
- ✅ A working audit/detection system
- ✅ A logging/traceability system  
- ✅ A review queue generator
- ❌ NOT a self-healing system that applies fixes

**Honest status: ADVISORY + LOGGING, not SELF-HEALING**
