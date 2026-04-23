-- AI Performance Metrics and LLM Usage Tracking
-- Migration: 20260311000007_ai_performance_metrics.sql

-- ============================================================================
-- Extend AI Feedback Table for Structured Corrections
-- ============================================================================

ALTER TABLE catalogos.ai_feedback
ADD COLUMN IF NOT EXISTS structured_corrections JSONB,
ADD COLUMN IF NOT EXISTS used_for_training BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS decision TEXT,
ADD COLUMN IF NOT EXISTS corrected_decision TEXT;

-- ============================================================================
-- AI Performance Metrics Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.ai_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL,
  metric_value NUMERIC(10, 4) NOT NULL,
  confidence_band TEXT,
  sample_size INTEGER NOT NULL DEFAULT 0,
  pipeline_run_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.ai_performance_metrics IS 'Persistent tracking of AI performance over time';

CREATE INDEX idx_ai_performance_metrics_type ON catalogos.ai_performance_metrics(metric_type);
CREATE INDEX idx_ai_performance_metrics_created_at ON catalogos.ai_performance_metrics(created_at DESC);
CREATE INDEX idx_ai_performance_metrics_pipeline_run ON catalogos.ai_performance_metrics(pipeline_run_id);

-- ============================================================================
-- AI LLM Usage Tracking Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.ai_llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_total INTEGER NOT NULL DEFAULT 0,
  cost_estimate NUMERIC(10, 6) NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  pipeline_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.ai_llm_usage IS 'LLM usage tracking for cost and rate limiting';

CREATE INDEX idx_ai_llm_usage_type ON catalogos.ai_llm_usage(request_type);
CREATE INDEX idx_ai_llm_usage_created_at ON catalogos.ai_llm_usage(created_at DESC);
CREATE INDEX idx_ai_llm_usage_pipeline_run ON catalogos.ai_llm_usage(pipeline_run_id);

-- ============================================================================
-- Daily LLM Cost Aggregation View
-- ============================================================================

CREATE OR REPLACE VIEW catalogos.ai_llm_daily_costs AS
SELECT 
  DATE(created_at) AS usage_date,
  request_type,
  COUNT(*) AS request_count,
  SUM(tokens_total) AS total_tokens,
  SUM(cost_estimate) AS total_cost,
  AVG(latency_ms) AS avg_latency_ms,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) AS error_count
FROM catalogos.ai_llm_usage
GROUP BY DATE(created_at), request_type;

-- ============================================================================
-- AI Cost Guard Configuration
-- ============================================================================

INSERT INTO catalogos.agent_rules (agent_name, rule_key, rule_value, description, is_enabled)
VALUES 
  ('ai_system', 'daily_llm_cost_limit', '10.00', 'Maximum daily LLM cost in USD before auto-disable', true),
  ('ai_system', 'llm_rate_limit_per_minute', '60', 'Maximum LLM requests per minute', true),
  ('ai_system', 'llm_escalation_enabled', 'true', 'Whether LLM escalation is enabled', true),
  ('ai_system', 'extraction_confidence_threshold', '0.65', 'Min confidence before LLM extraction escalation', true),
  ('ai_system', 'matching_confidence_threshold', '0.70', 'Min confidence before LLM matching escalation', true),
  ('ai_system', 'pricing_confidence_threshold', '0.65', 'Min confidence before LLM pricing escalation', true)
ON CONFLICT (agent_name, rule_key) DO UPDATE SET
  rule_value = EXCLUDED.rule_value,
  updated_at = now();

-- ============================================================================
-- Review Priority Scoring Extension
-- ============================================================================

ALTER TABLE catalogos.review_queue
ADD COLUMN IF NOT EXISTS priority_score NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS priority_band TEXT CHECK (priority_band IN ('critical', 'high', 'normal', 'low'));

CREATE INDEX IF NOT EXISTS idx_review_queue_priority_score ON catalogos.review_queue(priority_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_review_queue_priority_band ON catalogos.review_queue(priority_band);

-- ============================================================================
-- Performance Metrics Aggregation Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION catalogos.get_ai_performance_trend(
  p_metric_type TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  period_date DATE,
  avg_value NUMERIC,
  sample_count INTEGER,
  trend_direction TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH daily_metrics AS (
    SELECT 
      DATE(created_at) AS metric_date,
      AVG(metric_value) AS avg_metric,
      SUM(sample_size) AS total_samples
    FROM catalogos.ai_performance_metrics
    WHERE metric_type = p_metric_type
      AND created_at >= CURRENT_DATE - p_days
    GROUP BY DATE(created_at)
  ),
  with_lag AS (
    SELECT 
      metric_date,
      avg_metric,
      total_samples,
      LAG(avg_metric) OVER (ORDER BY metric_date) AS prev_avg
    FROM daily_metrics
  )
  SELECT 
    metric_date AS period_date,
    ROUND(avg_metric, 4) AS avg_value,
    total_samples::INTEGER AS sample_count,
    CASE 
      WHEN prev_avg IS NULL THEN 'stable'
      WHEN avg_metric > prev_avg * 1.02 THEN 'improving'
      WHEN avg_metric < prev_avg * 0.98 THEN 'declining'
      ELSE 'stable'
    END AS trend_direction
  FROM with_lag
  ORDER BY metric_date;
END;
$$;
