-- QA Supervisor Tables Migration
-- Adds persistence for fix logs, blocked actions, and audit configuration

-- ============================================================================
-- 1. FIX LOGS - Immutable audit trail of all fixes applied
-- ============================================================================

CREATE TABLE IF NOT EXISTS fix_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_report_id UUID REFERENCES audit_reports(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  source_table TEXT,
  source_id UUID,
  issue_found TEXT NOT NULL,
  fix_applied TEXT NOT NULL,
  prior_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_before NUMERIC(5,4),
  confidence_after NUMERIC(5,4),
  fix_level INTEGER NOT NULL DEFAULT 1 CHECK (fix_level IN (1, 2, 3)),
  was_applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'audit_supervisor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fix_logs_audit_report ON fix_logs (audit_report_id);
CREATE INDEX IF NOT EXISTS idx_fix_logs_source ON fix_logs (source_table, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fix_logs_record ON fix_logs (record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_fix_logs_created ON fix_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fix_logs_module ON fix_logs (module);

-- Idempotency: Prevent duplicate fix for same source within 24 hours
CREATE UNIQUE INDEX IF NOT EXISTS idx_fix_logs_dedupe ON fix_logs (
  source_table, source_id, issue_found, date_trunc('day', created_at)
) WHERE source_id IS NOT NULL;

-- ============================================================================
-- 2. BLOCKED_ACTIONS - Persisted blocked items
-- ============================================================================

CREATE TABLE IF NOT EXISTS blocked_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_report_id UUID REFERENCES audit_reports(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  source_table TEXT,
  source_id UUID,
  reason_blocked TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'ignored')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolved_notes TEXT,
  created_by TEXT DEFAULT 'audit_supervisor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocked_actions_audit_report ON blocked_actions (audit_report_id);
CREATE INDEX IF NOT EXISTS idx_blocked_actions_source ON blocked_actions (source_table, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blocked_actions_status ON blocked_actions (status);
CREATE INDEX IF NOT EXISTS idx_blocked_actions_severity ON blocked_actions (severity, status);
CREATE INDEX IF NOT EXISTS idx_blocked_actions_created ON blocked_actions (created_at DESC);

-- Idempotency: Prevent duplicate active blocks for same source
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_actions_dedupe ON blocked_actions (
  source_table, source_id, reason_blocked
) WHERE source_id IS NOT NULL AND status = 'active';

-- Trigger for updated_at
CREATE TRIGGER update_blocked_actions_updated_at
  BEFORE UPDATE ON blocked_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. ADD ADDITIONAL AGENT RULES FOR QA SUPERVISOR
-- ============================================================================

INSERT INTO agent_rules (agent_name, rule_key, rule_value, description) VALUES
  -- Confidence thresholds
  ('audit_supervisor', 'min_confidence_auto_publish', '0.90'::jsonb, 'Min confidence for auto-publish'),
  ('audit_supervisor', 'min_confidence_auto_fix', '0.85'::jsonb, 'Min confidence for auto-fix'),
  ('audit_supervisor', 'confidence_downgrade_step', '0.10'::jsonb, 'How much to downgrade confidence per issue'),
  
  -- Margin protection
  ('audit_supervisor', 'min_margin_percent', '0.15'::jsonb, 'Minimum allowed margin percentage'),
  ('audit_supervisor', 'min_margin_dollars', '1.00'::jsonb, 'Minimum allowed margin in dollars'),
  
  -- Price change limits
  ('audit_supervisor', 'max_auto_publish_price_change', '0.05'::jsonb, 'Max price change for auto-publish'),
  ('audit_supervisor', 'max_price_swing_without_review', '0.07'::jsonb, 'Max price swing before review required'),
  
  -- Data staleness
  ('audit_supervisor', 'max_competitor_data_age_days', '7'::jsonb, 'Days until competitor data is stale'),
  ('audit_supervisor', 'max_cost_data_age_days', '30'::jsonb, 'Days until cost data is stale'),
  
  -- Fix behavior
  ('audit_supervisor', 'enable_safe_auto_fixes', 'true'::jsonb, 'Allow Level 1 fixes to be applied'),
  ('audit_supervisor', 'systemic_issue_threshold', '5'::jsonb, 'Occurrences before flagging systemic issue')
ON CONFLICT (agent_name, rule_key) DO NOTHING;

-- ============================================================================
-- 4. HELPER FUNCTION: Check if fix already applied
-- ============================================================================

CREATE OR REPLACE FUNCTION check_fix_already_applied(
  p_source_table TEXT,
  p_source_id UUID,
  p_issue_found TEXT,
  p_hours_lookback INTEGER DEFAULT 24
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM fix_logs
    WHERE source_table = p_source_table
      AND source_id = p_source_id
      AND issue_found = p_issue_found
      AND was_applied = true
      AND created_at > now() - (p_hours_lookback || ' hours')::INTERVAL
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. HELPER FUNCTION: Check if action already blocked
-- ============================================================================

CREATE OR REPLACE FUNCTION check_action_already_blocked(
  p_source_table TEXT,
  p_source_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM blocked_actions
    WHERE source_table = p_source_table
      AND source_id = p_source_id
      AND reason_blocked = p_reason
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql;
