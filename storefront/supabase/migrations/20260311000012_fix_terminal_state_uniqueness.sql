-- Fix Recommendation Outcomes Terminal-State Uniqueness
-- Migration: 20260311000012_fix_terminal_state_uniqueness.sql
-- ============================================================================
--
-- ██████╗ ██████╗ ███████╗███████╗██╗     ██╗ ██████╗ ██╗  ██╗████████╗
-- ██╔══██╗██╔══██╗██╔════╝██╔════╝██║     ██║██╔════╝ ██║  ██║╚══██╔══╝
-- ██████╔╝██████╔╝█████╗  █████╗  ██║     ██║██║  ███╗███████║   ██║   
-- ██╔═══╝ ██╔══██╗██╔══╝  ██╔══╝  ██║     ██║██║   ██║██╔══██║   ██║   
-- ██║     ██║  ██║███████╗██║     ███████╗██║╚██████╔╝██║  ██║   ██║   
-- ╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝     ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !! DO NOT APPLY THIS MIGRATION UNTIL PREFLIGHT CHECKS PASS           !!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
--
-- REQUIRED PREFLIGHT:
-- 1. Run: scripts/remediate-terminal-state-duplicates.sql (STEP 1 only)
-- 2. Verify output shows: "duplicate_count: 0"
-- 3. If duplicates exist, complete full remediation workflow first
-- 4. Only then apply this migration
--
-- See: docs/TERMINAL_STATE_UNIQUENESS_RUNBOOK.md for full deployment steps
--
-- ============================================================================
-- WHAT THIS MIGRATION DOES
-- ============================================================================
--
-- Problem: Original index (idx_rec_outcomes_unique_terminal) only covered:
--   accepted, rejected, expired
--
-- This allowed duplicate terminal outcomes when status was 'superseded' or
-- 'partially_realized', violating the one-terminal-outcome-per-recommendation rule.
--
-- Solution: Recreate index to include ALL terminal states:
--   accepted, rejected, expired, superseded, partially_realized
--
-- ============================================================================
-- PHASE 1: CREATE ARCHIVE TABLE (idempotent)
-- ============================================================================

-- Archive table preserves any rows moved during remediation
-- This ensures NO DATA IS EVER DELETED - only archived
CREATE TABLE IF NOT EXISTS catalogos.recommendation_outcomes_archive (
  -- Original row data
  id UUID NOT NULL,
  recommendation_id UUID NOT NULL,
  product_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  offer_id UUID NOT NULL,
  outcome_status TEXT NOT NULL,
  decision_source TEXT,
  accepted BOOLEAN,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  selected_supplier_id UUID,
  selected_offer_id UUID,
  selected_price NUMERIC(10, 2),
  recommended_price NUMERIC(10, 2),
  recommended_rank INTEGER,
  recommended_trust_score NUMERIC(5, 4),
  recommended_reasoning TEXT,
  price_delta NUMERIC(10, 2),
  trust_delta NUMERIC(5, 4),
  estimated_savings NUMERIC(10, 2),
  realized_savings NUMERIC(10, 2),
  realized_savings_percent NUMERIC(5, 2),
  savings_confidence TEXT,
  superseded_by_id UUID,
  supersedes_id UUID,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  
  -- Archive metadata
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archive_reason TEXT NOT NULL,
  archive_batch_id UUID NOT NULL,
  kept_outcome_id UUID,
  original_status TEXT NOT NULL,
  
  PRIMARY KEY (id, archived_at)
);

COMMENT ON TABLE catalogos.recommendation_outcomes_archive IS 
  'Archive of recommendation_outcomes rows removed during duplicate remediation. NO DATA IS DELETED - duplicates are moved here with full audit trail.';

CREATE INDEX IF NOT EXISTS idx_rec_outcomes_archive_batch 
  ON catalogos.recommendation_outcomes_archive(archive_batch_id);
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_archive_rec_id 
  ON catalogos.recommendation_outcomes_archive(recommendation_id);

-- ============================================================================
-- PHASE 2: DROP EXISTING INDEX
-- ============================================================================

DROP INDEX IF EXISTS catalogos.idx_rec_outcomes_unique_terminal;

-- ============================================================================
-- PHASE 3: CREATE CORRECTED UNIQUE INDEX
-- ============================================================================

-- This will FAIL if duplicates exist - that's intentional!
-- Failure means preflight was not completed properly.
CREATE UNIQUE INDEX idx_rec_outcomes_unique_terminal 
  ON catalogos.recommendation_outcomes(recommendation_id) 
  WHERE outcome_status IN ('accepted', 'rejected', 'expired', 'superseded', 'partially_realized');

COMMENT ON INDEX catalogos.idx_rec_outcomes_unique_terminal IS 
  'Ensures at most one terminal outcome per recommendation. Terminal states: accepted, rejected, expired, superseded, partially_realized. Pending outcomes are excluded to allow state transitions.';

-- ============================================================================
-- PHASE 4: VERIFICATION QUERY (run after migration)
-- ============================================================================
-- 
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'recommendation_outcomes'
--   AND indexname = 'idx_rec_outcomes_unique_terminal';
--
-- Expected: WHERE (outcome_status = ANY (ARRAY['accepted'::text, 'rejected'::text, 
--           'expired'::text, 'superseded'::text, 'partially_realized'::text]))

-- ============================================================================
-- ROLLBACK PROCEDURE (if needed)
-- ============================================================================
--
-- DROP INDEX IF EXISTS catalogos.idx_rec_outcomes_unique_terminal;
-- CREATE UNIQUE INDEX idx_rec_outcomes_unique_terminal 
--   ON catalogos.recommendation_outcomes(recommendation_id) 
--   WHERE outcome_status IN ('accepted', 'rejected', 'expired');
--
-- Note: Rollback restores the old (incomplete) index. Archived rows remain
-- in recommendation_outcomes_archive and can be restored if needed.
