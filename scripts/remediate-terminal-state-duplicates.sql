-- ============================================================================
-- Terminal State Duplicate Remediation Workflow
-- ============================================================================
-- File: scripts/remediate-terminal-state-duplicates.sql
--
-- This script provides a DETERMINISTIC, AUDITABLE remediation workflow for
-- duplicate terminal-state outcomes in recommendation_outcomes.
--
-- SAFETY GUARANTEES:
-- - NO rows are deleted - duplicates are archived to recommendation_outcomes_archive
-- - Full audit trail preserved (original_status, archive_reason, batch_id)
-- - Deterministic ranking ensures reproducible results
-- - Manual review step before any data modification
--
-- ============================================================================
-- TERMINAL STATE AUTHORITY RANKING
-- ============================================================================
--
-- When multiple terminal outcomes exist for the same recommendation_id,
-- we determine the "winner" using this deterministic priority:
--
-- Rank | Status             | Rationale
-- -----|--------------------|-------------------------------------------------
--  1   | partially_realized | Strongest signal: actual savings confirmed
--  2   | accepted           | Operator explicitly accepted recommendation
--  3   | rejected           | Operator explicitly rejected recommendation
--  4   | expired            | System-generated terminal state (time-based)
--  5   | superseded         | Replaced by newer recommendation (weakest)
--
-- Tiebreaker within same status: most recent updated_at, then created_at
--
-- ============================================================================


-- ############################################################################
-- STEP 1: PREFLIGHT CHECK - Run this FIRST
-- ############################################################################
-- Purpose: Identify all duplicates and get summary statistics
-- Action: READ-ONLY - no data changes

\echo '============================================================'
\echo 'STEP 1: PREFLIGHT CHECK - Identifying Duplicate Terminal States'
\echo '============================================================'

-- 1A: Summary statistics
SELECT 'SUMMARY STATISTICS' AS section;

WITH duplicate_recs AS (
  SELECT recommendation_id
  FROM catalogos.recommendation_outcomes
  WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
  GROUP BY recommendation_id
  HAVING COUNT(*) > 1
)
SELECT 
  (SELECT COUNT(*) FROM duplicate_recs) AS recommendations_with_duplicates,
  (SELECT COUNT(*) FROM catalogos.recommendation_outcomes 
   WHERE recommendation_id IN (SELECT recommendation_id FROM duplicate_recs)
     AND outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
  ) AS total_duplicate_outcome_rows,
  (SELECT COUNT(*) FROM catalogos.recommendation_outcomes 
   WHERE recommendation_id IN (SELECT recommendation_id FROM duplicate_recs)
     AND outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
  ) - (SELECT COUNT(*) FROM duplicate_recs) AS rows_to_archive;

-- 1B: Breakdown by status combination
SELECT 'DUPLICATE COMBINATIONS' AS section;

SELECT 
  status_combo,
  COUNT(*) AS occurrence_count,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM (
  SELECT 
    recommendation_id,
    STRING_AGG(DISTINCT outcome_status, ' + ' ORDER BY outcome_status) AS status_combo
  FROM catalogos.recommendation_outcomes
  WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
  GROUP BY recommendation_id
  HAVING COUNT(*) > 1
) combos
GROUP BY status_combo
ORDER BY occurrence_count DESC;

-- 1C: Same-status duplicates (indicates recording bug)
SELECT 'SAME-STATUS DUPLICATES (potential bug)' AS section;

SELECT 
  outcome_status,
  COUNT(DISTINCT recommendation_id) AS affected_recommendations,
  SUM(cnt - 1) AS excess_rows
FROM (
  SELECT recommendation_id, outcome_status, COUNT(*) AS cnt
  FROM catalogos.recommendation_outcomes
  WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
  GROUP BY recommendation_id, outcome_status
  HAVING COUNT(*) > 1
) x
GROUP BY outcome_status
ORDER BY excess_rows DESC;


-- ############################################################################
-- STEP 2: GENERATE REVIEW REPORT - Run this SECOND
-- ############################################################################
-- Purpose: Show exactly which row will be kept vs archived for each duplicate
-- Action: READ-ONLY - no data changes

\echo ''
\echo '============================================================'
\echo 'STEP 2: REVIEW REPORT - Winner vs Archive Determination'
\echo '============================================================'

SELECT 'DETAILED REMEDIATION PLAN' AS section;

WITH ranked_outcomes AS (
  SELECT 
    ro.id,
    ro.recommendation_id,
    ro.outcome_status,
    ro.product_id,
    ro.supplier_id,
    ro.decision_source,
    ro.created_at,
    ro.updated_at,
    ro.estimated_savings,
    ro.realized_savings,
    ROW_NUMBER() OVER (
      PARTITION BY ro.recommendation_id 
      ORDER BY 
        -- Priority by status authority
        CASE ro.outcome_status 
          WHEN 'partially_realized' THEN 1
          WHEN 'accepted' THEN 2
          WHEN 'rejected' THEN 3
          WHEN 'expired' THEN 4
          WHEN 'superseded' THEN 5
        END,
        -- Tiebreaker: most recent activity
        ro.updated_at DESC NULLS LAST,
        ro.created_at DESC
    ) AS authority_rank
  FROM catalogos.recommendation_outcomes ro
  WHERE ro.outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
    AND ro.recommendation_id IN (
      SELECT recommendation_id
      FROM catalogos.recommendation_outcomes
      WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
      GROUP BY recommendation_id
      HAVING COUNT(*) > 1
    )
)
SELECT 
  recommendation_id,
  id AS outcome_id,
  outcome_status,
  authority_rank,
  CASE 
    WHEN authority_rank = 1 THEN '>>> KEEP <<<'
    ELSE 'ARCHIVE'
  END AS disposition,
  decision_source,
  created_at,
  updated_at,
  estimated_savings,
  realized_savings
FROM ranked_outcomes
ORDER BY 
  recommendation_id,
  authority_rank;


-- ############################################################################
-- STEP 3: EXPORT FOR OFFLINE REVIEW (OPTIONAL)
-- ############################################################################
-- Purpose: Export to CSV for stakeholder review before remediation
-- Action: READ-ONLY - no data changes
-- Usage: Uncomment and run if manual approval required

/*
\echo ''
\echo '============================================================'
\echo 'STEP 3: EXPORTING TO CSV FOR REVIEW'
\echo '============================================================'

\COPY (
  WITH ranked_outcomes AS (
    SELECT 
      ro.*,
      ROW_NUMBER() OVER (
        PARTITION BY ro.recommendation_id 
        ORDER BY 
          CASE ro.outcome_status 
            WHEN 'partially_realized' THEN 1
            WHEN 'accepted' THEN 2
            WHEN 'rejected' THEN 3
            WHEN 'expired' THEN 4
            WHEN 'superseded' THEN 5
          END,
          ro.updated_at DESC NULLS LAST,
          ro.created_at DESC
      ) AS authority_rank
    FROM catalogos.recommendation_outcomes ro
    WHERE ro.outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
      AND ro.recommendation_id IN (
        SELECT recommendation_id
        FROM catalogos.recommendation_outcomes
        WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
        GROUP BY recommendation_id
        HAVING COUNT(*) > 1
      )
  )
  SELECT 
    recommendation_id,
    id AS outcome_id,
    outcome_status,
    authority_rank,
    CASE WHEN authority_rank = 1 THEN 'KEEP' ELSE 'ARCHIVE' END AS disposition,
    product_id,
    supplier_id,
    decision_source,
    created_at,
    updated_at,
    estimated_savings,
    realized_savings,
    notes
  FROM ranked_outcomes
  ORDER BY recommendation_id, authority_rank
) TO '/tmp/terminal_state_remediation_review.csv' WITH CSV HEADER;

\echo 'Exported to: /tmp/terminal_state_remediation_review.csv'
*/


-- ############################################################################
-- STEP 4: EXECUTE REMEDIATION - Run this THIRD (after review)
-- ############################################################################
-- Purpose: Archive duplicate rows (keeping winner) with full audit trail
-- Action: MODIFIES DATA - archives duplicates, does NOT delete
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !! IMPORTANT: Review Step 2 output BEFORE running this step             !!
-- !! Ensure the "KEEP" rows are correct for your business requirements    !!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

\echo ''
\echo '============================================================'
\echo 'STEP 4: EXECUTE REMEDIATION (Archive Duplicates)'
\echo '============================================================'
\echo 'This step will:'
\echo '  1. Generate a unique batch ID for this remediation'
\echo '  2. Copy duplicate rows to recommendation_outcomes_archive'
\echo '  3. Delete archived rows from recommendation_outcomes'
\echo '  4. Report results'
\echo ''
\echo 'TO EXECUTE: Uncomment the DO block below and run'

/*
DO $$
DECLARE
  v_batch_id UUID := gen_random_uuid();
  v_archived_count INTEGER;
  v_deleted_count INTEGER;
BEGIN
  RAISE NOTICE 'Starting remediation batch: %', v_batch_id;
  
  -- Ensure archive table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'catalogos' 
      AND table_name = 'recommendation_outcomes_archive'
  ) THEN
    RAISE EXCEPTION 'Archive table does not exist. Run migration 20260311000012 first (Phase 1 only).';
  END IF;

  -- Step 4A: Archive duplicates (rows where authority_rank > 1)
  WITH ranked_outcomes AS (
    SELECT 
      ro.*,
      ROW_NUMBER() OVER (
        PARTITION BY ro.recommendation_id 
        ORDER BY 
          CASE ro.outcome_status 
            WHEN 'partially_realized' THEN 1
            WHEN 'accepted' THEN 2
            WHEN 'rejected' THEN 3
            WHEN 'expired' THEN 4
            WHEN 'superseded' THEN 5
          END,
          ro.updated_at DESC NULLS LAST,
          ro.created_at DESC
      ) AS authority_rank
    FROM catalogos.recommendation_outcomes ro
    WHERE ro.outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
      AND ro.recommendation_id IN (
        SELECT recommendation_id
        FROM catalogos.recommendation_outcomes
        WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
        GROUP BY recommendation_id
        HAVING COUNT(*) > 1
      )
  ),
  winners AS (
    SELECT recommendation_id, id AS winner_id
    FROM ranked_outcomes
    WHERE authority_rank = 1
  ),
  to_archive AS (
    SELECT ro.*, w.winner_id
    FROM ranked_outcomes ro
    JOIN winners w ON ro.recommendation_id = w.recommendation_id
    WHERE ro.authority_rank > 1
  )
  INSERT INTO catalogos.recommendation_outcomes_archive (
    id, recommendation_id, product_id, supplier_id, offer_id,
    outcome_status, decision_source, accepted, accepted_at, rejected_at,
    rejection_reason, selected_supplier_id, selected_offer_id, selected_price,
    recommended_price, recommended_rank, recommended_trust_score, recommended_reasoning,
    price_delta, trust_delta, estimated_savings, realized_savings, realized_savings_percent,
    savings_confidence, superseded_by_id, supersedes_id, notes, metadata,
    created_at, updated_at,
    archived_at, archive_reason, archive_batch_id, kept_outcome_id, original_status
  )
  SELECT 
    ta.id, ta.recommendation_id, ta.product_id, ta.supplier_id, ta.offer_id,
    ta.outcome_status, ta.decision_source, ta.accepted, ta.accepted_at, ta.rejected_at,
    ta.rejection_reason, ta.selected_supplier_id, ta.selected_offer_id, ta.selected_price,
    ta.recommended_price, ta.recommended_rank, ta.recommended_trust_score, ta.recommended_reasoning,
    ta.price_delta, ta.trust_delta, ta.estimated_savings, ta.realized_savings, ta.realized_savings_percent,
    ta.savings_confidence, ta.superseded_by_id, ta.supersedes_id, ta.notes, ta.metadata,
    ta.created_at, ta.updated_at,
    now(),
    'duplicate_terminal_state_remediation',
    v_batch_id,
    ta.winner_id,
    ta.outcome_status
  FROM to_archive ta;
  
  GET DIAGNOSTICS v_archived_count = ROW_COUNT;
  RAISE NOTICE 'Archived % duplicate rows to recommendation_outcomes_archive', v_archived_count;
  
  -- Step 4B: Delete archived rows from main table
  WITH ranked_outcomes AS (
    SELECT 
      ro.id,
      ROW_NUMBER() OVER (
        PARTITION BY ro.recommendation_id 
        ORDER BY 
          CASE ro.outcome_status 
            WHEN 'partially_realized' THEN 1
            WHEN 'accepted' THEN 2
            WHEN 'rejected' THEN 3
            WHEN 'expired' THEN 4
            WHEN 'superseded' THEN 5
          END,
          ro.updated_at DESC NULLS LAST,
          ro.created_at DESC
      ) AS authority_rank
    FROM catalogos.recommendation_outcomes ro
    WHERE ro.outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
      AND ro.recommendation_id IN (
        SELECT recommendation_id
        FROM catalogos.recommendation_outcomes
        WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized')
        GROUP BY recommendation_id
        HAVING COUNT(*) > 1
      )
  )
  DELETE FROM catalogos.recommendation_outcomes
  WHERE id IN (
    SELECT id FROM ranked_outcomes WHERE authority_rank > 1
  );
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Removed % duplicate rows from recommendation_outcomes', v_deleted_count;
  
  -- Sanity check
  IF v_archived_count != v_deleted_count THEN
    RAISE EXCEPTION 'Mismatch: archived % but deleted %. Rolling back.', v_archived_count, v_deleted_count;
  END IF;
  
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'REMEDIATION COMPLETE';
  RAISE NOTICE 'Batch ID: %', v_batch_id;
  RAISE NOTICE 'Rows archived: %', v_archived_count;
  RAISE NOTICE 'Rows removed from main table: %', v_deleted_count;
  RAISE NOTICE '============================================================';
  
END $$;
*/


-- ############################################################################
-- STEP 5: VERIFY REMEDIATION - Run this FOURTH
-- ############################################################################
-- Purpose: Confirm no duplicates remain and archive is populated
-- Action: READ-ONLY

\echo ''
\echo '============================================================'
\echo 'STEP 5: VERIFY REMEDIATION'
\echo '============================================================'

SELECT 'POST-REMEDIATION CHECK' AS section;

-- 5A: Should return 0 if remediation successful
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

-- 5B: Archive contents
SELECT 'ARCHIVE SUMMARY' AS section;

SELECT 
  archive_batch_id,
  archive_reason,
  MIN(archived_at) AS archived_at,
  COUNT(*) AS rows_archived,
  COUNT(DISTINCT recommendation_id) AS recommendations_affected
FROM catalogos.recommendation_outcomes_archive
GROUP BY archive_batch_id, archive_reason
ORDER BY MIN(archived_at) DESC
LIMIT 10;


-- ############################################################################
-- STEP 6: ROLLBACK PROCEDURE (if needed)
-- ############################################################################
-- Purpose: Restore archived rows if remediation was incorrect
-- Action: MODIFIES DATA - restores from archive

/*
\echo ''
\echo '============================================================'
\echo 'STEP 6: ROLLBACK (if needed)'
\echo '============================================================'

-- Replace with actual batch_id from Step 4 output
DO $$
DECLARE
  v_batch_id UUID := 'YOUR-BATCH-ID-HERE';  -- <-- Replace this!
  v_restored_count INTEGER;
BEGIN
  -- Restore archived rows
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
    original_status,  -- Restore original status
    decision_source, accepted, accepted_at, rejected_at,
    rejection_reason, selected_supplier_id, selected_offer_id, selected_price,
    recommended_price, recommended_rank, recommended_trust_score, recommended_reasoning,
    price_delta, trust_delta, estimated_savings, realized_savings, realized_savings_percent,
    savings_confidence, superseded_by_id, supersedes_id, 
    COALESCE(notes || ' | ', '') || 'Restored from archive batch ' || v_batch_id || ' on ' || now()::date,
    metadata,
    created_at, updated_at
  FROM catalogos.recommendation_outcomes_archive
  WHERE archive_batch_id = v_batch_id;
  
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  RAISE NOTICE 'Restored % rows from archive batch %', v_restored_count, v_batch_id;
  
  -- Mark archive rows as restored (don't delete them)
  UPDATE catalogos.recommendation_outcomes_archive
  SET archive_reason = archive_reason || '_RESTORED_' || now()::date
  WHERE archive_batch_id = v_batch_id;
  
END $$;
*/
