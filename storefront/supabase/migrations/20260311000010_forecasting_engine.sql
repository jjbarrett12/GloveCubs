-- Forecasting and Commercial Guidance Engine
-- Migration: 20260311000010_forecasting_engine.sql

-- ============================================================================
-- PHASE 1: SUPPLIER DETERIORATION FORECASTING
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.supplier_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL,
  forecast_type TEXT NOT NULL CHECK (
    forecast_type IN ('reliability_deterioration', 'review_load_risk', 'override_risk', 'freshness_risk')
  ),
  forecast_score NUMERIC(5, 4) NOT NULL,
  forecast_band TEXT NOT NULL CHECK (
    forecast_band IN ('high_risk', 'watch', 'stable', 'improving')
  ),
  predicted_direction TEXT NOT NULL CHECK (
    predicted_direction IN ('deteriorating', 'stable', 'improving', 'insufficient_signal')
  ),
  predicted_impact TEXT,
  reasoning TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  window_days INTEGER NOT NULL DEFAULT 30,
  sample_size INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
  forecast_as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.supplier_forecasts IS 'Forward-looking predictions of supplier reliability changes';

CREATE INDEX idx_supplier_forecasts_supplier ON catalogos.supplier_forecasts(supplier_id);
CREATE INDEX idx_supplier_forecasts_type ON catalogos.supplier_forecasts(forecast_type);
CREATE INDEX idx_supplier_forecasts_band ON catalogos.supplier_forecasts(forecast_band);
CREATE INDEX idx_supplier_forecasts_date ON catalogos.supplier_forecasts(forecast_as_of DESC);

-- ============================================================================
-- PHASE 2: PRICE VOLATILITY FORECASTING
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.price_volatility_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  offer_id UUID,
  volatility_score NUMERIC(5, 4) NOT NULL,
  volatility_band TEXT NOT NULL CHECK (
    volatility_band IN ('high_volatility', 'elevated', 'stable', 'low_signal')
  ),
  predicted_direction TEXT NOT NULL CHECK (
    predicted_direction IN ('increasing', 'stable', 'decreasing', 'insufficient_signal')
  ),
  predicted_risk TEXT,
  reasoning TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  window_days INTEGER NOT NULL DEFAULT 30,
  sample_size INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
  forecast_as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.price_volatility_forecasts IS 'Forward-looking predictions of price volatility';

CREATE INDEX idx_price_vol_forecasts_product ON catalogos.price_volatility_forecasts(product_id);
CREATE INDEX idx_price_vol_forecasts_offer ON catalogos.price_volatility_forecasts(offer_id);
CREATE INDEX idx_price_vol_forecasts_band ON catalogos.price_volatility_forecasts(volatility_band);
CREATE INDEX idx_price_vol_forecasts_date ON catalogos.price_volatility_forecasts(forecast_as_of DESC);

-- ============================================================================
-- PHASE 3: COMMERCIAL GUIDANCE RECOMMENDATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.commercial_guidance_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guidance_type TEXT NOT NULL CHECK (
    guidance_type IN ('rebid_now', 'rebid_soon', 're_source_supplier', 'monitor_closely', 'no_action')
  ),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  guidance_score NUMERIC(5, 4) NOT NULL,
  guidance_band TEXT NOT NULL CHECK (
    guidance_band IN ('urgent', 'high', 'moderate', 'low')
  ),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  window_days INTEGER NOT NULL DEFAULT 30,
  priority_score NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'acknowledged', 'actioned', 'dismissed', 'expired')
  ),
  actioned_at TIMESTAMPTZ,
  actioned_by UUID,
  action_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

COMMENT ON TABLE catalogos.commercial_guidance_recommendations IS 'Forward-looking commercial action recommendations';

CREATE INDEX idx_commercial_guidance_type ON catalogos.commercial_guidance_recommendations(guidance_type);
CREATE INDEX idx_commercial_guidance_entity ON catalogos.commercial_guidance_recommendations(entity_type, entity_id);
CREATE INDEX idx_commercial_guidance_band ON catalogos.commercial_guidance_recommendations(guidance_band);
CREATE INDEX idx_commercial_guidance_status ON catalogos.commercial_guidance_recommendations(status);
CREATE INDEX idx_commercial_guidance_priority ON catalogos.commercial_guidance_recommendations(priority_score DESC);

-- Prevent duplicate active guidance for same entity/type
CREATE UNIQUE INDEX idx_commercial_guidance_unique_active 
  ON catalogos.commercial_guidance_recommendations(entity_type, entity_id, guidance_type) 
  WHERE status = 'open';

-- ============================================================================
-- PHASE 4: COMMERCIAL RISK SCORES
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.commercial_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  risk_score NUMERIC(5, 4) NOT NULL,
  risk_band TEXT NOT NULL CHECK (
    risk_band IN ('critical', 'high', 'moderate', 'low')
  ),
  coverage_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  volatility_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  trust_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  acceptance_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  freshness_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  depth_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  reasoning TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  sample_size INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
  data_quality TEXT NOT NULL DEFAULT 'sufficient' CHECK (
    data_quality IN ('strong', 'sufficient', 'sparse', 'insufficient')
  ),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.commercial_risk_scores IS 'Commercial risk assessment for products and supplier relationships';

CREATE INDEX idx_commercial_risk_entity ON catalogos.commercial_risk_scores(entity_type, entity_id);
CREATE INDEX idx_commercial_risk_band ON catalogos.commercial_risk_scores(risk_band);
CREATE INDEX idx_commercial_risk_score ON catalogos.commercial_risk_scores(risk_score DESC);
CREATE INDEX idx_commercial_risk_date ON catalogos.commercial_risk_scores(calculated_at DESC);

-- ============================================================================
-- PHASE 6: FORECAST QUALITY METRICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.forecast_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL,
  metric_value NUMERIC(10, 4) NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.forecast_quality_metrics IS 'Quality metrics for forecasting accuracy';

CREATE INDEX idx_forecast_quality_type ON catalogos.forecast_quality_metrics(metric_type);
CREATE INDEX idx_forecast_quality_window ON catalogos.forecast_quality_metrics(window_start, window_end);

-- ============================================================================
-- VIEWS FOR OPS PLANNING
-- ============================================================================

-- Suppliers likely to deteriorate
CREATE OR REPLACE VIEW catalogos.suppliers_likely_to_deteriorate AS
SELECT 
  sf.supplier_id,
  sf.forecast_type,
  sf.forecast_score,
  sf.forecast_band,
  sf.predicted_direction,
  sf.predicted_impact,
  sf.reasoning,
  sf.sample_size,
  sf.confidence,
  sf.forecast_as_of
FROM catalogos.supplier_forecasts sf
WHERE sf.forecast_band IN ('high_risk', 'watch')
  AND sf.predicted_direction = 'deteriorating'
  AND sf.confidence >= 0.5
  AND sf.forecast_as_of = (
    SELECT MAX(forecast_as_of) 
    FROM catalogos.supplier_forecasts 
    WHERE supplier_id = sf.supplier_id AND forecast_type = sf.forecast_type
  )
ORDER BY sf.forecast_score DESC;

-- Products with rising price volatility
CREATE OR REPLACE VIEW catalogos.products_rising_volatility AS
SELECT 
  pvf.product_id,
  pvf.volatility_score,
  pvf.volatility_band,
  pvf.predicted_direction,
  pvf.predicted_risk,
  pvf.reasoning,
  pvf.sample_size,
  pvf.confidence,
  pvf.forecast_as_of
FROM catalogos.price_volatility_forecasts pvf
WHERE pvf.volatility_band IN ('high_volatility', 'elevated')
  AND pvf.predicted_direction = 'increasing'
  AND pvf.confidence >= 0.5
  AND pvf.forecast_as_of = (
    SELECT MAX(forecast_as_of) 
    FROM catalogos.price_volatility_forecasts 
    WHERE product_id = pvf.product_id
  )
ORDER BY pvf.volatility_score DESC;

-- Urgent rebid/re-source candidates
CREATE OR REPLACE VIEW catalogos.urgent_commercial_guidance AS
SELECT 
  cgr.*,
  EXTRACT(EPOCH FROM (now() - cgr.created_at)) / 86400 AS age_days
FROM catalogos.commercial_guidance_recommendations cgr
WHERE cgr.status = 'open'
  AND cgr.guidance_band IN ('urgent', 'high')
  AND cgr.guidance_type IN ('rebid_now', 'rebid_soon', 're_source_supplier')
ORDER BY 
  CASE cgr.guidance_band WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
  cgr.priority_score DESC;

-- Commercial risk leaderboard (highest risk first)
CREATE OR REPLACE VIEW catalogos.commercial_risk_leaderboard AS
SELECT 
  crs.entity_type,
  crs.entity_id,
  crs.risk_score,
  crs.risk_band,
  crs.coverage_score,
  crs.volatility_score,
  crs.trust_score,
  crs.freshness_score,
  crs.reasoning,
  crs.sample_size,
  crs.confidence,
  crs.data_quality,
  crs.calculated_at
FROM catalogos.commercial_risk_scores crs
WHERE crs.calculated_at = (
  SELECT MAX(calculated_at) 
  FROM catalogos.commercial_risk_scores 
  WHERE entity_type = crs.entity_type AND entity_id = crs.entity_id
)
ORDER BY crs.risk_score DESC;

-- Weakly covered products
CREATE OR REPLACE VIEW catalogos.weakly_covered_products AS
SELECT 
  crs.entity_id AS product_id,
  crs.risk_score,
  crs.risk_band,
  crs.coverage_score,
  crs.trust_score,
  crs.depth_score,
  crs.reasoning,
  crs.sample_size,
  crs.calculated_at
FROM catalogos.commercial_risk_scores crs
WHERE crs.entity_type = 'product'
  AND crs.coverage_score < 0.5
  AND crs.calculated_at = (
    SELECT MAX(calculated_at) 
    FROM catalogos.commercial_risk_scores 
    WHERE entity_type = 'product' AND entity_id = crs.entity_id
  )
ORDER BY crs.coverage_score ASC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get forecast summary for a supplier
CREATE OR REPLACE FUNCTION catalogos.get_supplier_forecast_summary(
  p_supplier_id UUID
)
RETURNS TABLE(
  forecast_type TEXT,
  forecast_band TEXT,
  predicted_direction TEXT,
  forecast_score NUMERIC,
  confidence NUMERIC,
  reasoning TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sf.forecast_type,
    sf.forecast_band,
    sf.predicted_direction,
    sf.forecast_score,
    sf.confidence,
    sf.reasoning
  FROM catalogos.supplier_forecasts sf
  WHERE sf.supplier_id = p_supplier_id
    AND sf.forecast_as_of = (
      SELECT MAX(forecast_as_of) 
      FROM catalogos.supplier_forecasts 
      WHERE supplier_id = p_supplier_id AND forecast_type = sf.forecast_type
    );
END;
$$;

-- Clean up old forecasts (keep 90 days)
CREATE OR REPLACE FUNCTION catalogos.cleanup_old_forecasts(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS TABLE(
  supplier_forecasts_deleted INTEGER,
  price_forecasts_deleted INTEGER,
  guidance_expired INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_supplier INTEGER;
  v_price INTEGER;
  v_guidance INTEGER;
BEGIN
  -- Delete old supplier forecasts
  DELETE FROM catalogos.supplier_forecasts
  WHERE forecast_as_of < now() - (p_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_supplier = ROW_COUNT;
  
  -- Delete old price forecasts
  DELETE FROM catalogos.price_volatility_forecasts
  WHERE forecast_as_of < now() - (p_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_price = ROW_COUNT;
  
  -- Expire old open guidance
  UPDATE catalogos.commercial_guidance_recommendations
  SET status = 'expired', resolved_at = now()
  WHERE status = 'open'
    AND created_at < now() - (p_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_guidance = ROW_COUNT;
  
  RETURN QUERY SELECT v_supplier, v_price, v_guidance;
END;
$$;
