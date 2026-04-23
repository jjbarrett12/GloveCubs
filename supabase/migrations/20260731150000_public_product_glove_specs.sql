-- Phase 2 (additive): 1:1 glove attribute extension for public.products.
-- Safe: new table + read-only view; does not alter glove_products, catalog_v2,
-- checkout, pricing, or existing commerce FK paths.
--
-- Rollback order (manual; run in a single session):
--   1) DROP VIEW IF EXISTS public.v_audit_glove_products_unmatched_public_product_sku;
--   2) DROP VIEW IF EXISTS public.v_products_with_glove_specs;
--   3) DROP TABLE IF EXISTS public.product_glove_specs;
-- (Step 2 must run before step 3 because the tooling view references product_glove_specs.)

CREATE TABLE public.product_glove_specs (
  product_id BIGINT PRIMARY KEY REFERENCES public.products (id) ON DELETE CASCADE,
  glove_type TEXT NOT NULL
    CONSTRAINT ck_product_glove_specs_glove_type CHECK (glove_type IN ('disposable', 'reusable')),
  material TEXT,
  thickness_mil NUMERIC,
  cut_level TEXT,
  impact_rating BOOLEAN DEFAULT false,
  chemical_resistance JSONB DEFAULT '{}'::jsonb,
  heat_resistance_c NUMERIC,
  cold_rating TEXT,
  grip TEXT,
  lining TEXT,
  coating TEXT,
  waterproof BOOLEAN DEFAULT false,
  food_safe BOOLEAN DEFAULT false,
  medical_grade BOOLEAN DEFAULT false,
  chemo_rated BOOLEAN DEFAULT false,
  powder_free BOOLEAN DEFAULT true,
  sterile BOOLEAN DEFAULT false,
  cuff_length_mm NUMERIC,
  durability_score INTEGER DEFAULT 50,
  dexterity_score INTEGER DEFAULT 50,
  protection_score INTEGER DEFAULT 50,
  legacy_glove_product_id UUID REFERENCES public.glove_products (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.product_glove_specs IS
  'Glove-only attributes keyed by public.products.id; optional legacy_glove_product_id links to glove_products.id for provenance. Not a source of truth for sku, name, or price.';

CREATE INDEX idx_product_glove_specs_legacy_glove_product_id
  ON public.product_glove_specs (legacy_glove_product_id)
  WHERE legacy_glove_product_id IS NOT NULL;

ALTER TABLE public.product_glove_specs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_glove_specs_select_public ON public.product_glove_specs;
CREATE POLICY product_glove_specs_select_public
  ON public.product_glove_specs
  FOR SELECT
  USING (true);

-- Phase 2: avoid widening the public PostgREST surface; admin/service paths only.
REVOKE ALL ON public.product_glove_specs FROM PUBLIC;
GRANT SELECT ON public.product_glove_specs TO postgres, service_role;

-- Validation / tooling read model only (no app switch in this phase).
CREATE OR REPLACE VIEW public.v_products_with_glove_specs AS
SELECT
  p.*,
  s.glove_type AS spec_glove_type,
  s.material AS spec_material,
  s.thickness_mil AS spec_thickness_mil,
  s.cut_level AS spec_cut_level,
  s.impact_rating AS spec_impact_rating,
  s.chemical_resistance AS spec_chemical_resistance,
  s.heat_resistance_c AS spec_heat_resistance_c,
  s.cold_rating AS spec_cold_rating,
  s.grip AS spec_grip,
  s.lining AS spec_lining,
  s.coating AS spec_coating,
  s.waterproof AS spec_waterproof,
  s.food_safe AS spec_food_safe,
  s.medical_grade AS spec_medical_grade,
  s.chemo_rated AS spec_chemo_rated,
  s.powder_free AS spec_powder_free,
  s.sterile AS spec_sterile,
  s.cuff_length_mm AS spec_cuff_length_mm,
  s.durability_score AS spec_durability_score,
  s.dexterity_score AS spec_dexterity_score,
  s.protection_score AS spec_protection_score,
  s.legacy_glove_product_id AS spec_legacy_glove_product_id,
  s.created_at AS spec_created_at,
  s.updated_at AS spec_updated_at
FROM public.products p
LEFT JOIN public.product_glove_specs s ON s.product_id = p.id;

COMMENT ON VIEW public.v_products_with_glove_specs IS
  'LEFT JOIN helper for public.products and product_glove_specs; spec_* columns are NULL when no extension row exists. postgres/service_role only in Phase 2 — not a public API.';

REVOKE ALL ON public.v_products_with_glove_specs FROM PUBLIC;
GRANT SELECT ON public.v_products_with_glove_specs TO postgres, service_role;
