-- Procurement Intelligence System
-- Migration: 20260311000008_procurement_intelligence.sql

-- ============================================================================
-- PHASE 1: SUPPLIER RELIABILITY SCORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.supplier_reliability_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL,
  reliability_score NUMERIC(5, 4) NOT NULL,
  reliability_band TEXT NOT NULL CHECK (reliability_band IN ('trusted', 'stable', 'watch', 'risky')),
  completeness_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  freshness_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  accuracy_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  stability_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  override_penalty NUMERIC(5, 4) NOT NULL DEFAULT 0,
  anomaly_penalty NUMERIC(5, 4) NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  factors JSONB DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.supplier_reliability_scores IS 'Tracks supplier reliability over time for procurement intelligence';

CREATE INDEX idx_supplier_reliability_supplier_id ON catalogos.supplier_reliability_scores(supplier_id);
CREATE INDEX idx_supplier_reliability_band ON catalogos.supplier_reliability_scores(reliability_band);
CREATE INDEX idx_supplier_reliability_score ON catalogos.supplier_reliability_scores(reliability_score DESC);
CREATE INDEX idx_supplier_reliability_calculated_at ON catalogos.supplier_reliability_scores(calculated_at DESC);

-- ============================================================================
-- PHASE 2: OFFER TRUST SCORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.offer_trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  product_id UUID,
  trust_score NUMERIC(5, 4) NOT NULL,
  trust_band TEXT NOT NULL CHECK (trust_band IN ('high_trust', 'medium_trust', 'review_sensitive', 'low_trust')),
  supplier_reliability_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  match_confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  pricing_confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  freshness_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  normalization_confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  anomaly_penalty NUMERIC(5, 4) NOT NULL DEFAULT 0,
  override_penalty NUMERIC(5, 4) NOT NULL DEFAULT 0,
  factors JSONB DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.offer_trust_scores IS 'Trust scoring for supplier offers to weight procurement decisions';

CREATE INDEX idx_offer_trust_offer_id ON catalogos.offer_trust_scores(offer_id);
CREATE INDEX idx_offer_trust_supplier_id ON catalogos.offer_trust_scores(supplier_id);
CREATE INDEX idx_offer_trust_product_id ON catalogos.offer_trust_scores(product_id);
CREATE INDEX idx_offer_trust_band ON catalogos.offer_trust_scores(trust_band);
CREATE INDEX idx_offer_trust_score ON catalogos.offer_trust_scores(trust_score DESC);

-- ============================================================================
-- PHASE 3: MARGIN OPPORTUNITY ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.margin_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  best_offer_id UUID,
  current_offer_id UUID,
  opportunity_score NUMERIC(5, 4) NOT NULL,
  opportunity_band TEXT NOT NULL CHECK (opportunity_band IN ('major', 'meaningful', 'minor', 'none')),
  estimated_savings_per_case NUMERIC(10, 2),
  estimated_savings_percent NUMERIC(5, 2),
  market_spread NUMERIC(5, 2),
  trust_adjusted_best_price NUMERIC(10, 2),
  current_price NUMERIC(10, 2),
  requires_review BOOLEAN NOT NULL DEFAULT false,
  review_reason TEXT,
  reasoning TEXT NOT NULL,
  factors JSONB DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.margin_opportunities IS 'Identifies margin opportunities across products';

CREATE INDEX idx_margin_opportunities_product_id ON catalogos.margin_opportunities(product_id);
CREATE INDEX idx_margin_opportunities_band ON catalogos.margin_opportunities(opportunity_band);
CREATE INDEX idx_margin_opportunities_score ON catalogos.margin_opportunities(opportunity_score DESC);
CREATE INDEX idx_margin_opportunities_requires_review ON catalogos.margin_opportunities(requires_review);

-- ============================================================================
-- PHASE 4: SUPPLIER RECOMMENDATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.supplier_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  offer_id UUID NOT NULL,
  recommended_rank INTEGER NOT NULL,
  recommendation_score NUMERIC(5, 4) NOT NULL,
  recommendation_band TEXT NOT NULL CHECK (recommendation_band IN ('strong_recommendation', 'acceptable', 'caution', 'do_not_prefer')),
  recommendation_reasoning TEXT NOT NULL,
  why_not_first TEXT,
  review_required BOOLEAN NOT NULL DEFAULT false,
  price NUMERIC(10, 2),
  trust_score NUMERIC(5, 4),
  factors JSONB DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.supplier_recommendations IS 'Ranked supplier recommendations for each product';

CREATE INDEX idx_supplier_recs_product_id ON catalogos.supplier_recommendations(product_id);
CREATE INDEX idx_supplier_recs_supplier_id ON catalogos.supplier_recommendations(supplier_id);
CREATE INDEX idx_supplier_recs_rank ON catalogos.supplier_recommendations(recommended_rank);
CREATE INDEX idx_supplier_recs_band ON catalogos.supplier_recommendations(recommendation_band);

-- ============================================================================
-- PHASE 5: PROCUREMENT ALERTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.procurement_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'margin_opportunity', 'supplier_risk', 'stale_offer', 
    'pricing_instability', 'trust_drop', 'review_load_spike', 
    'better_offer_detected'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'normal', 'low')),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  reasoning TEXT,
  recommended_action TEXT,
  priority_score NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.procurement_alerts IS 'Proactive alerts for procurement intelligence issues';

CREATE INDEX idx_procurement_alerts_type ON catalogos.procurement_alerts(alert_type);
CREATE INDEX idx_procurement_alerts_severity ON catalogos.procurement_alerts(severity);
CREATE INDEX idx_procurement_alerts_status ON catalogos.procurement_alerts(status);
CREATE INDEX idx_procurement_alerts_entity ON catalogos.procurement_alerts(entity_type, entity_id);
CREATE INDEX idx_procurement_alerts_priority ON catalogos.procurement_alerts(priority_score DESC);
CREATE INDEX idx_procurement_alerts_created ON catalogos.procurement_alerts(created_at DESC);

-- ============================================================================
-- PHASE 7: PROCUREMENT INTELLIGENCE METRICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.procurement_intelligence_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL,
  metric_value NUMERIC(10, 4) NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.procurement_intelligence_metrics IS 'Performance metrics for procurement intelligence system';

CREATE INDEX idx_procurement_metrics_type ON catalogos.procurement_intelligence_metrics(metric_type);
CREATE INDEX idx_procurement_metrics_calculated ON catalogos.procurement_intelligence_metrics(calculated_at DESC);

-- ============================================================================
-- VIEWS FOR OPERATIONAL DASHBOARDS
-- ============================================================================

-- Supplier Reliability Leaderboard
CREATE OR REPLACE VIEW catalogos.supplier_reliability_leaderboard AS
SELECT 
  srs.supplier_id,
  srs.reliability_score,
  srs.reliability_band,
  srs.completeness_score,
  srs.freshness_score,
  srs.accuracy_score,
  srs.stability_score,
  srs.sample_size,
  srs.calculated_at
FROM catalogos.supplier_reliability_scores srs
WHERE srs.calculated_at = (
  SELECT MAX(calculated_at) 
  FROM catalogos.supplier_reliability_scores 
  WHERE supplier_id = srs.supplier_id
)
ORDER BY srs.reliability_score DESC;

-- Low Trust Winning Offers
CREATE OR REPLACE VIEW catalogos.low_trust_winners AS
SELECT 
  ots.offer_id,
  ots.supplier_id,
  ots.product_id,
  ots.trust_score,
  ots.trust_band,
  ots.anomaly_penalty,
  ots.override_penalty,
  ots.calculated_at
FROM catalogos.offer_trust_scores ots
WHERE ots.trust_band IN ('review_sensitive', 'low_trust')
  AND ots.calculated_at = (
    SELECT MAX(calculated_at) 
    FROM catalogos.offer_trust_scores 
    WHERE offer_id = ots.offer_id
  )
ORDER BY ots.trust_score ASC;

-- Top Margin Opportunities
CREATE OR REPLACE VIEW catalogos.top_margin_opportunities AS
SELECT 
  mo.product_id,
  mo.best_offer_id,
  mo.opportunity_score,
  mo.opportunity_band,
  mo.estimated_savings_per_case,
  mo.estimated_savings_percent,
  mo.market_spread,
  mo.requires_review,
  mo.reasoning,
  mo.calculated_at
FROM catalogos.margin_opportunities mo
WHERE mo.opportunity_band IN ('major', 'meaningful')
  AND mo.calculated_at = (
    SELECT MAX(calculated_at) 
    FROM catalogos.margin_opportunities 
    WHERE product_id = mo.product_id
  )
ORDER BY mo.opportunity_score DESC;

-- Active Procurement Alerts
CREATE OR REPLACE VIEW catalogos.active_procurement_alerts AS
SELECT 
  pa.*,
  EXTRACT(EPOCH FROM (now() - pa.created_at)) / 3600 AS age_hours
FROM catalogos.procurement_alerts pa
WHERE pa.status IN ('open', 'acknowledged')
ORDER BY 
  CASE pa.severity 
    WHEN 'critical' THEN 1 
    WHEN 'high' THEN 2 
    WHEN 'normal' THEN 3 
    ELSE 4 
  END,
  pa.priority_score DESC,
  pa.created_at ASC;
