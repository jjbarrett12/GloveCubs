# Terminal State Uniqueness Fix - Deployment Runbook

**Migration:** `20260311000012_fix_terminal_state_uniqueness.sql`  
**Remediation Script:** `scripts/remediate-terminal-state-duplicates.sql`  
**Risk Level:** MEDIUM (data modification required before migration)

---

## Overview

This deployment fixes a schema bug where the `idx_rec_outcomes_unique_terminal` index only covered 3 of 5 terminal states, allowing duplicate terminal outcomes for the same recommendation.

| Terminal State | Was Covered | Now Covered |
|----------------|-------------|-------------|
| `accepted` | ✅ | ✅ |
| `rejected` | ✅ | ✅ |
| `expired` | ✅ | ✅ |
| `superseded` | ❌ | ✅ |
| `partially_realized` | ❌ | ✅ |

---

## Deployment Steps

### Step 1: Pre-Deployment Preflight

**Estimated Time:** 5 minutes  
**Risk:** None (read-only)

```bash
# Connect to production database
psql $DATABASE_URL

# Run preflight check (Step 1 of remediation script)
\i scripts/remediate-terminal-state-duplicates.sql
```

**Expected Output:**
```
 recommendations_with_duplicates | total_duplicate_outcome_rows | rows_to_archive
---------------------------------|------------------------------|----------------
                               0 |                            0 |               0
```

**Decision Point:**
- If `recommendations_with_duplicates = 0`: Skip to Step 4 (Apply Migration)
- If `recommendations_with_duplicates > 0`: Continue to Step 2

---

### Step 2: Review Remediation Plan

**Estimated Time:** 10-30 minutes (depends on duplicate count)  
**Risk:** None (read-only)

Review the detailed remediation plan output from Step 1. For each duplicate set, verify that the "KEEP" row is correct:

```
 recommendation_id | outcome_id | outcome_status | authority_rank | disposition
-------------------|------------|----------------|----------------|-------------
 abc-123           | row-001    | accepted       |              1 | >>> KEEP <<<
 abc-123           | row-002    | superseded     |              2 | ARCHIVE
```

**Authority Ranking (deterministic):**
1. `partially_realized` - Strongest (actual savings confirmed)
2. `accepted` - Operator explicitly accepted
3. `rejected` - Operator explicitly rejected
4. `expired` - System-generated terminal state
5. `superseded` - Weakest (replaced by newer)

**Tiebreaker:** Most recent `updated_at`, then `created_at`

**If override needed:** Document exceptions and adjust manually before Step 3.

---

### Step 3: Execute Remediation

**Estimated Time:** 5 minutes  
**Risk:** MEDIUM (modifies data, but fully reversible)

```sql
-- In psql, edit the remediation script to uncomment the DO block in Step 4
-- Then run:
\i scripts/remediate-terminal-state-duplicates.sql
```

**Or run the DO block directly:**
```sql
DO $$
DECLARE
  v_batch_id UUID := gen_random_uuid();
  -- ... (full block from remediation script Step 4)
END $$;
```

**Expected Output:**
```
NOTICE:  Starting remediation batch: a1b2c3d4-...
NOTICE:  Archived 15 duplicate rows to recommendation_outcomes_archive
NOTICE:  Removed 15 duplicate rows from recommendation_outcomes
NOTICE:  ============================================================
NOTICE:  REMEDIATION COMPLETE
NOTICE:  Batch ID: a1b2c3d4-...
NOTICE:  Rows archived: 15
NOTICE:  Rows removed from main table: 15
```

**⚠️ IMPORTANT:** Save the Batch ID for potential rollback.

---

### Step 4: Verify Remediation

**Estimated Time:** 2 minutes  
**Risk:** None (read-only)

```sql
-- Run Step 5 of remediation script
SELECT 
  'Remaining duplicates (should be 0)' AS check_name,
  COUNT(*) AS value
FROM (
  SELECT recommendation_id
  FROM catalogos.recommendation_outcomes
  WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
  GROUP BY recommendation_id
  HAVING COUNT(*) > 1
) x;
```

**Required Result:** `value = 0`

If not zero, investigate and re-run remediation for remaining duplicates.

---

### Step 5: Apply Migration

**Estimated Time:** 1 minute  
**Risk:** LOW (will fail safely if duplicates remain)

```bash
# Using Supabase CLI
npx supabase db push

# Or apply directly
psql $DATABASE_URL -f storefront/supabase/migrations/20260311000012_fix_terminal_state_uniqueness.sql
```

**Expected Output:**
```
DROP INDEX
CREATE INDEX
COMMENT
```

**If CREATE INDEX fails with duplicate key error:**
```
ERROR: could not create unique index "idx_rec_outcomes_unique_terminal"
DETAIL: Key (recommendation_id)=(xyz) is duplicated.
```

This means Step 3 remediation was incomplete. Return to Step 1.

---

### Step 6: Post-Migration Verification

**Estimated Time:** 2 minutes  
**Risk:** None (read-only)

```sql
-- Verify index definition
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'recommendation_outcomes'
  AND indexname = 'idx_rec_outcomes_unique_terminal';
```

**Expected:** Index definition includes all 5 terminal states:
```sql
WHERE (outcome_status = ANY (ARRAY['accepted'::text, 'rejected'::text, 
       'expired'::text, 'superseded'::text, 'partially_realized'::text]))
```

```sql
-- Verify archive table exists and contains remediated rows
SELECT 
  COUNT(*) AS archived_rows,
  COUNT(DISTINCT archive_batch_id) AS batches
FROM catalogos.recommendation_outcomes_archive;
```

---

## Rollback Procedure

### Rollback Migration Only (if index creation failed)

```sql
-- Restore original (incomplete) index
DROP INDEX IF EXISTS catalogos.idx_rec_outcomes_unique_terminal;
CREATE UNIQUE INDEX idx_rec_outcomes_unique_terminal 
  ON catalogos.recommendation_outcomes(recommendation_id) 
  WHERE outcome_status IN ('accepted', 'rejected', 'expired');
```

### Rollback Remediation (restore archived rows)

```sql
-- Replace YOUR-BATCH-ID-HERE with actual batch ID from Step 3
DO $$
DECLARE
  v_batch_id UUID := 'YOUR-BATCH-ID-HERE';
  v_restored_count INTEGER;
BEGIN
  INSERT INTO catalogos.recommendation_outcomes (
    id, recommendation_id, product_id, supplier_id, offer_id,
    outcome_status, decision_source, accepted, accepted_at, rejected_at,
    rejection_reason, selected_supplier_id, selected_offer_id, selected_price,
    recommended_price, recommended_rank, recommended_trust_score, recommended_reasoning,
    price_delta, trust_delta, estimated_savings, realized_savings, realized_savings_percent,
    savings_confidence, superseded_by_id, supersedes_id, notes, metadata,
    created_at, updated_at
  )
  SELECT 
    id, recommendation_id, product_id, supplier_id, offer_id,
    original_status,
    decision_source, accepted, accepted_at, rejected_at,
    rejection_reason, selected_supplier_id, selected_offer_id, selected_price,
    recommended_price, recommended_rank, recommended_trust_score, recommended_reasoning,
    price_delta, trust_delta, estimated_savings, realized_savings, realized_savings_percent,
    savings_confidence, superseded_by_id, supersedes_id, 
    COALESCE(notes || ' | ', '') || 'Restored from archive on ' || now()::date,
    metadata,
    created_at, updated_at
  FROM catalogos.recommendation_outcomes_archive
  WHERE archive_batch_id = v_batch_id;
  
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  RAISE NOTICE 'Restored % rows', v_restored_count;
END $$;
```

---

## Troubleshooting

### "Archive table does not exist"

Run the migration Phase 1 only to create the archive table:

```sql
CREATE TABLE IF NOT EXISTS catalogos.recommendation_outcomes_archive (
  -- ... (see migration file for full schema)
);
```

### "Duplicate key violates unique constraint" during restore

This means a row with the same ID already exists. The archived row was likely already restored or never deleted. Skip restore for this batch.

### "Mismatch: archived N but deleted M"

The transaction will automatically rollback. This indicates a concurrent modification. Wait for quiet period and retry.

---

## Files Reference

| File | Purpose |
|------|---------|
| `storefront/supabase/migrations/20260311000012_fix_terminal_state_uniqueness.sql` | Migration (creates archive table, fixes index) |
| `scripts/remediate-terminal-state-duplicates.sql` | Remediation workflow (preflight, review, execute, verify) |
| `docs/TERMINAL_STATE_UNIQUENESS_RUNBOOK.md` | This deployment runbook |

---

## Checklist

- [ ] Preflight check completed (Step 1)
- [ ] Duplicate count documented: _______
- [ ] Remediation plan reviewed (Step 2)
- [ ] Remediation executed (Step 3)
- [ ] Batch ID saved: _______________________
- [ ] Post-remediation verification passed (Step 4)
- [ ] Migration applied (Step 5)
- [ ] Post-migration verification passed (Step 6)
- [ ] Deployment documented in changelog
