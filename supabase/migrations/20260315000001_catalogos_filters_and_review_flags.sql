-- =============================================================================
-- CatalogOS — Storefront filter attributes and review_flags
-- Aligns attribute_definitions and attribute_allowed_values with GloveCubs
-- filter groups (universal + disposable_gloves + reusable_work_gloves).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- review_flags: structured flags for review queue (missing/conflicting attributes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.review_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_id UUID NOT NULL REFERENCES catalogos.supplier_products_normalized(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,
  attribute_key TEXT,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'error')),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_flags_normalized ON catalogos.review_flags (normalized_id);
CREATE INDEX IF NOT EXISTS idx_review_flags_type ON catalogos.review_flags (flag_type);
CREATE INDEX IF NOT EXISTS idx_review_flags_severity ON catalogos.review_flags (severity) WHERE severity = 'error';

COMMENT ON TABLE catalogos.review_flags IS 'Per-row review flags: missing required filter attributes, conflicting data; drives review queue.';

-- -----------------------------------------------------------------------------
-- Category: reusable_work_gloves (if not exists)
-- -----------------------------------------------------------------------------
INSERT INTO catalogos.categories (slug, name, description, sort_order) VALUES
  ('reusable_work_gloves', 'Reusable Work Gloves', 'Cut-resistant, puncture-resistant, insulated work gloves', 15)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- =============================================================================
-- DISPOSABLE_GLOVES: attribute definitions + allowed values
-- =============================================================================
DO $$
DECLARE
  cat_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO cat_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;
  IF cat_id IS NULL THEN RAISE EXCEPTION 'Category disposable_gloves not found'; END IF;

  -- Universal (disposable): material, size, color, brand
  INSERT INTO catalogos.attribute_definitions (category_id, attribute_key, label, value_type, is_required, is_filterable, sort_order) VALUES
    (cat_id, 'material', 'Material', 'string', false, true, 10),
    (cat_id, 'size', 'Size', 'string', false, true, 20),
    (cat_id, 'color', 'Color', 'string', false, true, 30),
    (cat_id, 'brand', 'Brand', 'string', false, true, 40),
    (cat_id, 'thickness_mil', 'Thickness (mil)', 'string', false, true, 50),
    (cat_id, 'powder', 'Powder', 'string', false, true, 60),
    (cat_id, 'grade', 'Grade', 'string', false, true, 70),
    (cat_id, 'industries', 'Industries', 'string_array', false, true, 80),
    (cat_id, 'compliance_certifications', 'Compliance', 'string_array', false, true, 90),
    (cat_id, 'texture', 'Texture', 'string', false, true, 100),
    (cat_id, 'cuff_style', 'Cuff style', 'string', false, true, 110),
    (cat_id, 'hand_orientation', 'Hand orientation', 'string', false, true, 120),
    (cat_id, 'packaging', 'Packaging', 'string', false, true, 130),
    (cat_id, 'sterility', 'Sterility', 'string', false, true, 140)
  ON CONFLICT (category_id, attribute_key) DO UPDATE SET
    label = EXCLUDED.label, value_type = EXCLUDED.value_type, is_filterable = EXCLUDED.is_filterable, sort_order = EXCLUDED.sort_order, updated_at = NOW();

  -- MATERIAL
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'material' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('nitrile', 1), ('latex', 2), ('vinyl', 3), ('polyethylene_pe', 4)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- SIZE
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'size' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('xs', 1), ('s', 2), ('m', 3), ('l', 4), ('xl', 5), ('xxl', 6)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- COLOR
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'color' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES
    ('blue', 1), ('purple', 2), ('black', 3), ('white', 4), ('light_blue', 5), ('orange', 6), ('violet', 7),
    ('green', 8), ('tan', 9), ('gray', 10), ('beige', 11), ('yellow', 12), ('brown', 13), ('pink', 14), ('clear', 15)
  ) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- THICKNESS_MIL (disposable)
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'thickness_mil' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('2', 1), ('3', 2), ('4', 3), ('5', 4), ('6', 5), ('7_plus', 6)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- POWDER
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'powder' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('powder_free', 1), ('powdered', 2)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- GRADE
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'grade' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('medical_exam_grade', 1), ('industrial_grade', 2), ('food_service_grade', 3)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- INDUSTRIES
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'industries' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES
    ('healthcare', 1), ('food_service', 2), ('food_processing', 3), ('janitorial', 4), ('sanitation', 5),
    ('laboratories', 6), ('pharmaceuticals', 7), ('beauty_personal_care', 8), ('tattoo_body_art', 9), ('automotive', 10), ('education', 11)
  ) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- COMPLIANCE_CERTIFICATIONS
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'compliance_certifications' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES
    ('fda_approved', 1), ('astm_tested', 2), ('food_safe', 3), ('latex_free', 4), ('chemo_rated', 5), ('en_455', 6), ('en_374', 7)
  ) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- TEXTURE
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'texture' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('smooth', 1), ('fingertip_textured', 2), ('fully_textured', 3)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- CUFF_STYLE
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'cuff_style' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('beaded_cuff', 1), ('non_beaded', 2), ('extended_cuff', 3)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- HAND_ORIENTATION
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'hand_orientation' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('ambidextrous', 1)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- PACKAGING
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'packaging' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('box_100_ct', 1), ('box_200_250_ct', 2), ('case_1000_ct', 3), ('case_2000_plus_ct', 4)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- STERILITY
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'sterility' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('non_sterile', 1), ('sterile', 2)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
END $$;

-- =============================================================================
-- REUSABLE_WORK_GLOVES: attribute definitions + allowed values
-- =============================================================================
DO $$
DECLARE
  cat_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO cat_id FROM catalogos.categories WHERE slug = 'reusable_work_gloves' LIMIT 1;
  IF cat_id IS NULL THEN RAISE EXCEPTION 'Category reusable_work_gloves not found'; END IF;

  INSERT INTO catalogos.attribute_definitions (category_id, attribute_key, label, value_type, is_required, is_filterable, sort_order) VALUES
    (cat_id, 'material', 'Material', 'string', false, true, 10),
    (cat_id, 'size', 'Size', 'string', false, true, 20),
    (cat_id, 'color', 'Color', 'string', false, true, 30),
    (cat_id, 'brand', 'Brand', 'string', false, true, 40),
    (cat_id, 'cut_level_ansi', 'Cut level (ANSI)', 'string', false, true, 50),
    (cat_id, 'puncture_level', 'Puncture level', 'string', false, true, 60),
    (cat_id, 'abrasion_level', 'Abrasion level', 'string', false, true, 70),
    (cat_id, 'flame_resistant', 'Flame resistant', 'string', false, true, 80),
    (cat_id, 'arc_rating', 'ARC rating', 'string', false, true, 90),
    (cat_id, 'warm_cold_weather', 'Warm/Cold weather', 'string', false, true, 100)
  ON CONFLICT (category_id, attribute_key) DO UPDATE SET
    label = EXCLUDED.label, value_type = EXCLUDED.value_type, is_filterable = EXCLUDED.is_filterable, sort_order = EXCLUDED.sort_order, updated_at = NOW();

  -- SIZE
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'size' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('xs', 1), ('s', 2), ('m', 3), ('l', 4), ('xl', 5), ('xxl', 6)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- COLOR
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'color' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES
    ('blue', 1), ('purple', 2), ('black', 3), ('white', 4), ('light_blue', 5), ('orange', 6), ('violet', 7),
    ('green', 8), ('tan', 9), ('gray', 10), ('beige', 11), ('yellow', 12), ('brown', 13), ('pink', 14), ('clear', 15)
  ) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- CUT_LEVEL_ANSI
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'cut_level_ansi' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('a1', 1), ('a2', 2), ('a3', 3), ('a4', 4), ('a5', 5), ('a6', 6), ('a7', 7), ('a8', 8), ('a9', 9)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- PUNCTURE_LEVEL
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'puncture_level' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('p1', 1), ('p2', 2), ('p3', 3), ('p4', 4), ('p5', 5)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- ABRASION_LEVEL
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'abrasion_level' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('level_1', 1), ('level_2', 2), ('level_3', 3), ('level_4', 4)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- FLAME_RESISTANT
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'flame_resistant' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('flame_resistant', 1)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- ARC_RATING
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'arc_rating' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES
    ('category_1', 1), ('category_2', 2), ('category_3', 3), ('category_4', 4),
    ('cal_8', 5), ('cal_12', 6), ('cal_20', 7)
  ) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- WARM_COLD_WEATHER
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'warm_cold_weather' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('insulated', 1), ('winter', 2)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
END $$;
