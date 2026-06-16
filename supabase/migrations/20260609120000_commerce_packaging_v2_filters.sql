-- =============================================================================
-- Commerce Packaging Phase 2A — filter attribute seeds (idempotent)
-- Adds units_per_case, cases_per_pallet, pallet_pricing_available.
-- Hides box_quantity / pack_quantity from storefront filtering.
-- =============================================================================

DO $$
DECLARE
  dg_id UUID;
  rw_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;
  SELECT id INTO rw_id FROM catalogos.categories WHERE slug = 'reusable_work_gloves' LIMIT 1;

  IF dg_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_definitions (
      category_id, attribute_key, label, value_type, data_type, cardinality,
      display_group, is_required, is_filterable, sort_order
    ) VALUES
      (dg_id, 'units_per_case', 'Units per case', 'string', 'string', 'single', 'disposable_specs', false, true, 57),
      (dg_id, 'cases_per_pallet', 'Cases per pallet', 'string', 'string', 'single', 'disposable_specs', false, true, 58),
      (dg_id, 'pallet_pricing_available', 'Pallet pricing available', 'string', 'string', 'single', 'disposable_specs', false, true, 59)
    ON CONFLICT (category_id, attribute_key) DO UPDATE SET
      label = EXCLUDED.label,
      is_filterable = EXCLUDED.is_filterable,
      sort_order = EXCLUDED.sort_order,
      updated_at = NOW();

    UPDATE catalogos.attribute_definitions
    SET is_filterable = false, updated_at = NOW()
    WHERE category_id = dg_id AND attribute_key IN ('box_quantity', 'pack_quantity');
  END IF;

  IF rw_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_definitions (
      category_id, attribute_key, label, value_type, data_type, cardinality,
      display_group, is_required, is_filterable, sort_order
    ) VALUES
      (rw_id, 'units_per_case', 'Units per case', 'string', 'string', 'single', 'work_glove_specs', false, true, 49),
      (rw_id, 'cases_per_pallet', 'Cases per pallet', 'string', 'string', 'single', 'work_glove_specs', false, true, 50),
      (rw_id, 'pallet_pricing_available', 'Pallet pricing available', 'string', 'string', 'single', 'work_glove_specs', false, true, 51)
    ON CONFLICT (category_id, attribute_key) DO UPDATE SET
      label = EXCLUDED.label,
      is_filterable = EXCLUDED.is_filterable,
      sort_order = EXCLUDED.sort_order,
      updated_at = NOW();

    UPDATE catalogos.attribute_definitions
    SET is_filterable = false, updated_at = NOW()
    WHERE category_id = rw_id AND attribute_key = 'pack_quantity';
  END IF;
END $$;

-- Allowed values: units_per_case
DO $$
DECLARE
  cat_rec RECORD;
  vals TEXT[] := ARRAY['50','72','100','250','500','600','720','1000','1500','2000','2500','3000'];
  v TEXT;
  attr_id UUID;
BEGIN
  FOR cat_rec IN SELECT id FROM catalogos.categories WHERE slug IN ('disposable_gloves', 'reusable_work_gloves')
  LOOP
    SELECT id INTO attr_id FROM catalogos.attribute_definitions
    WHERE category_id = cat_rec.id AND attribute_key = 'units_per_case' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      FOREACH v IN ARRAY vals LOOP
        INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
        VALUES (attr_id, v, v::INT)
        ON CONFLICT (attribute_definition_id, value_text) DO UPDATE SET sort_order = EXCLUDED.sort_order;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Allowed values: cases_per_pallet
DO $$
DECLARE
  cat_rec RECORD;
  vals TEXT[] := ARRAY['40','48','50','56','60','70','72','80','84','90','96','100','120'];
  v TEXT;
  attr_id UUID;
BEGIN
  FOR cat_rec IN SELECT id FROM catalogos.categories WHERE slug IN ('disposable_gloves', 'reusable_work_gloves')
  LOOP
    SELECT id INTO attr_id FROM catalogos.attribute_definitions
    WHERE category_id = cat_rec.id AND attribute_key = 'cases_per_pallet' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      FOREACH v IN ARRAY vals LOOP
        INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
        VALUES (attr_id, v, v::INT)
        ON CONFLICT (attribute_definition_id, value_text) DO UPDATE SET sort_order = EXCLUDED.sort_order;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Allowed values: pallet_pricing_available
DO $$
DECLARE
  cat_rec RECORD;
  attr_id UUID;
BEGIN
  FOR cat_rec IN SELECT id FROM catalogos.categories WHERE slug IN ('disposable_gloves', 'reusable_work_gloves')
  LOOP
    SELECT id INTO attr_id FROM catalogos.attribute_definitions
    WHERE category_id = cat_rec.id AND attribute_key = 'pallet_pricing_available' LIMIT 1;
    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      VALUES (attr_id, 'yes', 1)
      ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
    END IF;
  END LOOP;
END $$;
