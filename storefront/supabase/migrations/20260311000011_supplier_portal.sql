-- Supplier Portal Schema
-- Migration: 20260311000011_supplier_portal.sql

-- ============================================================================
-- SUPPLIER USERS AND AUTHENTICATION
-- ============================================================================

-- Supplier portal users (separate from admin users)
CREATE TABLE IF NOT EXISTS catalogos.supplier_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor', 'viewer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.supplier_users IS 'Supplier portal user accounts';

CREATE INDEX idx_supplier_users_supplier ON catalogos.supplier_users(supplier_id);
CREATE INDEX idx_supplier_users_email ON catalogos.supplier_users(email);

-- Supplier sessions
CREATE TABLE IF NOT EXISTS catalogos.supplier_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES catalogos.supplier_users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.supplier_sessions IS 'Active supplier portal sessions';

CREATE INDEX idx_supplier_sessions_token ON catalogos.supplier_sessions(token_hash);
CREATE INDEX idx_supplier_sessions_expires ON catalogos.supplier_sessions(expires_at);

-- ============================================================================
-- SUPPLIER AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.supplier_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id),
  user_id UUID REFERENCES catalogos.supplier_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.supplier_audit_log IS 'Audit trail of all supplier portal actions';

CREATE INDEX idx_supplier_audit_supplier ON catalogos.supplier_audit_log(supplier_id);
CREATE INDEX idx_supplier_audit_user ON catalogos.supplier_audit_log(user_id);
CREATE INDEX idx_supplier_audit_action ON catalogos.supplier_audit_log(action);
CREATE INDEX idx_supplier_audit_date ON catalogos.supplier_audit_log(created_at DESC);

-- ============================================================================
-- SUPPLIER ALERTS (PORTAL-SPECIFIC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.supplier_portal_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id),
  alert_type TEXT NOT NULL CHECK (
    alert_type IN (
      'reliability_deterioration',
      'stale_offers',
      'price_volatility',
      'lost_recommendation_rank',
      'low_trust_offers',
      'feed_quality_issue',
      'anomaly_detected',
      'competitive_pressure'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);

COMMENT ON TABLE catalogos.supplier_portal_alerts IS 'Alerts shown in supplier portal';

CREATE INDEX idx_portal_alerts_supplier ON catalogos.supplier_portal_alerts(supplier_id);
CREATE INDEX idx_portal_alerts_type ON catalogos.supplier_portal_alerts(alert_type);
CREATE INDEX idx_portal_alerts_unread ON catalogos.supplier_portal_alerts(supplier_id, is_read) WHERE NOT is_read;

-- ============================================================================
-- SUPPLIER METRICS CACHE (FOR DASHBOARD)
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.supplier_portal_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id),
  metric_type TEXT NOT NULL,
  metric_value NUMERIC(10, 4) NOT NULL,
  metric_band TEXT,
  comparison_value NUMERIC(10, 4),
  comparison_label TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.supplier_portal_metrics IS 'Cached metrics for supplier portal dashboard';

CREATE INDEX idx_portal_metrics_supplier ON catalogos.supplier_portal_metrics(supplier_id);
CREATE INDEX idx_portal_metrics_type ON catalogos.supplier_portal_metrics(metric_type);
CREATE UNIQUE INDEX idx_portal_metrics_latest ON catalogos.supplier_portal_metrics(supplier_id, metric_type, calculated_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all supplier portal tables
ALTER TABLE catalogos.supplier_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_portal_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_portal_metrics ENABLE ROW LEVEL SECURITY;

-- Create a function to get current supplier_id from session
CREATE OR REPLACE FUNCTION catalogos.get_current_supplier_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supplier_id UUID;
BEGIN
  -- Get supplier_id from current session variable (set by application)
  v_supplier_id := current_setting('app.current_supplier_id', true)::UUID;
  RETURN v_supplier_id;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Supplier users: can only see users from own supplier
CREATE POLICY supplier_users_select ON catalogos.supplier_users
  FOR SELECT USING (supplier_id = catalogos.get_current_supplier_id());

CREATE POLICY supplier_users_insert ON catalogos.supplier_users
  FOR INSERT WITH CHECK (supplier_id = catalogos.get_current_supplier_id());

CREATE POLICY supplier_users_update ON catalogos.supplier_users
  FOR UPDATE USING (supplier_id = catalogos.get_current_supplier_id());

-- Supplier sessions: can only see own sessions
CREATE POLICY supplier_sessions_select ON catalogos.supplier_sessions
  FOR SELECT USING (supplier_id = catalogos.get_current_supplier_id());

CREATE POLICY supplier_sessions_delete ON catalogos.supplier_sessions
  FOR DELETE USING (supplier_id = catalogos.get_current_supplier_id());

-- Audit log: can only see own supplier's audit log
CREATE POLICY supplier_audit_select ON catalogos.supplier_audit_log
  FOR SELECT USING (supplier_id = catalogos.get_current_supplier_id());

-- Alerts: can only see own supplier's alerts
CREATE POLICY supplier_alerts_select ON catalogos.supplier_portal_alerts
  FOR SELECT USING (supplier_id = catalogos.get_current_supplier_id());

CREATE POLICY supplier_alerts_update ON catalogos.supplier_portal_alerts
  FOR UPDATE USING (supplier_id = catalogos.get_current_supplier_id());

-- Metrics: can only see own supplier's metrics
CREATE POLICY supplier_metrics_select ON catalogos.supplier_portal_metrics
  FOR SELECT USING (supplier_id = catalogos.get_current_supplier_id());

-- ============================================================================
-- RLS FOR EXISTING TABLES (SUPPLIER SCOPED ACCESS)
-- ============================================================================

-- Add RLS policy for supplier_offers (suppliers can only see/edit their own)
CREATE POLICY supplier_offers_portal_select ON catalogos.supplier_offers
  FOR SELECT USING (supplier_id = catalogos.get_current_supplier_id());

CREATE POLICY supplier_offers_portal_insert ON catalogos.supplier_offers
  FOR INSERT WITH CHECK (supplier_id = catalogos.get_current_supplier_id());

CREATE POLICY supplier_offers_portal_update ON catalogos.supplier_offers
  FOR UPDATE USING (supplier_id = catalogos.get_current_supplier_id());

-- Supplier reliability scores: read-only access to own scores
CREATE POLICY supplier_reliability_portal_select ON catalogos.supplier_reliability_scores
  FOR SELECT USING (supplier_id = catalogos.get_current_supplier_id());

-- Offer trust scores: read-only access for offers they own
-- (would need a join, handled in application layer instead)

-- ============================================================================
-- VIEWS FOR SUPPLIER PORTAL
-- ============================================================================

-- Supplier dashboard summary
CREATE OR REPLACE VIEW catalogos.supplier_dashboard_summary AS
SELECT 
  s.id AS supplier_id,
  s.name AS supplier_name,
  (SELECT reliability_score FROM catalogos.supplier_reliability_scores 
   WHERE supplier_id = s.id ORDER BY calculated_at DESC LIMIT 1) AS reliability_score,
  (SELECT reliability_band FROM catalogos.supplier_reliability_scores 
   WHERE supplier_id = s.id ORDER BY calculated_at DESC LIMIT 1) AS reliability_band,
  (SELECT AVG(trust_score) FROM catalogos.offer_trust_scores 
   WHERE supplier_id = s.id 
   AND calculated_at > now() - INTERVAL '30 days') AS avg_trust_score,
  (SELECT COUNT(*) FROM catalogos.supplier_offers 
   WHERE supplier_id = s.id AND is_active = true) AS active_offer_count,
  (SELECT COUNT(*) FROM catalogos.supplier_offers 
   WHERE supplier_id = s.id AND is_active = true 
   AND updated_at < now() - INTERVAL '30 days') AS stale_offer_count,
  (SELECT COUNT(*) FROM catalogos.supplier_portal_alerts 
   WHERE supplier_id = s.id AND NOT is_read AND NOT is_dismissed) AS unread_alert_count
FROM catalogos.suppliers s
WHERE s.is_active = true;

-- Supplier offer health
CREATE OR REPLACE VIEW catalogos.supplier_offer_health AS
SELECT 
  so.id AS offer_id,
  so.supplier_id,
  so.product_id,
  so.price,
  so.is_active,
  so.updated_at,
  EXTRACT(EPOCH FROM (now() - so.updated_at)) / 86400 AS days_since_update,
  CASE 
    WHEN so.updated_at > now() - INTERVAL '7 days' THEN 'fresh'
    WHEN so.updated_at > now() - INTERVAL '30 days' THEN 'aging'
    ELSE 'stale'
  END AS freshness_status,
  ots.trust_score,
  ots.trust_band
FROM catalogos.supplier_offers so
LEFT JOIN LATERAL (
  SELECT trust_score, trust_band 
  FROM catalogos.offer_trust_scores 
  WHERE offer_id = so.id 
  ORDER BY calculated_at DESC 
  LIMIT 1
) ots ON true
WHERE so.is_active = true;

-- Supplier competitiveness
CREATE OR REPLACE VIEW catalogos.supplier_competitiveness AS
SELECT 
  sr.supplier_id,
  sr.product_id,
  sr.recommended_rank,
  sr.recommendation_score,
  sr.recommendation_band,
  sr.recommendation_reasoning,
  so.price AS supplier_price,
  (SELECT AVG(price) FROM catalogos.supplier_offers 
   WHERE product_id = sr.product_id AND is_active = true) AS market_avg_price,
  (SELECT MIN(price) FROM catalogos.supplier_offers 
   WHERE product_id = sr.product_id AND is_active = true) AS market_min_price,
  sr.calculated_at
FROM catalogos.supplier_recommendations sr
JOIN catalogos.supplier_offers so ON sr.offer_id = so.id
WHERE sr.calculated_at = (
  SELECT MAX(calculated_at) 
  FROM catalogos.supplier_recommendations 
  WHERE supplier_id = sr.supplier_id AND product_id = sr.product_id
);

-- ============================================================================
-- FUNCTIONS FOR SUPPLIER PORTAL
-- ============================================================================

-- Calculate supplier's price percentile
CREATE OR REPLACE FUNCTION catalogos.get_supplier_price_percentile(
  p_supplier_id UUID,
  p_product_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_supplier_price NUMERIC;
  v_percentile NUMERIC;
BEGIN
  -- Get supplier's price
  SELECT price INTO v_supplier_price
  FROM catalogos.supplier_offers
  WHERE supplier_id = p_supplier_id AND product_id = p_product_id AND is_active = true
  LIMIT 1;
  
  IF v_supplier_price IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Calculate percentile (0 = cheapest, 100 = most expensive)
  SELECT 
    100.0 * (COUNT(*) FILTER (WHERE price < v_supplier_price)) / NULLIF(COUNT(*), 0)
  INTO v_percentile
  FROM catalogos.supplier_offers
  WHERE product_id = p_product_id AND is_active = true;
  
  RETURN v_percentile;
END;
$$;

-- Get supplier's recommendation rank distribution
CREATE OR REPLACE FUNCTION catalogos.get_supplier_rank_distribution(
  p_supplier_id UUID,
  p_window_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  rank_position INTEGER,
  count BIGINT,
  percentage NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH ranks AS (
    SELECT recommended_rank
    FROM catalogos.supplier_recommendations
    WHERE supplier_id = p_supplier_id
      AND calculated_at > now() - (p_window_days || ' days')::INTERVAL
  ),
  total AS (SELECT COUNT(*) AS cnt FROM ranks)
  SELECT 
    r.recommended_rank::INTEGER,
    COUNT(*)::BIGINT,
    ROUND(100.0 * COUNT(*) / NULLIF(t.cnt, 0), 1)
  FROM ranks r, total t
  GROUP BY r.recommended_rank, t.cnt
  ORDER BY r.recommended_rank;
END;
$$;

-- Generate supplier portal alerts
CREATE OR REPLACE FUNCTION catalogos.generate_supplier_portal_alerts(
  p_supplier_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_reliability RECORD;
  v_stale_count INTEGER;
BEGIN
  -- Check reliability deterioration
  SELECT reliability_score, reliability_band
  INTO v_reliability
  FROM catalogos.supplier_reliability_scores
  WHERE supplier_id = p_supplier_id
  ORDER BY calculated_at DESC
  LIMIT 1;
  
  IF v_reliability.reliability_band IN ('watch', 'risky') THEN
    INSERT INTO catalogos.supplier_portal_alerts (
      supplier_id, alert_type, severity, title, message, details
    ) VALUES (
      p_supplier_id,
      'reliability_deterioration',
      CASE WHEN v_reliability.reliability_band = 'risky' THEN 'critical' ELSE 'warning' END,
      'Reliability Score Needs Attention',
      'Your reliability score has dropped to ' || v_reliability.reliability_band || '. Improve data quality to increase rankings.',
      jsonb_build_object('score', v_reliability.reliability_score, 'band', v_reliability.reliability_band)
    )
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END IF;
  
  -- Check stale offers
  SELECT COUNT(*) INTO v_stale_count
  FROM catalogos.supplier_offers
  WHERE supplier_id = p_supplier_id
    AND is_active = true
    AND updated_at < now() - INTERVAL '30 days';
    
  IF v_stale_count > 0 THEN
    INSERT INTO catalogos.supplier_portal_alerts (
      supplier_id, alert_type, severity, title, message, details
    ) VALUES (
      p_supplier_id,
      'stale_offers',
      CASE WHEN v_stale_count > 10 THEN 'critical' ELSE 'warning' END,
      v_stale_count || ' Stale Offers Detected',
      'Update your pricing to maintain competitive rankings.',
      jsonb_build_object('stale_count', v_stale_count)
    )
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END IF;
  
  RETURN v_count;
END;
$$;

-- Clean up expired sessions
CREATE OR REPLACE FUNCTION catalogos.cleanup_expired_supplier_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM catalogos.supplier_sessions
  WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
