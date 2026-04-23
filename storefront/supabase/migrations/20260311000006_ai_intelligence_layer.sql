-- =============================================================================
-- AI Intelligence Layer - Schema for AI reasoning, feedback, and learning
-- =============================================================================

-- =============================================================================
-- 1. AI Extraction Results - Persisted AI reasoning for product understanding
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.ai_extraction_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source reference
  supplier_product_id UUID NOT NULL,
  batch_id UUID,
  
  -- Input data
  raw_title TEXT,
  raw_description TEXT,
  raw_specs JSONB,
  
  -- AI extraction output
  extracted_attributes JSONB NOT NULL DEFAULT '{}',
  field_confidence JSONB NOT NULL DEFAULT '{}', -- per-field confidence
  overall_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  
  -- AI reasoning
  reasoning_summary TEXT,
  inferred_fields TEXT[], -- fields that were inferred vs explicit
  synonym_resolutions JSONB, -- term -> normalized mapping
  ambiguity_warnings TEXT[],
  
  -- Model info
  model_used TEXT,
  prompt_version TEXT,
  tokens_used INT,
  latency_ms INT,
  
  -- Feedback tracking
  human_verified BOOLEAN DEFAULT false,
  human_corrections JSONB, -- {field: {from: x, to: y}}
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_extraction_supplier ON catalogos.ai_extraction_results (supplier_product_id);
CREATE INDEX idx_ai_extraction_verified ON catalogos.ai_extraction_results (human_verified) WHERE human_verified = true;

-- =============================================================================
-- 2. AI Match Reasoning - Persisted AI reasoning for product matching
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.ai_match_reasoning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Match reference
  supplier_product_id UUID NOT NULL,
  canonical_product_id UUID,
  
  -- Match decision
  match_recommendation TEXT NOT NULL, -- exact_match, likely_match, variant, new_product, review
  confidence NUMERIC(4,3) NOT NULL,
  
  -- Reasoning components
  evidence_summary TEXT NOT NULL,
  matched_attributes JSONB NOT NULL DEFAULT '[]', -- [{field, supplier_val, canonical_val, score}]
  conflict_summary TEXT,
  conflicting_attributes JSONB DEFAULT '[]', -- [{field, supplier_val, canonical_val, severity}]
  
  -- AI-specific reasoning
  semantic_similarity_score NUMERIC(4,3),
  ai_explanation TEXT,
  ai_suggested BOOLEAN DEFAULT false,
  
  -- Hard constraint checks
  material_match BOOLEAN,
  size_match BOOLEAN,
  sterile_match BOOLEAN,
  thickness_match BOOLEAN,
  pack_qty_match BOOLEAN,
  hard_constraints_passed BOOLEAN NOT NULL DEFAULT true,
  
  -- Review recommendation
  needs_review BOOLEAN DEFAULT false,
  review_reason TEXT,
  
  -- Feedback tracking
  human_decision TEXT, -- approved, rejected, corrected
  correct_canonical_id UUID, -- if human corrected
  decision_notes TEXT,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_match_supplier ON catalogos.ai_match_reasoning (supplier_product_id);
CREATE INDEX idx_ai_match_canonical ON catalogos.ai_match_reasoning (canonical_product_id);
CREATE INDEX idx_ai_match_needs_review ON catalogos.ai_match_reasoning (needs_review) WHERE needs_review = true;

-- =============================================================================
-- 3. AI Pricing Intelligence - Persisted pricing analysis
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.ai_pricing_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  supplier_offer_id UUID,
  canonical_product_id UUID NOT NULL,
  
  -- Offer details
  supplier_id UUID,
  offer_price NUMERIC(12,2),
  offer_per_unit NUMERIC(12,4),
  
  -- Analysis result
  analysis_category TEXT NOT NULL, -- valid_best_price, suspicious_outlier, stale_offer, unit_normalization_issue, feed_error, review_required
  confidence NUMERIC(4,3) NOT NULL,
  
  -- Reasoning
  reasoning_summary TEXT NOT NULL,
  anomaly_indicators JSONB DEFAULT '[]', -- [{indicator, value, threshold, severity}]
  price_context JSONB, -- {market_avg, market_min, market_max, competitor_count}
  
  -- Flags
  is_suspicious BOOLEAN DEFAULT false,
  is_stale BOOLEAN DEFAULT false,
  has_normalization_issue BOOLEAN DEFAULT false,
  likely_feed_error BOOLEAN DEFAULT false,
  
  -- Recommendation
  recommended_action TEXT, -- accept, reject, review, flag_for_monitoring
  action_reasoning TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_pricing_product ON catalogos.ai_pricing_analysis (canonical_product_id);
CREATE INDEX idx_ai_pricing_suspicious ON catalogos.ai_pricing_analysis (is_suspicious) WHERE is_suspicious = true;

-- =============================================================================
-- 4. AI Supplier Intelligence - Discovery analysis
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.ai_supplier_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  supplier_lead_id UUID,
  supplier_id UUID,
  
  -- Classification
  relevance_score NUMERIC(4,3) NOT NULL,
  category_fit_score NUMERIC(4,3),
  catalog_usefulness_score NUMERIC(4,3),
  priority_score NUMERIC(4,3),
  
  -- Reasoning
  classification_reasoning TEXT NOT NULL,
  category_signals JSONB DEFAULT '[]', -- [{signal, confidence}]
  red_flags JSONB DEFAULT '[]', -- [{flag, severity, detail}]
  green_flags JSONB DEFAULT '[]', -- [{flag, confidence, detail}]
  
  -- Deduplication
  potential_duplicate_of UUID[],
  duplicate_confidence NUMERIC(4,3),
  duplicate_reasoning TEXT,
  
  -- Recommendation
  ingestion_recommended BOOLEAN DEFAULT false,
  ingestion_priority TEXT, -- high, medium, low, skip
  recommendation_reasoning TEXT NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_supplier_lead ON catalogos.ai_supplier_analysis (supplier_lead_id);
CREATE INDEX idx_ai_supplier_priority ON catalogos.ai_supplier_analysis (priority_score DESC);

-- =============================================================================
-- 5. AI Ops Summaries - Intelligence summaries for operators
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.ai_ops_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Run reference
  run_type TEXT NOT NULL, -- ingestion, daily_guard, audit, discovery
  run_id UUID, -- reference to job_runs or specific run table
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Summary content
  summary_text TEXT NOT NULL,
  highlights JSONB NOT NULL DEFAULT '[]', -- [{category, title, detail, severity, action_link}]
  
  -- Categorized items
  highest_risk_failures JSONB DEFAULT '[]',
  critical_review_items JSONB DEFAULT '[]',
  margin_affecting_anomalies JSONB DEFAULT '[]',
  suppliers_needing_attention JSONB DEFAULT '[]',
  
  -- Metrics summary
  metrics JSONB DEFAULT '{}',
  
  -- Model info
  generated_by TEXT DEFAULT 'system', -- 'system' or 'ai'
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_ops_summaries_date ON catalogos.ai_ops_summaries (run_date DESC);
CREATE INDEX idx_ai_ops_summaries_type ON catalogos.ai_ops_summaries (run_type, run_date DESC);

-- =============================================================================
-- 6. Human Feedback Capture - Learning from operator corrections
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to AI decision
  feedback_type TEXT NOT NULL, -- extraction, matching, pricing, supplier
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  
  -- Original AI output
  original_output JSONB NOT NULL,
  original_confidence NUMERIC(4,3),
  
  -- Human correction
  was_correct BOOLEAN NOT NULL,
  corrected_output JSONB, -- null if was_correct = true
  correction_type TEXT, -- confirmed, partially_corrected, fully_corrected, rejected
  
  -- Context
  correction_reason TEXT,
  additional_context TEXT,
  
  -- Metadata
  corrected_by UUID,
  corrected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Learning flags
  used_for_training BOOLEAN DEFAULT false,
  training_batch_id TEXT
);

CREATE INDEX idx_ai_feedback_type ON catalogos.ai_feedback (feedback_type);
CREATE INDEX idx_ai_feedback_source ON catalogos.ai_feedback (source_table, source_id);
CREATE INDEX idx_ai_feedback_unused ON catalogos.ai_feedback (used_for_training) WHERE used_for_training = false;

-- =============================================================================
-- 7. Synonym Resolution Dictionary - Learned terminology mappings
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.ai_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Synonym mapping
  field_name TEXT NOT NULL, -- material, color, brand, grade, etc.
  raw_term TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  
  -- Confidence and source
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.9,
  source TEXT NOT NULL, -- 'manual', 'ai_inferred', 'human_verified'
  
  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  
  -- Usage tracking
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (field_name, raw_term)
);

CREATE INDEX idx_ai_synonyms_field ON catalogos.ai_synonyms (field_name);
CREATE INDEX idx_ai_synonyms_lookup ON catalogos.ai_synonyms (field_name, raw_term);

-- =============================================================================
-- Seed common glove industry synonyms
-- =============================================================================

INSERT INTO catalogos.ai_synonyms (field_name, raw_term, normalized_term, confidence, source, verified) VALUES
-- Materials
('material', 'nitril', 'nitrile', 0.99, 'manual', true),
('material', 'nitirle', 'nitrile', 0.99, 'manual', true),
('material', 'ntirile', 'nitrile', 0.99, 'manual', true),
('material', 'nbr', 'nitrile', 0.95, 'manual', true),
('material', 'ltx', 'latex', 0.95, 'manual', true),
('material', 'vnl', 'vinyl', 0.95, 'manual', true),
('material', 'pvc', 'vinyl', 0.90, 'manual', true),
('material', 'neoprn', 'neoprene', 0.99, 'manual', true),
('material', 'polychloroprene', 'neoprene', 0.95, 'manual', true),

-- Colors
('color', 'blk', 'black', 0.99, 'manual', true),
('color', 'wht', 'white', 0.99, 'manual', true),
('color', 'blu', 'blue', 0.99, 'manual', true),
('color', 'pnk', 'pink', 0.99, 'manual', true),
('color', 'org', 'orange', 0.99, 'manual', true),
('color', 'prpl', 'purple', 0.99, 'manual', true),
('color', 'safety orange', 'orange', 0.95, 'manual', true),
('color', 'hi-vis orange', 'orange', 0.95, 'manual', true),

-- Grades
('grade', 'exam', 'exam_grade', 0.99, 'manual', true),
('grade', 'examination', 'exam_grade', 0.99, 'manual', true),
('grade', 'medical', 'medical_grade', 0.99, 'manual', true),
('grade', 'med', 'medical_grade', 0.95, 'manual', true),
('grade', 'indust', 'industrial', 0.99, 'manual', true),
('grade', 'industrial grade', 'industrial', 0.99, 'manual', true),
('grade', 'food', 'food_safe', 0.99, 'manual', true),
('grade', 'food service', 'food_safe', 0.99, 'manual', true),
('grade', 'fda approved', 'food_safe', 0.95, 'manual', true),

-- Textures
('texture', 'txtrd', 'textured', 0.99, 'manual', true),
('texture', 'micro-textured', 'microtextured', 0.99, 'manual', true),
('texture', 'micro textured', 'microtextured', 0.99, 'manual', true),
('texture', 'fully textured', 'textured', 0.95, 'manual', true),
('texture', 'finger textured', 'fingertip_textured', 0.99, 'manual', true),
('texture', 'diamond grip', 'diamond_textured', 0.99, 'manual', true),

-- Pack terms
('pack_type', 'bx', 'box', 0.99, 'manual', true),
('pack_type', 'cs', 'case', 0.99, 'manual', true),
('pack_type', 'pk', 'pack', 0.99, 'manual', true),
('pack_type', 'ct', 'count', 0.99, 'manual', true),
('pack_type', 'pcs', 'pieces', 0.99, 'manual', true),
('pack_type', '/bx', 'per_box', 0.99, 'manual', true),
('pack_type', '/cs', 'per_case', 0.99, 'manual', true),

-- Brands (common misspellings/variants)
('brand', 'ammex', 'AMMEX', 0.99, 'manual', true),
('brand', 'ammex corporation', 'AMMEX', 0.95, 'manual', true),
('brand', 'ansell', 'Ansell', 0.99, 'manual', true),
('brand', 'ansell healthcare', 'Ansell', 0.95, 'manual', true),
('brand', 'kimberly clark', 'Kimberly-Clark', 0.99, 'manual', true),
('brand', 'kimberly-clark', 'Kimberly-Clark', 0.99, 'manual', true),
('brand', 'halyard', 'Halyard Health', 0.95, 'manual', true)

ON CONFLICT (field_name, raw_term) DO NOTHING;

-- =============================================================================
-- Add updated_at trigger for ai_synonyms
-- =============================================================================

CREATE OR REPLACE FUNCTION catalogos.update_ai_synonyms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_synonyms_updated_at ON catalogos.ai_synonyms;
CREATE TRIGGER trg_ai_synonyms_updated_at
  BEFORE UPDATE ON catalogos.ai_synonyms
  FOR EACH ROW
  EXECUTE FUNCTION catalogos.update_ai_synonyms_updated_at();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE catalogos.ai_extraction_results IS 
'Persisted AI reasoning for product attribute extraction. Captures per-field confidence, synonym resolutions, and human feedback for learning.';

COMMENT ON TABLE catalogos.ai_match_reasoning IS 
'Persisted AI reasoning for product matching decisions. Includes evidence summary, conflicts, hard constraint checks, and human corrections.';

COMMENT ON TABLE catalogos.ai_pricing_analysis IS 
'AI analysis of supplier offers for anomaly detection. Flags suspicious pricing, stale offers, and normalization issues.';

COMMENT ON TABLE catalogos.ai_supplier_analysis IS 
'AI analysis of discovered suppliers. Scores relevance, category fit, and provides ingestion recommendations.';

COMMENT ON TABLE catalogos.ai_ops_summaries IS 
'AI-generated operational summaries for each pipeline run. Highlights risks, critical items, and margin-affecting anomalies.';

COMMENT ON TABLE catalogos.ai_feedback IS 
'Human feedback on AI decisions for learning loop. Captures corrections and confirmation for future model improvement.';

COMMENT ON TABLE catalogos.ai_synonyms IS 
'Dictionary of term synonyms for normalization. Learned from both manual entry and AI inference, verified by humans.';
