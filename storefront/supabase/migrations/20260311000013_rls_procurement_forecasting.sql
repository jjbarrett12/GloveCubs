-- =============================================================================
-- RLS for Procurement Intelligence and Forecasting Tables
-- Migration: 20260311000013_rls_procurement_forecasting.sql
-- 
-- CRITICAL: This migration fixes launch blockers LB-1 and LB-2 identified
-- in the production readiness audit.
--
-- These tables contain sensitive competitive intelligence and must be
-- restricted to service_role and admin users only.
-- =============================================================================

-- ============================================================================
-- PART 1: PROCUREMENT INTELLIGENCE TABLES
-- ============================================================================

-- Enable RLS on all procurement intelligence tables
ALTER TABLE catalogos.supplier_reliability_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.offer_trust_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.margin_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.procurement_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.procurement_intelligence_metrics ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for procurement intelligence tables
-- These tables contain competitive intelligence that suppliers should not see

CREATE POLICY "admin_only_supplier_reliability_scores"
  ON catalogos.supplier_reliability_scores FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_offer_trust_scores"
  ON catalogos.offer_trust_scores FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_margin_opportunities"
  ON catalogos.margin_opportunities FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_supplier_recommendations"
  ON catalogos.supplier_recommendations FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_procurement_alerts"
  ON catalogos.procurement_alerts FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_procurement_intelligence_metrics"
  ON catalogos.procurement_intelligence_metrics FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

-- ============================================================================
-- PART 2: FORECASTING ENGINE TABLES
-- ============================================================================

-- Enable RLS on all forecasting tables
ALTER TABLE catalogos.supplier_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.price_volatility_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.commercial_guidance_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.commercial_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.forecast_quality_metrics ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for forecasting tables

CREATE POLICY "admin_only_supplier_forecasts"
  ON catalogos.supplier_forecasts FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_price_volatility_forecasts"
  ON catalogos.price_volatility_forecasts FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_commercial_guidance"
  ON catalogos.commercial_guidance_recommendations FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_commercial_risk_scores"
  ON catalogos.commercial_risk_scores FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_forecast_quality_metrics"
  ON catalogos.forecast_quality_metrics FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

-- ============================================================================
-- PART 3: CLOSED-LOOP LEARNING TABLES
-- ============================================================================

-- Enable RLS on recommendation outcomes tables
ALTER TABLE catalogos.recommendation_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.recommendation_quality_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.scoring_feedback_adjustments ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for closed-loop learning
-- Suppliers must NOT be able to manipulate their own outcome records

CREATE POLICY "admin_only_recommendation_outcomes"
  ON catalogos.recommendation_outcomes FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_recommendation_quality_metrics"
  ON catalogos.recommendation_quality_metrics FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_only_scoring_feedback_adjustments"
  ON catalogos.scoring_feedback_adjustments FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

-- ============================================================================
-- PART 4: SUPPLIER PORTAL READ-ONLY ACCESS FOR OWN DATA
-- ============================================================================

-- Suppliers CAN see their OWN reliability scores (read-only) via portal
-- This was already added in supplier_portal migration, verify it exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_reliability_scores' 
    AND policyname = 'supplier_reliability_portal_select'
  ) THEN
    CREATE POLICY "supplier_reliability_portal_select" 
      ON catalogos.supplier_reliability_scores
      FOR SELECT 
      USING (supplier_id = catalogos.get_current_supplier_id());
  END IF;
END $$;

-- ============================================================================
-- PART 5: ADD MISSING INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Index for looking up outcomes by product
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_product_id 
  ON catalogos.recommendation_outcomes(product_id);

-- Index for looking up outcomes by supplier
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_supplier_id 
  ON catalogos.recommendation_outcomes(supplier_id);

-- Index for forecasts by supplier
CREATE INDEX IF NOT EXISTS idx_supplier_forecasts_supplier_id 
  ON catalogos.supplier_forecasts(supplier_id);

-- Index for volatility forecasts by product
CREATE INDEX IF NOT EXISTS idx_volatility_forecasts_product_id 
  ON catalogos.price_volatility_forecasts(product_id);

-- Index for guidance by status for cleanup
CREATE INDEX IF NOT EXISTS idx_guidance_status 
  ON catalogos.commercial_guidance_recommendations(status);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Log this migration
DO $$
BEGIN
  INSERT INTO catalogos.schema_versions (version, applied_at, description)
  VALUES (
    '20260311000013',
    now(),
    'RLS for procurement, forecasting, and closed-loop tables - LAUNCH BLOCKER FIX'
  )
  ON CONFLICT (version) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  -- schema_versions might not exist yet
  NULL;
END $$;

-- ============================================================================
-- ROLLBACK PROCEDURE
-- ============================================================================
-- To rollback this migration, run:
/*
-- Procurement Intelligence
DROP POLICY IF EXISTS "admin_only_supplier_reliability_scores" ON catalogos.supplier_reliability_scores;
DROP POLICY IF EXISTS "admin_only_offer_trust_scores" ON catalogos.offer_trust_scores;
DROP POLICY IF EXISTS "admin_only_margin_opportunities" ON catalogos.margin_opportunities;
DROP POLICY IF EXISTS "admin_only_supplier_recommendations" ON catalogos.supplier_recommendations;
DROP POLICY IF EXISTS "admin_only_procurement_alerts" ON catalogos.procurement_alerts;
DROP POLICY IF EXISTS "admin_only_procurement_intelligence_metrics" ON catalogos.procurement_intelligence_metrics;

-- Forecasting
DROP POLICY IF EXISTS "admin_only_supplier_forecasts" ON catalogos.supplier_forecasts;
DROP POLICY IF EXISTS "admin_only_price_volatility_forecasts" ON catalogos.price_volatility_forecasts;
DROP POLICY IF EXISTS "admin_only_commercial_guidance" ON catalogos.commercial_guidance_recommendations;
DROP POLICY IF EXISTS "admin_only_commercial_risk_scores" ON catalogos.commercial_risk_scores;
DROP POLICY IF EXISTS "admin_only_forecast_quality_metrics" ON catalogos.forecast_quality_metrics;

-- Closed-Loop
DROP POLICY IF EXISTS "admin_only_recommendation_outcomes" ON catalogos.recommendation_outcomes;
DROP POLICY IF EXISTS "admin_only_recommendation_quality_metrics" ON catalogos.recommendation_quality_metrics;
DROP POLICY IF EXISTS "admin_only_scoring_feedback_adjustments" ON catalogos.scoring_feedback_adjustments;

-- Disable RLS (WARNING: This exposes tables!)
-- Only run if you need to debug or have alternative security in place
*/
