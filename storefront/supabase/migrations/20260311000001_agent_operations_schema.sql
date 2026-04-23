-- GloveCubs Agent Operations Framework
-- Database Schema Migration

-- ============================================================================
-- 1. JOB QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'blocked', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 50,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_table TEXT,
  source_id UUID,
  dedupe_key TEXT,
  run_after TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  blocked_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status_priority_run_after 
  ON job_queue (status, priority, run_after);
CREATE INDEX IF NOT EXISTS idx_job_queue_dedupe_key 
  ON job_queue (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_queue_source 
  ON job_queue (source_table, source_id) WHERE source_table IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_queue_created_at 
  ON job_queue (created_at DESC);

-- ============================================================================
-- 2. JOB RUNS (Immutable Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  worker_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'blocked')),
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_id ON job_runs (job_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_job_type_started ON job_runs (job_type, started_at DESC);

-- ============================================================================
-- 3. REVIEW QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_type TEXT NOT NULL 
    CHECK (review_type IN ('supplier', 'catalog', 'product_match', 'pricing', 'audit', 'system')),
  status TEXT NOT NULL DEFAULT 'open' 
    CHECK (status IN ('open', 'in_review', 'approved', 'rejected', 'resolved')),
  priority TEXT NOT NULL DEFAULT 'medium' 
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  source_table TEXT,
  source_id UUID,
  title TEXT NOT NULL,
  issue_category TEXT NOT NULL,
  issue_summary TEXT NOT NULL,
  recommended_action TEXT,
  agent_name TEXT,
  confidence NUMERIC(5,4),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_to UUID,
  resolved_by UUID,
  resolved_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status_priority 
  ON review_queue (status, priority);
CREATE INDEX IF NOT EXISTS idx_review_queue_source 
  ON review_queue (source_table, source_id) WHERE source_table IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_queue_type_status 
  ON review_queue (review_type, status);

-- ============================================================================
-- 4. AUDIT REPORTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL DEFAULT 'audit_and_fix',
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  module_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  fixes JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  blocked_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  systemic_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  self_audit JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_created ON audit_reports (created_at DESC);

-- ============================================================================
-- 5. AGENT CONFIG
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. AGENT RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  rule_value JSONB NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_name, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_rules_agent ON agent_rules (agent_name);

-- ============================================================================
-- 7. SYSTEM EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' 
    CHECK (status IN ('new', 'processed', 'ignored', 'failed')),
  source_table TEXT,
  source_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_events_type_status 
  ON system_events (event_type, status);
CREATE INDEX IF NOT EXISTS idx_system_events_source 
  ON system_events (source_table, source_id) WHERE source_table IS NOT NULL;

-- ============================================================================
-- 8. CRON LOCKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS cron_locks (
  lock_key TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_job_queue_updated_at
  BEFORE UPDATE ON job_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_review_queue_updated_at
  BEFORE UPDATE ON review_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_config_updated_at
  BEFORE UPDATE ON agent_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_rules_updated_at
  BEFORE UPDATE ON agent_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cron_locks_updated_at
  BEFORE UPDATE ON cron_locks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA: AGENT CONFIG
-- ============================================================================

INSERT INTO agent_config (agent_name, is_enabled, config) VALUES
  ('supplier_discovery', true, '{"schedule": "weekly", "max_results": 50}'::jsonb),
  ('product_intake', true, '{"auto_normalize": true, "require_brand": true}'::jsonb),
  ('product_matching', true, '{"use_upc_priority": true, "auto_link_threshold": 0.95}'::jsonb),
  ('competitive_pricing', true, '{"check_shipping": true, "trusted_sources_only": true}'::jsonb),
  ('daily_price_guard', true, '{"check_long_tail_weekly": true}'::jsonb),
  ('audit_supervisor', true, '{"run_self_audit": true, "block_on_uncertainty": true}'::jsonb),
  ('orchestrator', true, '{"max_concurrent_jobs": 10}'::jsonb)
ON CONFLICT (agent_name) DO NOTHING;

-- ============================================================================
-- SEED DATA: AGENT RULES
-- ============================================================================

INSERT INTO agent_rules (agent_name, rule_key, rule_value, description) VALUES
  -- Competitive Pricing Rules
  ('competitive_pricing', 'minimum_margin_percent', '0.22'::jsonb, 'Minimum margin floor as decimal'),
  ('competitive_pricing', 'max_auto_publish_swing_percent', '0.05'::jsonb, 'Max price change for auto-publish'),
  ('competitive_pricing', 'max_swing_without_review', '0.07'::jsonb, 'Max price swing before requiring review'),
  ('competitive_pricing', 'require_shipping_for_close_comparison', 'true'::jsonb, 'Block if shipping unknown on close prices'),
  ('competitive_pricing', 'stale_data_days', '7'::jsonb, 'Days until competitor data is stale'),
  
  -- Product Matching Rules
  ('product_matching', 'exact_match_confidence_threshold', '0.95'::jsonb, 'Confidence required for exact match'),
  ('product_matching', 'likely_match_threshold', '0.85'::jsonb, 'Confidence for likely match'),
  ('product_matching', 'review_threshold', '0.75'::jsonb, 'Below this, send to review'),
  ('product_matching', 'block_on_pack_mismatch', 'true'::jsonb, 'Never exact match if pack differs'),
  ('product_matching', 'block_on_grade_mismatch', 'true'::jsonb, 'Never exact match if grade differs'),
  
  -- Product Intake Rules
  ('product_intake', 'min_publish_confidence', '0.90'::jsonb, 'Minimum confidence to auto-publish'),
  ('product_intake', 'require_brand', 'true'::jsonb, 'Require brand for publishing'),
  ('product_intake', 'require_material', 'true'::jsonb, 'Require material for publishing'),
  ('product_intake', 'require_pack_quantity', 'true'::jsonb, 'Require pack quantity for publishing'),
  
  -- Audit Supervisor Rules
  ('audit_supervisor', 'block_on_map_risk', 'true'::jsonb, 'Block actions that may violate MAP'),
  ('audit_supervisor', 'block_on_pack_ambiguity', 'true'::jsonb, 'Block if pack size is unclear'),
  ('audit_supervisor', 'block_on_margin_violation', 'true'::jsonb, 'Block if below margin floor'),
  ('audit_supervisor', 'downgrade_confidence_on_conflicts', 'true'::jsonb, 'Lower confidence when data conflicts'),
  
  -- Daily Price Guard Rules
  ('daily_price_guard', 'high_traffic_threshold', '100'::jsonb, 'Views/day for high traffic'),
  ('daily_price_guard', 'high_revenue_threshold', '500'::jsonb, 'Revenue/day for high revenue'),
  ('daily_price_guard', 'long_tail_traffic_threshold', '10'::jsonb, 'Below this = long-tail'),
  ('daily_price_guard', 'cost_change_threshold', '0.02'::jsonb, 'Cost change to flag'),
  
  -- Supplier Discovery Rules
  ('supplier_discovery', 'min_trust_score', '0.50'::jsonb, 'Minimum trust score to consider'),
  ('supplier_discovery', 'require_website', 'true'::jsonb, 'Require valid website'),
  ('supplier_discovery', 'block_retail_marketplaces', 'true'::jsonb, 'Block Amazon/eBay sellers')
ON CONFLICT (agent_name, rule_key) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Claim next available job atomically
CREATE OR REPLACE FUNCTION claim_next_job(
  p_worker_name TEXT,
  p_job_types TEXT[] DEFAULT NULL,
  p_lock_timeout_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  payload JSONB,
  attempt_count INTEGER
) AS $$
DECLARE
  v_job_id UUID;
  v_stale_lock_time TIMESTAMPTZ := now() - (p_lock_timeout_minutes || ' minutes')::INTERVAL;
BEGIN
  -- Find and lock a job atomically
  UPDATE job_queue
  SET 
    status = 'running',
    locked_at = now(),
    locked_by = p_worker_name,
    attempt_count = job_queue.attempt_count + 1,
    started_at = COALESCE(job_queue.started_at, now()),
    updated_at = now()
  WHERE id = (
    SELECT jq.id
    FROM job_queue jq
    WHERE jq.status = 'pending'
      AND (jq.run_after IS NULL OR jq.run_after <= now())
      AND (jq.locked_at IS NULL OR jq.locked_at < v_stale_lock_time)
      AND (p_job_types IS NULL OR jq.job_type = ANY(p_job_types))
    ORDER BY jq.priority ASC, jq.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING job_queue.id INTO v_job_id;
  
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT jq.id, jq.job_type, jq.payload, jq.attempt_count
  FROM job_queue jq
  WHERE jq.id = v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Acquire cron lock
CREATE OR REPLACE FUNCTION acquire_cron_lock(
  p_lock_key TEXT,
  p_locked_by TEXT,
  p_duration_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
  v_acquired BOOLEAN := false;
BEGIN
  INSERT INTO cron_locks (lock_key, locked_until, locked_by)
  VALUES (p_lock_key, now() + (p_duration_minutes || ' minutes')::INTERVAL, p_locked_by)
  ON CONFLICT (lock_key) DO UPDATE
  SET 
    locked_until = now() + (p_duration_minutes || ' minutes')::INTERVAL,
    locked_by = p_locked_by,
    updated_at = now()
  WHERE cron_locks.locked_until < now();
  
  SELECT EXISTS (
    SELECT 1 FROM cron_locks 
    WHERE lock_key = p_lock_key AND locked_by = p_locked_by
  ) INTO v_acquired;
  
  RETURN v_acquired;
END;
$$ LANGUAGE plpgsql;

-- Release cron lock
CREATE OR REPLACE FUNCTION release_cron_lock(p_lock_key TEXT, p_locked_by TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM cron_locks
  WHERE lock_key = p_lock_key AND locked_by = p_locked_by;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
