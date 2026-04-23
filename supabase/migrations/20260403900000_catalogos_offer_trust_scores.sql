-- =============================================================================
-- catalogos.offer_trust_scores: required by public.offer_trust_scores view (20260404000002).
-- Ported from storefront procurement intelligence DDL (canonical repo stream lacked CREATE).
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.offer_trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES catalogos.supplier_offers (id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers (id) ON DELETE CASCADE,
  product_id UUID REFERENCES catalogos.products (id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_offer_trust_offer_id ON catalogos.offer_trust_scores (offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_trust_supplier_id ON catalogos.offer_trust_scores (supplier_id);
CREATE INDEX IF NOT EXISTS idx_offer_trust_product_id ON catalogos.offer_trust_scores (product_id);
CREATE INDEX IF NOT EXISTS idx_offer_trust_band ON catalogos.offer_trust_scores (trust_band);
CREATE INDEX IF NOT EXISTS idx_offer_trust_score ON catalogos.offer_trust_scores (trust_score DESC);
