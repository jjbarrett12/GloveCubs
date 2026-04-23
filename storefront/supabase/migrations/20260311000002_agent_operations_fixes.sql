-- GloveCubs Agent Operations Framework - Fixes
-- Migration to fix issues found in audit

-- ============================================================================
-- 1. ADD MISSING INDEXES
-- ============================================================================

-- Index on job_type for filtering
CREATE INDEX IF NOT EXISTS idx_job_queue_job_type 
  ON job_queue (job_type);

-- Index on system_events created_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_system_events_created_at 
  ON system_events (created_at DESC);

-- Index on review_queue created_at for sorting
CREATE INDEX IF NOT EXISTS idx_review_queue_created_at 
  ON review_queue (created_at DESC);

-- Composite index for job claiming optimization
CREATE INDEX IF NOT EXISTS idx_job_queue_claimable 
  ON job_queue (status, priority, created_at) 
  WHERE status = 'pending';

-- ============================================================================
-- 2. ADD PRIORITY SORT ORDER COLUMN TO REVIEW_QUEUE
-- ============================================================================

-- Add numeric priority column for proper sorting
ALTER TABLE review_queue 
  ADD COLUMN IF NOT EXISTS priority_order INTEGER;

-- Update priority_order based on text priority
UPDATE review_queue SET priority_order = CASE
  WHEN priority = 'critical' THEN 1
  WHEN priority = 'high' THEN 2
  WHEN priority = 'medium' THEN 3
  WHEN priority = 'low' THEN 4
  ELSE 5
END;

-- Set NOT NULL and default
ALTER TABLE review_queue 
  ALTER COLUMN priority_order SET DEFAULT 3;

-- Create index for sorting
CREATE INDEX IF NOT EXISTS idx_review_queue_priority_order 
  ON review_queue (priority_order, created_at);

-- Create trigger to keep priority_order in sync
CREATE OR REPLACE FUNCTION sync_review_priority_order()
RETURNS TRIGGER AS $$
BEGIN
  NEW.priority_order := CASE
    WHEN NEW.priority = 'critical' THEN 1
    WHEN NEW.priority = 'high' THEN 2
    WHEN NEW.priority = 'medium' THEN 3
    WHEN NEW.priority = 'low' THEN 4
    ELSE 5
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_review_priority ON review_queue;
CREATE TRIGGER sync_review_priority
  BEFORE INSERT OR UPDATE ON review_queue
  FOR EACH ROW EXECUTE FUNCTION sync_review_priority_order();

-- ============================================================================
-- 3. ADD ATOMIC DEDUPE FUNCTION FOR JOBS
-- ============================================================================

-- Atomic enqueue with deduplication
CREATE OR REPLACE FUNCTION enqueue_job_atomic(
  p_job_type TEXT,
  p_payload JSONB,
  p_priority INTEGER DEFAULT 50,
  p_source_table TEXT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_dedupe_key TEXT DEFAULT NULL,
  p_run_after TIMESTAMPTZ DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (
  job_id UUID,
  created BOOLEAN,
  dedupe_matched BOOLEAN
) AS $$
DECLARE
  v_job_id UUID;
  v_created BOOLEAN := false;
  v_dedupe_matched BOOLEAN := false;
BEGIN
  -- If dedupe_key provided, try to find existing
  IF p_dedupe_key IS NOT NULL THEN
    SELECT id INTO v_job_id
    FROM job_queue
    WHERE dedupe_key = p_dedupe_key
      AND status IN ('pending', 'running')
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    
    IF v_job_id IS NOT NULL THEN
      v_dedupe_matched := true;
      RETURN QUERY SELECT v_job_id, v_created, v_dedupe_matched;
      RETURN;
    END IF;
  END IF;
  
  -- Insert new job
  INSERT INTO job_queue (
    job_type, payload, priority, source_table, source_id, 
    dedupe_key, run_after, created_by
  )
  VALUES (
    p_job_type, p_payload, p_priority, p_source_table, p_source_id,
    p_dedupe_key, p_run_after, p_created_by
  )
  RETURNING id INTO v_job_id;
  
  v_created := true;
  RETURN QUERY SELECT v_job_id, v_created, v_dedupe_matched;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. ADD ATOMIC DEDUPE FUNCTION FOR REVIEW ITEMS
-- ============================================================================

-- Atomic review item creation with deduplication
CREATE OR REPLACE FUNCTION create_review_item_atomic(
  p_review_type TEXT,
  p_priority TEXT,
  p_source_table TEXT,
  p_source_id UUID,
  p_title TEXT,
  p_issue_category TEXT,
  p_issue_summary TEXT,
  p_recommended_action TEXT DEFAULT NULL,
  p_agent_name TEXT DEFAULT NULL,
  p_confidence NUMERIC DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  review_id UUID,
  created BOOLEAN,
  dedupe_matched BOOLEAN
) AS $$
DECLARE
  v_review_id UUID;
  v_created BOOLEAN := false;
  v_dedupe_matched BOOLEAN := false;
BEGIN
  -- Check for existing open item with same source and category
  IF p_source_table IS NOT NULL AND p_source_id IS NOT NULL THEN
    SELECT id INTO v_review_id
    FROM review_queue
    WHERE source_table = p_source_table
      AND source_id = p_source_id
      AND issue_category = p_issue_category
      AND status IN ('open', 'in_review')
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    
    IF v_review_id IS NOT NULL THEN
      v_dedupe_matched := true;
      RETURN QUERY SELECT v_review_id, v_created, v_dedupe_matched;
      RETURN;
    END IF;
  END IF;
  
  -- Insert new review item
  INSERT INTO review_queue (
    review_type, priority, source_table, source_id, title,
    issue_category, issue_summary, recommended_action,
    agent_name, confidence, details
  )
  VALUES (
    p_review_type, p_priority, p_source_table, p_source_id, p_title,
    p_issue_category, p_issue_summary, p_recommended_action,
    p_agent_name, p_confidence, p_details
  )
  RETURNING id INTO v_review_id;
  
  v_created := true;
  RETURN QUERY SELECT v_review_id, v_created, v_dedupe_matched;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. ADD RLS POLICIES (Optional - for when auth is enabled)
-- ============================================================================

-- Enable RLS on admin tables (but allow service role full access)
-- These can be enabled when authentication is added

-- ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE agent_rules ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. ADD PARTIAL UNIQUE INDEX FOR DEDUPE
-- ============================================================================

-- Prevent duplicate pending/running jobs with same dedupe_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_queue_dedupe_unique 
  ON job_queue (dedupe_key) 
  WHERE dedupe_key IS NOT NULL AND status IN ('pending', 'running');

-- Prevent duplicate open review items for same source
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_queue_source_unique 
  ON review_queue (source_table, source_id, issue_category) 
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL AND status IN ('open', 'in_review');
