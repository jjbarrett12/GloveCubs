-- =============================================================================
-- CatalogOS — Attribute dictionary layer
-- Controlled attribute definitions, allowed values, category requirements,
-- and synonym maps for ingestion normalization and storefront faceting.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Extend attribute_definitions: display_group, data_type, cardinality
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.attribute_definitions
  ADD COLUMN IF NOT EXISTS display_group TEXT,
  ADD COLUMN IF NOT EXISTS data_type TEXT NOT NULL DEFAULT 'string' CHECK (data_type IN ('string', 'number', 'boolean', 'string_array')),
  ADD COLUMN IF NOT EXISTS cardinality TEXT NOT NULL DEFAULT 'single' CHECK (cardinality IN ('single', 'multi'));

COMMENT ON COLUMN catalogos.attribute_definitions.display_group IS 'Storefront filter group (e.g. universal, disposable_specs, work_glove_specs).';
COMMENT ON COLUMN catalogos.attribute_definitions.data_type IS 'Value type for validation and storage.';
COMMENT ON COLUMN catalogos.attribute_definitions.cardinality IS 'single = one value; multi = array (e.g. industries, compliance_certifications).';

-- -----------------------------------------------------------------------------
-- 2) category_attribute_requirements
-- Required vs strongly_preferred by category; drives validation and review queue.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.category_attribute_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES catalogos.categories(id) ON DELETE CASCADE,
  attribute_definition_id UUID NOT NULL REFERENCES catalogos.attribute_definitions(id) ON DELETE CASCADE,
  requirement_level TEXT NOT NULL CHECK (requirement_level IN ('required', 'strongly_preferred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_category_attribute_requirements_cat_attr UNIQUE (category_id, attribute_definition_id)
);

CREATE INDEX idx_category_attr_req_category ON catalogos.category_attribute_requirements (category_id);
CREATE INDEX idx_category_attr_req_attr ON catalogos.category_attribute_requirements (attribute_definition_id);

COMMENT ON TABLE catalogos.category_attribute_requirements IS 'Per-category requirement level for each attribute; required vs strongly_preferred.';

-- -----------------------------------------------------------------------------
-- 3) attribute_value_synonyms
-- Raw supplier text → normalized allowed value; used during ingestion.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.attribute_value_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_definition_id UUID NOT NULL REFERENCES catalogos.attribute_definitions(id) ON DELETE CASCADE,
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attribute_value_synonyms_attr_raw UNIQUE (attribute_definition_id, raw_value)
);

CREATE INDEX idx_attribute_value_synonyms_attr ON catalogos.attribute_value_synonyms (attribute_definition_id);
CREATE INDEX idx_attribute_value_synonyms_raw_lower ON catalogos.attribute_value_synonyms (attribute_definition_id, LOWER(raw_value));

COMMENT ON TABLE catalogos.attribute_value_synonyms IS 'Synonym map for ingestion: raw_value (e.g. PF, blk) → normalized_value (e.g. powder_free, black).';

-- -----------------------------------------------------------------------------
-- 4) Ensure categories exist
-- -----------------------------------------------------------------------------
INSERT INTO catalogos.categories (slug, name, description, sort_order) VALUES
  ('disposable_gloves', 'Disposable Gloves', 'Exam, industrial, food service disposable gloves', 10),
  ('reusable_work_gloves', 'Reusable Work Gloves', 'Cut-resistant, puncture-resistant, insulated work gloves', 20)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- =============================================================================
-- 5) Attribute definitions: disposable_gloves (universal + disposable-specific)
-- display_group: universal | disposable_specs | work_glove_specs
-- cardinality: multi for industries, compliance_certifications
-- =============================================================================
DO $$
DECLARE
  dg_id UUID;
  rw_id UUID;
  aid UUID;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;
  SELECT id INTO rw_id FROM catalogos.categories WHERE slug = 'reusable_work_gloves' LIMIT 1;
  IF dg_id IS NULL OR rw_id IS NULL THEN RAISE EXCEPTION 'Categories not found'; END IF;

  -- Disposable: universal
  INSERT INTO catalogos.attribute_definitions (category_id, attribute_key, label, value_type, data_type, cardinality, display_group, is_required, is_filterable, sort_order) VALUES
    (dg_id, 'category', 'Category', 'string', 'string', 'single', 'universal', true, true, 5),
    (dg_id, 'material', 'Material', 'string', 'string', 'single', 'universal', true, true, 10),
    (dg_id, 'size', 'Size', 'string', 'string', 'single', 'universal', true, true, 20),
    (dg_id, 'color', 'Color', 'string', 'string', 'single', 'universal', true, true, 30),
    (dg_id, 'brand', 'Brand', 'string', 'string', 'single', 'universal', true, true, 40),
    (dg_id, 'price_range', 'Price range', 'string', 'string', 'single', 'universal', false, true, 50)
  ON CONFLICT (category_id, attribute_key) DO UPDATE SET
    label = EXCLUDED.label, data_type = EXCLUDED.data_type, cardinality = EXCLUDED.cardinality, display_group = EXCLUDED.display_group,
    is_required = EXCLUDED.is_required, is_filterable = EXCLUDED.is_filterable, sort_order = EXCLUDED.sort_order, updated_at = NOW();

  -- Disposable: category-specific
  INSERT INTO catalogos.attribute_definitions (category_id, attribute_key, label, value_type, data_type, cardinality, display_group, is_required, is_filterable, sort_order) VALUES
    (dg_id, 'thickness_mil', 'Thickness (mil)', 'string', 'string', 'single', 'disposable_specs', false, true, 60),
    (dg_id, 'powder', 'Powder', 'string', 'string', 'single', 'disposable_specs', true, true, 70),
    (dg_id, 'grade', 'Grade', 'string', 'string', 'single', 'disposable_specs', true, true, 80),
    (dg_id, 'industries', 'Industries', 'string_array', 'string_array', 'multi', 'disposable_specs', false, true, 90),
    (dg_id, 'compliance_certifications', 'Compliance / Certification', 'string_array', 'string_array', 'multi', 'disposable_specs', false, true, 100),
    (dg_id, 'texture', 'Texture', 'string', 'string', 'single', 'disposable_specs', false, true, 110),
    (dg_id, 'cuff_style', 'Cuff style', 'string', 'string', 'single', 'disposable_specs', false, true, 120),
    (dg_id, 'hand_orientation', 'Hand orientation', 'string', 'string', 'single', 'disposable_specs', false, true, 130),
    (dg_id, 'packaging', 'Packaging', 'string', 'string', 'single', 'disposable_specs', true, true, 140),
    (dg_id, 'sterility', 'Sterility', 'string', 'string', 'single', 'disposable_specs', false, true, 150)
  ON CONFLICT (category_id, attribute_key) DO UPDATE SET
    label = EXCLUDED.label, data_type = EXCLUDED.data_type, cardinality = EXCLUDED.cardinality, display_group = EXCLUDED.display_group,
    is_required = EXCLUDED.is_required, is_filterable = EXCLUDED.is_filterable, sort_order = EXCLUDED.sort_order, updated_at = NOW();

  -- Reusable work gloves: universal (no material required for work gloves per user)
  INSERT INTO catalogos.attribute_definitions (category_id, attribute_key, label, value_type, data_type, cardinality, display_group, is_required, is_filterable, sort_order) VALUES
    (rw_id, 'category', 'Category', 'string', 'string', 'single', 'universal', true, true, 5),
    (rw_id, 'material', 'Material', 'string', 'string', 'single', 'universal', false, true, 10),
    (rw_id, 'size', 'Size', 'string', 'string', 'single', 'universal', true, true, 20),
    (rw_id, 'color', 'Color', 'string', 'string', 'single', 'universal', true, true, 30),
    (rw_id, 'brand', 'Brand', 'string', 'string', 'single', 'universal', true, true, 40),
    (rw_id, 'price_range', 'Price range', 'string', 'string', 'single', 'universal', false, true, 50)
  ON CONFLICT (category_id, attribute_key) DO UPDATE SET
    label = EXCLUDED.label, data_type = EXCLUDED.data_type, cardinality = EXCLUDED.cardinality, display_group = EXCLUDED.display_group,
    is_required = EXCLUDED.is_required, is_filterable = EXCLUDED.is_filterable, sort_order = EXCLUDED.sort_order, updated_at = NOW();

  -- Reusable work gloves: category-specific
  INSERT INTO catalogos.attribute_definitions (category_id, attribute_key, label, value_type, data_type, cardinality, display_group, is_required, is_filterable, sort_order) VALUES
    (rw_id, 'cut_level_ansi', 'Cut level (ANSI)', 'string', 'string', 'single', 'work_glove_specs', false, true, 60),
    (rw_id, 'puncture_level', 'Puncture level', 'string', 'string', 'single', 'work_glove_specs', false, true, 70),
    (rw_id, 'abrasion_level', 'Abrasion level', 'string', 'string', 'single', 'work_glove_specs', false, true, 80),
    (rw_id, 'flame_resistant', 'Flame resistant', 'string', 'string', 'single', 'work_glove_specs', false, true, 90),
    (rw_id, 'arc_rating', 'ARC rating', 'string', 'string', 'single', 'work_glove_specs', false, true, 100),
    (rw_id, 'warm_cold_weather', 'Warm / cold weather', 'string', 'string', 'single', 'work_glove_specs', false, true, 110)
  ON CONFLICT (category_id, attribute_key) DO UPDATE SET
    label = EXCLUDED.label, data_type = EXCLUDED.data_type, cardinality = EXCLUDED.cardinality, display_group = EXCLUDED.display_group,
    is_required = EXCLUDED.is_required, is_filterable = EXCLUDED.is_filterable, sort_order = EXCLUDED.sort_order, updated_at = NOW();
END $$;

-- =============================================================================
-- 6) attribute_allowed_values — disposable_gloves (exact values from spec)
-- =============================================================================
DO $$
DECLARE
  dg_id UUID;
  attr_id UUID;
  fn_attr_id UUID;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;

  -- category
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'category' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('disposable_gloves', 1), ('reusable_work_gloves', 2)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- material
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'material' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('nitrile', 1), ('latex', 2), ('vinyl', 3), ('polyethylene_pe', 4)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- size
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'size' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('xs', 1), ('s', 2), ('m', 3), ('l', 4), ('xl', 5), ('xxl', 6)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- color
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'color' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES
    ('blue', 1), ('purple', 2), ('black', 3), ('white', 4), ('light_blue', 5), ('orange', 6), ('violet', 7),
    ('green', 8), ('tan', 9), ('gray', 10), ('beige', 11), ('yellow', 12), ('brown', 13), ('pink', 14)
  ) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- thickness_mil
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'thickness_mil' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('2', 1), ('3', 2), ('4', 3), ('5', 4), ('6', 5), ('7_plus', 6)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- powder
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'powder' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('powder_free', 1), ('powdered', 2)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- grade
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'grade' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('medical_exam_grade', 1), ('industrial_grade', 2), ('food_service_grade', 3)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- industries
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'industries' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES
    ('healthcare', 1), ('food_service', 2), ('food_processing', 3), ('janitorial', 4), ('sanitation', 5),
    ('laboratories', 6), ('pharmaceuticals', 7), ('beauty_personal_care', 8), ('tattoo_body_art', 9), ('automotive', 10), ('education', 11)
  ) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- compliance_certifications
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'compliance_certifications' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('fda_approved', 1), ('astm_tested', 2), ('food_safe', 3), ('latex_free', 4), ('chemo_rated', 5), ('en_455', 6), ('en_374', 7)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- texture
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'texture' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('smooth', 1), ('fingertip_textured', 2), ('fully_textured', 3)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- cuff_style
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'cuff_style' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('beaded_cuff', 1), ('non_beaded', 2), ('extended_cuff', 3)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- hand_orientation
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'hand_orientation' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('ambidextrous', 1)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- packaging
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'packaging' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('box_100_ct', 1), ('box_200_250_ct', 2), ('case_1000_ct', 3), ('case_2000_plus_ct', 4)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- sterility
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'sterility' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('non_sterile', 1), ('sterile', 2)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
END $$;

-- =============================================================================
-- 7) attribute_allowed_values — reusable_work_gloves
-- =============================================================================
DO $$
DECLARE
  rw_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO rw_id FROM catalogos.categories WHERE slug = 'reusable_work_gloves' LIMIT 1;

  -- category
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'category' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('disposable_gloves', 1), ('reusable_work_gloves', 2)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- material, size, color (same as disposable)
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'material' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('nitrile', 1), ('latex', 2), ('vinyl', 3), ('polyethylene_pe', 4)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'size' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('xs', 1), ('s', 2), ('m', 3), ('l', 4), ('xl', 5), ('xxl', 6)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'color' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES
    ('blue', 1), ('purple', 2), ('black', 3), ('white', 4), ('light_blue', 5), ('orange', 6), ('violet', 7),
    ('green', 8), ('tan', 9), ('gray', 10), ('beige', 11), ('yellow', 12), ('brown', 13), ('pink', 14)
  ) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- cut_level_ansi
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'cut_level_ansi' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('a1', 1), ('a2', 2), ('a3', 3), ('a4', 4), ('a5', 5), ('a6', 6), ('a7', 7), ('a8', 8), ('a9', 9)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- puncture_level
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'puncture_level' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('p1', 1), ('p2', 2), ('p3', 3), ('p4', 4), ('p5', 5)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- abrasion_level
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'abrasion_level' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('level_1', 1), ('level_2', 2), ('level_3', 3), ('level_4', 4)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- flame_resistant
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'flame_resistant' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('flame_resistant', 1)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- arc_rating
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'arc_rating' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('category_1', 1), ('category_2', 2), ('category_3', 3), ('category_4', 4), ('cal_8', 5), ('cal_12', 6), ('cal_20', 7)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;

  -- warm_cold_weather
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'warm_cold_weather' LIMIT 1;
  INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
  SELECT attr_id, v, ord FROM (VALUES ('insulated', 1), ('winter', 2)) AS t(v, ord)
  ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
END $$;

-- =============================================================================
-- 8) category_attribute_requirements — disposable_gloves
-- =============================================================================
DO $$
DECLARE
  dg_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;

  FOR attr_id IN SELECT id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key IN ('category', 'material', 'size', 'color', 'brand', 'packaging', 'powder', 'grade')
  LOOP
    INSERT INTO catalogos.category_attribute_requirements (category_id, attribute_definition_id, requirement_level)
    VALUES (dg_id, attr_id, 'required')
    ON CONFLICT (category_id, attribute_definition_id) DO UPDATE SET requirement_level = 'required';
  END LOOP;

  FOR attr_id IN SELECT id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key IN ('thickness_mil', 'texture', 'cuff_style', 'sterility', 'industries', 'compliance_certifications')
  LOOP
    INSERT INTO catalogos.category_attribute_requirements (category_id, attribute_definition_id, requirement_level)
    VALUES (dg_id, attr_id, 'strongly_preferred')
    ON CONFLICT (category_id, attribute_definition_id) DO UPDATE SET requirement_level = 'strongly_preferred';
  END LOOP;
END $$;

-- =============================================================================
-- 9) category_attribute_requirements — reusable_work_gloves
-- =============================================================================
DO $$
DECLARE
  rw_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO rw_id FROM catalogos.categories WHERE slug = 'reusable_work_gloves' LIMIT 1;

  FOR attr_id IN SELECT id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key IN ('category', 'size', 'color', 'brand')
  LOOP
    INSERT INTO catalogos.category_attribute_requirements (category_id, attribute_definition_id, requirement_level)
    VALUES (rw_id, attr_id, 'required')
    ON CONFLICT (category_id, attribute_definition_id) DO UPDATE SET requirement_level = 'required';
  END LOOP;

  FOR attr_id IN SELECT id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key IN ('cut_level_ansi', 'puncture_level', 'abrasion_level', 'flame_resistant', 'arc_rating', 'warm_cold_weather')
  LOOP
    INSERT INTO catalogos.category_attribute_requirements (category_id, attribute_definition_id, requirement_level)
    VALUES (rw_id, attr_id, 'strongly_preferred')
    ON CONFLICT (category_id, attribute_definition_id) DO UPDATE SET requirement_level = 'strongly_preferred';
  END LOOP;
END $$;

-- =============================================================================
-- 10) attribute_value_synonyms — normalization maps for ingestion
-- =============================================================================
DO $$
DECLARE
  attr_id UUID;
  dg_id UUID;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;

  -- powder: PF, powder free → powder_free; powdered
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'powder' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, 'pf', 'powder_free'),
      (attr_id, 'powder free', 'powder_free'),
      (attr_id, 'powder-free', 'powder_free'),
      (attr_id, 'powderfree', 'powder_free'),
      (attr_id, 'free of powder', 'powder_free')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;

  -- grade: exam grade → medical_exam_grade; foodservice → food_service_grade
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'grade' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, 'exam grade', 'medical_exam_grade'),
      (attr_id, 'exam', 'medical_exam_grade'),
      (attr_id, 'medical', 'medical_exam_grade'),
      (attr_id, 'foodservice', 'food_service_grade'),
      (attr_id, 'food service', 'food_service_grade'),
      (attr_id, 'industrial', 'industrial_grade')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;

  -- size: lg → l, xlrg → xl, etc.
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'size' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, 'lg', 'l'),
      (attr_id, 'xlrg', 'xl'),
      (attr_id, 'xlg', 'xl'),
      (attr_id, 'med', 'm'),
      (attr_id, 'sm', 's'),
      (attr_id, 'extra small', 'xs'),
      (attr_id, 'extra large', 'xl'),
      (attr_id, 'extra large large', 'xxl')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;

  -- color: blk → black, blu → blue, etc.
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'color' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, 'blk', 'black'),
      (attr_id, 'blu', 'blue'),
      (attr_id, 'wht', 'white'),
      (attr_id, 'grn', 'green'),
      (attr_id, 'gry', 'gray'),
      (attr_id, 'grey', 'gray'),
      (attr_id, 'lt blue', 'light_blue'),
      (attr_id, 'light blue', 'light_blue')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;

  -- hand_orientation: ambi → ambidextrous
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'hand_orientation' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, 'ambi', 'ambidextrous'),
      (attr_id, 'ambidextrous', 'ambidextrous')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;

  -- packaging: 1000/cs → case_1000_ct, 100 ct → box_100_ct
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'packaging' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, '1000/cs', 'case_1000_ct'),
      (attr_id, '1000 per case', 'case_1000_ct'),
      (attr_id, '100 ct', 'box_100_ct'),
      (attr_id, '100/box', 'box_100_ct'),
      (attr_id, '100/ct', 'box_100_ct'),
      (attr_id, '200/box', 'box_200_250_ct'),
      (attr_id, '250/box', 'box_200_250_ct'),
      (attr_id, '2000+', 'case_2000_plus_ct')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;
END $$;
