-- Recommendation Outcomes and Closed-Loop Learning
-- Migration: 20260311000009_recommendation_outcomes.sql

-- ============================================================================
-- PHASE 1: RECOMMENDATION OUTCOMES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.recommendation_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL,
  product_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  offer_id UUID NOT NULL,
  
  -- Outcome tracking
  outcome_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    outcome_status IN ('pending', 'accepted', 'rejected', 'superseded', 'expired', 'partially_realized')
  ),
  decision_source TEXT CHECK (
    decision_source IN ('operator', 'system', 'imported_order_data', 'manual_review')
  ),
  
  -- Acceptance/Rejection
  accepted BOOLEAN,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- What was actually selected (may differ from recommendation)
  selected_supplier_id UUID,
  selected_offer_id UUID,
  selected_price NUMERIC(10, 2),
  
  -- Recommendation details at time of recommendation
  recommended_price NUMERIC(10, 2),
  recommended_rank INTEGER,
  recommended_trust_score NUMERIC(5, 4),
  recommended_reasoning TEXT,
  
  -- Savings tracking
  price_delta NUMERIC(10, 2),
  trust_delta NUMERIC(5, 4),
  estimated_savings NUMERIC(10, 2),
  realized_savings NUMERIC(10, 2),
  realized_savings_percent NUMERIC(5, 2),
  savings_confidence TEXT CHECK (savings_confidence IN ('confirmed', 'estimated', 'unknown')),
  
  -- Supersession tracking
  superseded_by_id UUID REFERENCES catalogos.recommendation_outcomes(id),
  supersedes_id UUID REFERENCES catalogos.recommendation_outcomes(id),
  
  -- Audit
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.recommendation_outcomes IS 'Tracks actual outcomes of supplier recommendations for closed-loop learning';

-- Indexes for common queries
CREATE INDEX idx_rec_outcomes_recommendation ON catalogos.recommendation_outcomes(recommendation_id);
CREATE INDEX idx_rec_outcomes_product ON catalogos.recommendation_outcomes(product_id);
CREATE INDEX idx_rec_outcomes_supplier ON catalogos.recommendation_outcomes(supplier_id);
CREATE INDEX idx_rec_outcomes_status ON catalogos.recommendation_outcomes(outcome_status);
CREATE INDEX idx_rec_outcomes_accepted ON catalogos.recommendation_outcomes(accepted) WHERE accepted IS NOT NULL;
CREATE INDEX idx_rec_outcomes_created ON catalogos.recommendation_outcomes(created_at DESC);
CREATE INDEX idx_rec_outcomes_pending_expiry ON catalogos.recommendation_outcomes(created_at) 
  WHERE outcome_status = 'pending';

-- Unique constraint: one terminal outcome per recommendation
CREATE UNIQUE INDEX idx_rec_outcomes_unique_terminal 
  ON catalogos.recommendation_outcomes(recommendation_id) 
  WHERE outcome_status IN ('accepted', 'rejected', 'expired');

-- ============================================================================
-- PHASE 4: RECOMMENDATION QUALITY METRICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.recommendation_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL,
  metric_value NUMERIC(10, 4) NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.recommendation_quality_metrics IS 'Quality metrics for recommendations based on actual outcomes';

CREATE INDEX idx_rec_quality_type ON catalogos.recommendation_quality_metrics(metric_type);
CREATE INDEX idx_rec_quality_window ON catalogos.recommendation_quality_metrics(window_start, window_end);

-- ============================================================================
-- PHASE 5: FEEDBACK ADJUSTMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.scoring_feedback_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_type TEXT NOT NULL CHECK (
    adjustment_type IN (
      'supplier_reliability_penalty',
      'supplier_reliability_bonus',
      'offer_trust_penalty',
      'offer_trust_bonus',
      'recommendation_weight_adjustment',
      'alert_precision_adjustment',
      'opportunity_confidence_adjustment'
    )
  ),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  adjustment_value NUMERIC(5, 4) NOT NULL,
  reason TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.scoring_feedback_adjustments IS 'Learned adjustments to scoring based on outcome feedback';

CREATE INDEX idx_feedback_adj_type ON catalogos.scoring_feedback_adjustments(adjustment_type);
CREATE INDEX idx_feedback_adj_entity ON catalogos.scoring_feedback_adjustments(entity_type, entity_id);
CREATE INDEX idx_feedback_adj_active ON catalogos.scoring_feedback_adjustments(effective_from, effective_until)
  WHERE applied = false;

-- ============================================================================
-- VIEWS FOR OPERATIONAL VISIBILITY
-- ============================================================================

-- Accepted recommendations with realized outcomes
CREATE OR REPLACE VIEW catalogos.accepted_recommendations AS
SELECT 
  ro.id,
  ro.recommendation_id,
  ro.product_id,
  ro.supplier_id,
  ro.offer_id,
  ro.decision_source,
  ro.accepted_at,
  ro.selected_supplier_id,
  ro.selected_offer_id,
  ro.recommended_price,
  ro.selected_price,
  ro.estimated_savings,
  ro.realized_savings,
  ro.realized_savings_percent,
  ro.savings_confidence,
  ro.recommended_trust_score,
  ro.recommended_reasoning,
  ro.created_at
FROM catalogos.recommendation_outcomes ro
WHERE ro.outcome_status = 'accepted'
ORDER BY ro.accepted_at DESC;

-- Rejected recommendations with reasons
CREATE OR REPLACE VIEW catalogos.rejected_recommendations AS
SELECT 
  ro.id,
  ro.recommendation_id,
  ro.product_id,
  ro.supplier_id,
  ro.offer_id,
  ro.decision_source,
  ro.rejected_at,
  ro.rejection_reason,
  ro.selected_supplier_id,
  ro.selected_offer_id,
  ro.recommended_price,
  ro.selected_price,
  ro.recommended_trust_score,
  ro.price_delta,
  ro.created_at
FROM catalogos.recommendation_outcomes ro
WHERE ro.outcome_status = 'rejected'
ORDER BY ro.rejected_at DESC;

-- Pending recommendations nearing expiration (older than 7 days)
CREATE OR REPLACE VIEW catalogos.expiring_recommendations AS
SELECT 
  ro.id,
  ro.recommendation_id,
  ro.product_id,
  ro.supplier_id,
  ro.offer_id,
  ro.recommended_price,
  ro.recommended_trust_score,
  ro.estimated_savings,
  ro.created_at,
  EXTRACT(EPOCH FROM (now() - ro.created_at)) / 86400 AS age_days
FROM catalogos.recommendation_outcomes ro
WHERE ro.outcome_status = 'pending'
  AND ro.created_at < now() - INTERVAL '7 days'
ORDER BY ro.created_at ASC;

-- Superseded recommendations
CREATE OR REPLACE VIEW catalogos.superseded_recommendations AS
SELECT 
  ro.id,
  ro.recommendation_id,
  ro.product_id,
  ro.supplier_id,
  ro.superseded_by_id,
  ro.recommended_price,
  ro.estimated_savings,
  ro.created_at,
  ro.updated_at
FROM catalogos.recommendation_outcomes ro
WHERE ro.outcome_status = 'superseded'
ORDER BY ro.updated_at DESC;

-- Top accepted suppliers (by acceptance count)
CREATE OR REPLACE VIEW catalogos.top_accepted_suppliers AS
SELECT 
  ro.supplier_id,
  COUNT(*) AS acceptance_count,
  AVG(ro.realized_savings) AS avg_realized_savings,
  AVG(ro.recommended_trust_score) AS avg_trust_score,
  SUM(ro.realized_savings) AS total_realized_savings
FROM catalogos.recommendation_outcomes ro
WHERE ro.outcome_status = 'accepted'
  AND ro.accepted_at >= now() - INTERVAL '30 days'
GROUP BY ro.supplier_id
ORDER BY acceptance_count DESC;

-- Most overridden recommendations (suppliers whose recommendations get rejected)
CREATE OR REPLACE VIEW catalogos.most_overridden_suppliers AS
SELECT 
  ro.supplier_id,
  COUNT(*) FILTER (WHERE ro.outcome_status = 'rejected') AS rejection_count,
  COUNT(*) FILTER (WHERE ro.outcome_status = 'accepted') AS acceptance_count,
  COUNT(*) AS total_recommendations,
  ROUND(
    COUNT(*) FILTER (WHERE ro.outcome_status = 'rejected')::NUMERIC / 
    NULLIF(COUNT(*), 0) * 100, 
    2
  ) AS rejection_rate_percent
FROM catalogos.recommendation_outcomes ro
WHERE ro.created_at >= now() - INTERVAL '30 days'
GROUP BY ro.supplier_id
HAVING COUNT(*) FILTER (WHERE ro.outcome_status = 'rejected') > 0
ORDER BY rejection_count DESC;

-- Realized vs estimated savings comparison
CREATE OR REPLACE VIEW catalogos.savings_accuracy AS
SELECT 
  ro.id,
  ro.product_id,
  ro.supplier_id,
  ro.estimated_savings,
  ro.realized_savings,
  ro.realized_savings - ro.estimated_savings AS savings_error,
  CASE 
    WHEN ro.estimated_savings > 0 THEN 
      ROUND(((ro.realized_savings - ro.estimated_savings) / ro.estimated_savings) * 100, 2)
    ELSE NULL
  END AS savings_error_percent,
  ro.savings_confidence,
  ro.accepted_at
FROM catalogos.recommendation_outcomes ro
WHERE ro.outcome_status = 'accepted'
  AND ro.realized_savings IS NOT NULL
  AND ro.estimated_savings IS NOT NULL
ORDER BY ABS(ro.realized_savings - ro.estimated_savings) DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to expire stale pending recommendations
CREATE OR REPLACE FUNCTION catalogos.expire_stale_recommendations(
  p_expiry_days INTEGER DEFAULT 14
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  UPDATE catalogos.recommendation_outcomes
  SET 
    outcome_status = 'expired',
    updated_at = now(),
    notes = COALESCE(notes || ' | ', '') || 'Auto-expired after ' || p_expiry_days || ' days'
  WHERE outcome_status = 'pending'
    AND created_at < now() - (p_expiry_days || ' days')::INTERVAL;
    
  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN v_expired_count;
END;
$$;

-- Function to get outcome summary stats
CREATE OR REPLACE FUNCTION catalogos.get_outcome_summary(
  p_window_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  total_outcomes BIGINT,
  accepted_count BIGINT,
  rejected_count BIGINT,
  expired_count BIGINT,
  superseded_count BIGINT,
  pending_count BIGINT,
  acceptance_rate NUMERIC,
  total_estimated_savings NUMERIC,
  total_realized_savings NUMERIC,
  savings_capture_rate NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_outcomes,
    COUNT(*) FILTER (WHERE ro.outcome_status = 'accepted')::BIGINT AS accepted_count,
    COUNT(*) FILTER (WHERE ro.outcome_status = 'rejected')::BIGINT AS rejected_count,
    COUNT(*) FILTER (WHERE ro.outcome_status = 'expired')::BIGINT AS expired_count,
    COUNT(*) FILTER (WHERE ro.outcome_status = 'superseded')::BIGINT AS superseded_count,
    COUNT(*) FILTER (WHERE ro.outcome_status = 'pending')::BIGINT AS pending_count,
    ROUND(
      COUNT(*) FILTER (WHERE ro.outcome_status = 'accepted')::NUMERIC / 
      NULLIF(COUNT(*) FILTER (WHERE ro.outcome_status IN ('accepted', 'rejected')), 0) * 100,
      2
    ) AS acceptance_rate,
    COALESCE(SUM(ro.estimated_savings) FILTER (WHERE ro.outcome_status = 'accepted'), 0) AS total_estimated_savings,
    COALESCE(SUM(ro.realized_savings) FILTER (WHERE ro.outcome_status = 'accepted' AND ro.realized_savings IS NOT NULL), 0) AS total_realized_savings,
    ROUND(
      COALESCE(SUM(ro.realized_savings) FILTER (WHERE ro.outcome_status = 'accepted' AND ro.realized_savings IS NOT NULL), 0) /
      NULLIF(COALESCE(SUM(ro.estimated_savings) FILTER (WHERE ro.outcome_status = 'accepted'), 0), 0) * 100,
      2
    ) AS savings_capture_rate
  FROM catalogos.recommendation_outcomes ro
  WHERE ro.created_at >= now() - (p_window_days || ' days')::INTERVAL;
END;
$$;
