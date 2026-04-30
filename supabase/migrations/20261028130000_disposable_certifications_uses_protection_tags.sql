-- Disposable gloves: canonical certifications (replaces compliance_certifications for writes),
-- plus uses and protection_tags multi-select facets. Migrates existing PA rows to certifications.

DO $$
DECLARE
  dg_id UUID;
  old_comp_id UUID;
  cert_id UUID;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;
  IF dg_id IS NULL THEN RAISE EXCEPTION 'disposable_gloves category not found'; END IF;

  INSERT INTO catalogos.attribute_definitions (
    category_id, attribute_key, label, value_type, data_type, cardinality, display_group, is_required, is_filterable, sort_order
  ) VALUES
    (dg_id, 'certifications', 'Certifications', 'string_array', 'string_array', 'multi', 'disposable_specs', false, true, 100),
    (dg_id, 'uses', 'Uses', 'string_array', 'string_array', 'multi', 'disposable_specs', false, true, 105),
    (dg_id, 'protection_tags', 'Protection tags', 'string_array', 'string_array', 'multi', 'disposable_specs', false, true, 110)
  ON CONFLICT (category_id, attribute_key) DO UPDATE SET
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    display_group = EXCLUDED.display_group,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

  SELECT id INTO old_comp_id FROM catalogos.attribute_definitions
  WHERE category_id = dg_id AND attribute_key = 'compliance_certifications' LIMIT 1;

  SELECT id INTO cert_id FROM catalogos.attribute_definitions
  WHERE category_id = dg_id AND attribute_key = 'certifications' LIMIT 1;

  IF old_comp_id IS NOT NULL AND cert_id IS NOT NULL THEN
    INSERT INTO catalogos.product_attributes (product_id, attribute_definition_id, value_text, value_number, value_boolean)
    SELECT pa.product_id, cert_id, pa.value_text, pa.value_number, pa.value_boolean
    FROM catalogos.product_attributes pa
    WHERE pa.attribute_definition_id = old_comp_id
      AND NOT EXISTS (
        SELECT 1 FROM catalogos.product_attributes x
        WHERE x.product_id = pa.product_id
          AND x.attribute_definition_id = cert_id
          AND COALESCE(x.value_text, '') = COALESCE(pa.value_text, '')
      );

    DELETE FROM catalogos.product_attributes pa
    WHERE pa.attribute_definition_id = old_comp_id;

    UPDATE catalogos.attribute_definitions
    SET is_filterable = false,
        label = 'Legacy: compliance_certifications (migrated to certifications)',
        sort_order = 9990,
        updated_at = NOW()
    WHERE id = old_comp_id;
  END IF;
END $$;

-- Allowed values: certifications mirror former compliance list
DO $$
DECLARE
  dg_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;

  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'certifications' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
    SELECT attr_id, v, ord FROM (VALUES
      ('fda_approved', 1), ('astm_tested', 2), ('food_safe', 3), ('latex_free', 4), ('chemo_rated', 5), ('en_455', 6), ('en_374', 7)
    ) AS t(v, ord)
    ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
  END IF;

  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'uses' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
    SELECT attr_id, v, ord FROM (VALUES
      ('general_purpose', 1), ('medical_exam', 2), ('patient_care', 3), ('food_handling', 4), ('laboratory', 5),
      ('chemical_handling', 6), ('industrial_maintenance', 7), ('cleanroom', 8)
    ) AS t(v, ord)
    ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
  END IF;

  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'protection_tags' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
    SELECT attr_id, v, ord FROM (VALUES
      ('chemical_resistant', 1), ('puncture_resistant', 2), ('viral_barrier', 3), ('biohazard', 4),
      ('static_control', 5), ('grip_enhanced', 6), ('abrasion_enhanced', 7)
    ) AS t(v, ord)
    ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
  END IF;
END $$;
