-- =============================================================================
-- Phase 3E.C.1b — filter seed parity (0.5 mil, 10,000 units/case, PE synonyms)
-- Idempotent: safe to re-run.
-- =============================================================================

-- thickness_mil: 0.5 (disposable gloves)
DO $$
DECLARE
  attr_id UUID;
BEGIN
  SELECT ad.id INTO attr_id
  FROM catalogos.attribute_definitions ad
  JOIN catalogos.categories c ON c.id = ad.category_id
  WHERE c.slug = 'disposable_gloves' AND ad.attribute_key = 'thickness_mil'
  LIMIT 1;

  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
    VALUES (attr_id, '0.5', 0)
    ON CONFLICT (attribute_definition_id, value_text) DO UPDATE SET sort_order = EXCLUDED.sort_order;
  END IF;
END $$;

-- units_per_case: 10000 (disposable + reusable work gloves)
DO $$
DECLARE
  cat_rec RECORD;
  attr_id UUID;
BEGIN
  FOR cat_rec IN
    SELECT id FROM catalogos.categories WHERE slug IN ('disposable_gloves', 'reusable_work_gloves')
  LOOP
    SELECT id INTO attr_id
    FROM catalogos.attribute_definitions
    WHERE category_id = cat_rec.id AND attribute_key = 'units_per_case'
    LIMIT 1;

    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
      VALUES (attr_id, '10000', 10000)
      ON CONFLICT (attribute_definition_id, value_text) DO UPDATE SET sort_order = EXCLUDED.sort_order;
    END IF;
  END LOOP;
END $$;

-- material synonyms: HDPE / polyethylene display text → polyethylene_pe
DO $$
DECLARE
  cat_rec RECORD;
  attr_id UUID;
BEGIN
  FOR cat_rec IN
    SELECT id FROM catalogos.categories WHERE slug IN ('disposable_gloves', 'reusable_work_gloves')
  LOOP
    SELECT id INTO attr_id
    FROM catalogos.attribute_definitions
    WHERE category_id = cat_rec.id AND attribute_key = 'material'
    LIMIT 1;

    IF attr_id IS NOT NULL THEN
      INSERT INTO catalogos.attribute_value_synonyms (attribute_definition_id, raw_value, normalized_value) VALUES
        (attr_id, 'hdpe', 'polyethylene_pe'),
        (attr_id, 'high density polyethylene', 'polyethylene_pe'),
        (attr_id, 'polyethylene', 'polyethylene_pe')
      ON CONFLICT (attribute_definition_id, raw_value) DO NOTHING;
    END IF;
  END LOOP;
END $$;
