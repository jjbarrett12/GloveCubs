-- =============================================================================
-- Pipeline Metrics - Aggregate tracking for production observability
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.pipeline_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  metric_type TEXT NOT NULL, -- 'daily_summary', 'hourly_summary', 'job_type_summary'
  metric_key TEXT NOT NULL, -- job_type or 'all'
  
  -- Volume metrics
  jobs_completed INT NOT NULL DEFAULT 0,
  jobs_failed INT NOT NULL DEFAULT 0,
  jobs_blocked INT NOT NULL DEFAULT 0,
  
  -- Processing metrics
  products_processed INT NOT NULL DEFAULT 0,
  products_normalized INT NOT NULL DEFAULT 0,
  products_matched INT NOT NULL DEFAULT 0,
  offers_created INT NOT NULL DEFAULT 0,
  offers_updated INT NOT NULL DEFAULT 0,
  
  -- Review metrics
  review_items_created INT NOT NULL DEFAULT 0,
  matches_auto_approved INT NOT NULL DEFAULT 0,
  matches_sent_to_review INT NOT NULL DEFAULT 0,
  
  -- Pricing metrics
  pricing_checks_run INT NOT NULL DEFAULT 0,
  pricing_anomalies_detected INT NOT NULL DEFAULT 0,
  price_changes_recommended INT NOT NULL DEFAULT 0,
  
  -- Quality metrics
  safe_fixes_applied INT NOT NULL DEFAULT 0,
  safe_fixes_skipped INT NOT NULL DEFAULT 0,
  
  -- Duration metrics
  total_duration_ms BIGINT NOT NULL DEFAULT 0,
  avg_duration_ms INT NOT NULL DEFAULT 0,
  max_duration_ms INT NOT NULL DEFAULT 0,
  
  -- Error tracking
  error_count INT NOT NULL DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  
  -- Metadata
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (run_date, metric_type, metric_key)
);

CREATE INDEX idx_pipeline_metrics_date ON catalogos.pipeline_metrics (run_date DESC);
CREATE INDEX idx_pipeline_metrics_type ON catalogos.pipeline_metrics (metric_type, metric_key);

-- =============================================================================
-- Function to aggregate daily metrics from job_runs
-- =============================================================================

CREATE OR REPLACE FUNCTION catalogos.compute_daily_metrics(p_date DATE DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_type TEXT;
BEGIN
  -- Compute per-job-type metrics
  FOR v_job_type IN 
    SELECT DISTINCT job_type FROM job_runs 
    WHERE DATE(started_at) = p_date
  LOOP
    INSERT INTO catalogos.pipeline_metrics (
      run_date, metric_type, metric_key,
      jobs_completed, jobs_failed, jobs_blocked,
      total_duration_ms, avg_duration_ms, max_duration_ms,
      error_count
    )
    SELECT 
      p_date,
      'job_type_summary',
      v_job_type,
      COUNT(*) FILTER (WHERE status = 'completed'),
      COUNT(*) FILTER (WHERE status = 'failed'),
      COUNT(*) FILTER (WHERE status = 'blocked'),
      COALESCE(SUM(duration_ms), 0),
      COALESCE(AVG(duration_ms)::INT, 0),
      COALESCE(MAX(duration_ms), 0),
      COUNT(*) FILTER (WHERE error_message IS NOT NULL)
    FROM job_runs
    WHERE DATE(started_at) = p_date
      AND job_type = v_job_type
    ON CONFLICT (run_date, metric_type, metric_key) DO UPDATE SET
      jobs_completed = EXCLUDED.jobs_completed,
      jobs_failed = EXCLUDED.jobs_failed,
      jobs_blocked = EXCLUDED.jobs_blocked,
      total_duration_ms = EXCLUDED.total_duration_ms,
      avg_duration_ms = EXCLUDED.avg_duration_ms,
      max_duration_ms = EXCLUDED.max_duration_ms,
      error_count = EXCLUDED.error_count,
      computed_at = NOW();
  END LOOP;

  -- Compute overall daily summary
  INSERT INTO catalogos.pipeline_metrics (
    run_date, metric_type, metric_key,
    jobs_completed, jobs_failed, jobs_blocked,
    total_duration_ms, avg_duration_ms, max_duration_ms,
    error_count
  )
  SELECT 
    p_date,
    'daily_summary',
    'all',
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'blocked'),
    COALESCE(SUM(duration_ms), 0),
    COALESCE(AVG(duration_ms)::INT, 0),
    COALESCE(MAX(duration_ms), 0),
    COUNT(*) FILTER (WHERE error_message IS NOT NULL)
  FROM job_runs
  WHERE DATE(started_at) = p_date
  ON CONFLICT (run_date, metric_type, metric_key) DO UPDATE SET
    jobs_completed = EXCLUDED.jobs_completed,
    jobs_failed = EXCLUDED.jobs_failed,
    jobs_blocked = EXCLUDED.jobs_blocked,
    total_duration_ms = EXCLUDED.total_duration_ms,
    avg_duration_ms = EXCLUDED.avg_duration_ms,
    max_duration_ms = EXCLUDED.max_duration_ms,
    error_count = EXCLUDED.error_count,
    computed_at = NOW();
    
  -- Update processing metrics from job outputs
  UPDATE catalogos.pipeline_metrics pm
  SET
    products_processed = COALESCE((
      SELECT SUM((output_payload->>'products_processed')::INT)
      FROM job_runs jr
      WHERE DATE(jr.started_at) = p_date
        AND jr.job_type = pm.metric_key
        AND jr.output_payload ? 'products_processed'
    ), 0),
    products_normalized = COALESCE((
      SELECT SUM((output_payload->>'normalized_count')::INT)
      FROM job_runs jr
      WHERE DATE(jr.started_at) = p_date
        AND jr.job_type = pm.metric_key
        AND jr.output_payload ? 'normalized_count'
    ), 0),
    review_items_created = COALESCE((
      SELECT SUM((output_payload->>'review_items_created')::INT)
      FROM job_runs jr
      WHERE DATE(jr.started_at) = p_date
        AND jr.job_type = pm.metric_key
        AND jr.output_payload ? 'review_items_created'
    ), 0),
    computed_at = NOW()
  WHERE pm.run_date = p_date
    AND pm.metric_type = 'job_type_summary';
END;
$$;

COMMENT ON TABLE catalogos.pipeline_metrics IS 
'Aggregate pipeline metrics for observability. Computed from job_runs and persisted for historical analysis.';
