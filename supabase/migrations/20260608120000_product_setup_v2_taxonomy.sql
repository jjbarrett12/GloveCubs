-- =============================================================================
-- Product Setup V2 — Phase 1 taxonomy seed (idempotent)
-- Expands attribute_definitions, attribute_allowed_values, and synonyms.
-- Does not delete or rename existing slugs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- DISPOSABLE_GLOVES: new attribute definitions
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  dg_id UUID;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;
  IF dg_id IS NULL THEN
    RAISE NOTICE 'product_setup_v2: disposable_gloves not found; skipping disposable defs';
    RETURN;
  END IF;

  INSERT INTO catalogos.attribute_definitions (
    category_id, attribute_key, label, value_type, data_type, cardinality,
    display_group, is_required, is_filterable, sort_order
  ) VALUES
    (dg_id, 'box_quantity', 'Box Quantity', 'string', 'string', 'single', 'disposable_specs', false, true, 55),
    (dg_id, 'case_quantity', 'Case Quantity', 'string', 'string', 'single', 'disposable_specs', false, true, 56)
  ON CONFLICT (category_id, attribute_key) DO UPDATE SET
    label = EXCLUDED.label,
    display_group = EXCLUDED.display_group,
    is_filterable = EXCLUDED.is_filterable,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();
END $$;

-- -----------------------------------------------------------------------------
-- REUSABLE_WORK_GLOVES: new attribute definitions
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  rw_id UUID;
BEGIN
  SELECT id INTO rw_id FROM catalogos.categories WHERE slug = 'reusable_work_gloves' LIMIT 1;
  IF rw_id IS NULL THEN
    RAISE NOTICE 'product_setup_v2: reusable_work_gloves not found; skipping reusable defs';
    RETURN;
  END IF;

  INSERT INTO catalogos.attribute_definitions (
    category_id, attribute_key, label, value_type, data_type, cardinality,
    display_group, is_required, is_filterable, sort_order
  ) VALUES
    (rw_id, 'coating', 'Coating', 'string', 'string', 'single', 'work_glove_specs', false, true, 45),
    (rw_id, 'liner', 'Liner', 'string', 'string', 'single', 'work_glove_specs', false, true, 46),
    (rw_id, 'gauge', 'Gauge', 'string', 'string', 'single', 'work_glove_specs', false, true, 47),
    (rw_id, 'pack_quantity', 'Pack Quantity', 'string', 'string', 'single', 'work_glove_specs', false, true, 48),
    (rw_id, 'certifications', 'Certifications', 'string_array', 'string_array', 'multi', 'work_glove_specs', false, true, 100),
    (rw_id, 'uses', 'Uses', 'string_array', 'string_array', 'multi', 'commercial', false, true, 105),
    (rw_id, 'industries', 'Industries', 'string_array', 'string_array', 'multi', 'commercial', false, true, 110),
    (rw_id, 'texture', 'Grip Texture', 'string', 'string', 'single', 'work_glove_specs', false, true, 50),
    (rw_id, 'cuff_style', 'Cuff Style', 'string', 'string', 'single', 'work_glove_specs', false, true, 51)
  ON CONFLICT (category_id, attribute_key) DO UPDATE SET
    label = EXCLUDED.label,
    display_group = EXCLUDED.display_group,
    is_filterable = EXCLUDED.is_filterable,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();
END $$;

-- -----------------------------------------------------------------------------
-- Allowed values helper macro via repeated blocks
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  dg_id UUID;
  rw_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;
  SELECT id INTO rw_id FROM catalogos.categories WHERE slug = 'reusable_work_gloves' LIMIT 1;

  IF dg_id IS NOT NULL THEN
    -- COLOR: blue_violet
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'color' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      VALUES (attr_id, 'blue_violet', 16)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- SIZE: xxxl
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'size' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      VALUES (attr_id, 'xxxl', 7)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- THICKNESS_MIL: 2-20
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'thickness_mil' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('2', 1), ('3', 2), ('4', 3), ('5', 4), ('6', 5), ('7', 6), ('8', 7), ('9', 8), ('10', 9),
        ('11', 10), ('12', 11), ('13', 12), ('14', 13), ('15', 14), ('16', 15), ('17', 16), ('18', 17), ('19', 18), ('20', 19)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- GRADE
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'grade' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('medical_exam_grade', 1), ('industrial_grade', 2), ('food_service_grade', 3),
        ('surgical_grade', 4), ('cleanroom_grade', 5), ('chemical_resistant', 6), ('general_purpose', 7)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- TEXTURE
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'texture' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('smooth', 1), ('fingertip_textured', 2), ('fully_textured', 3), ('micro_textured', 4),
        ('diamond_texture', 5), ('fish_scale', 6), ('sandy_grip', 7), ('foam_grip', 8), ('crinkle_grip', 9),
        ('raised_diamond', 10), ('embossed', 11), ('grip_dots', 12)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- BOX_QUANTITY
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'box_quantity' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('50', 1), ('90', 2), ('100', 3), ('150', 4), ('200', 5), ('250', 6), ('300', 7)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- CASE_QUANTITY
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'case_quantity' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('250', 1), ('500', 2), ('1000', 3), ('1500', 4), ('2000', 5), ('2500', 6), ('3000', 7)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- INDUSTRIES
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'industries' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('healthcare', 1), ('dental', 2), ('veterinary', 3), ('laboratories', 4), ('pharmaceuticals', 5),
        ('food_service', 6), ('hospitality', 7), ('food_processing', 8), ('education', 9), ('retail_grocery', 10),
        ('home_use', 11), ('janitorial', 12), ('sanitation', 13), ('beauty_personal_care', 14), ('tattoo_body_art', 15),
        ('automotive', 16), ('electronics_assembly', 17), ('construction', 18), ('plumbing', 19), ('electrical', 20),
        ('hvac', 21), ('painting', 22), ('warehousing_logistics', 23), ('metal_fabrication', 24), ('chemical_processing', 25),
        ('industrial', 26), ('cold_chain_outdoor', 27), ('agriculture', 28), ('cannabis', 29), ('oil_gas_energy', 30),
        ('landscaping_grounds', 31), ('emergency_services', 32), ('security_public_safety', 33)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- USES
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'uses' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('food_preparation', 1), ('food_handling', 2), ('medical_exam', 3), ('patient_care', 4), ('dental_procedure', 5),
        ('laboratory', 6), ('chemical_handling', 7), ('cleaning', 8), ('janitorial', 9), ('sanitation', 10),
        ('automotive_repair', 11), ('mechanical_work', 12), ('painting', 13), ('tattooing', 14), ('beauty_services', 15),
        ('hair_coloring', 16), ('dishwashing', 17), ('general_purpose', 18), ('ppe', 19), ('cut_protection', 20),
        ('abrasion_protection', 21), ('cold_protection', 22), ('heat_protection', 23), ('grip_work', 24),
        ('construction_work', 25), ('warehouse_work', 26), ('material_handling', 27), ('industrial_maintenance', 28),
        ('cleanroom', 29)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- CERTIFICATIONS (disposable)
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'certifications' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('astm_d6319', 1), ('astm_d3578', 2), ('astm_d5250', 3), ('fda_food_contact', 4), ('fda_510k', 5),
        ('medical_exam_grade_cert', 6), ('chemo_tested', 7), ('fentanyl_tested', 8), ('chemotherapy_drug_tested', 9),
        ('aql_1_5', 10), ('aql_2_5', 11), ('aql_4_0', 12), ('powder_free', 13), ('latex_free', 14),
        ('iso_13485', 15), ('en_455', 16), ('en_374', 17),
        ('fda_approved', 90), ('astm_tested', 91), ('food_safe', 92), ('chemo_rated', 93)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;
  END IF;

  IF rw_id IS NOT NULL THEN
    -- SIZE xxxl
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'size' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      VALUES (attr_id, 'xxxl', 7)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- COATING
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'coating' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('nitrile', 1), ('latex', 2), ('pu', 3), ('pvc', 4), ('foam', 5)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- LINER
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'liner' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('hppe', 1), ('aramid', 2), ('cotton', 3), ('polyester', 4)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- GAUGE
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'gauge' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('7', 1), ('10', 2), ('13', 3), ('15', 4), ('18', 5), ('21', 6)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- PACK_QUANTITY
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'pack_quantity' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('each', 1), ('pair', 2), ('dozen', 3), ('pack', 4), ('case', 5)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- TEXTURE (reusable)
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'texture' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('smooth', 1), ('fingertip_textured', 2), ('fully_textured', 3), ('micro_textured', 4),
        ('diamond_texture', 5), ('fish_scale', 6), ('sandy_grip', 7), ('foam_grip', 8), ('crinkle_grip', 9),
        ('raised_diamond', 10), ('embossed', 11), ('grip_dots', 12)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- INDUSTRIES / USES (reusable)
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'industries' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('healthcare', 1), ('dental', 2), ('construction', 3), ('industrial', 4), ('automotive', 5),
        ('warehousing_logistics', 6), ('metal_fabrication', 7), ('agriculture', 8), ('emergency_services', 9)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'uses' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('cut_protection', 1), ('abrasion_protection', 2), ('grip_work', 3), ('construction_work', 4),
        ('warehouse_work', 5), ('material_handling', 6), ('general_purpose', 7)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;

    -- CERTIFICATIONS (safety)
    SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = rw_id AND attribute_key = 'certifications' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      SELECT attr_id, v, ord::int FROM (VALUES
        ('ansi_isea_105', 1), ('en_388', 2), ('en_407', 3), ('en_511', 4), ('en_iso_374', 5),
        ('ce', 6), ('ukca', 7), ('reach', 8), ('oeko_tex', 9), ('nfpa_70e', 10),
        ('arc_flash_rated', 11), ('impact_rated', 12), ('cut_rated', 13), ('puncture_rated', 14)
      ) AS t(v, ord)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- attribute_value_synonyms (ingestion / display normalization for future parser)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  dg_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;
  IF dg_id IS NULL THEN RETURN; END IF;

  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'color' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, 'Blue Violet', 'blue_violet'),
      (attr_id, 'blue violet', 'blue_violet')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;

  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'certifications' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, 'ASTM D6319', 'astm_d6319'),
      (attr_id, 'FDA Food Contact', 'fda_food_contact'),
      (attr_id, 'FDA 510(k)', 'fda_510k'),
      (attr_id, 'Latex Free', 'latex_free'),
      (attr_id, 'Powder Free', 'powder_free')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;

  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'texture' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, 'Textured Fingertips', 'fingertip_textured'),
      (attr_id, 'Micro Textured', 'micro_textured'),
      (attr_id, 'Diamond Texture', 'diamond_texture')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;

  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'size' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, 'X-Large', 'xl'),
      (attr_id, 'X-Small', 'xs'),
      (attr_id, '3XL', 'xxxl')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;

  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'powder' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
      (attr_id, 'Powder Free', 'powder_free')
    ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
  END IF;
END $$;
