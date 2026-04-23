-- =============================================================================
-- CatalogOS — Seed: categories, disposable_gloves attribute definitions,
-- attribute_allowed_values (material, color, size, etc.)
-- =============================================================================

-- Categories (Phase 1: disposable gloves first; expand later)
INSERT INTO catalogos.categories (slug, name, description, sort_order) VALUES
  ('disposable_gloves', 'Disposable Gloves', 'Exam, industrial, food service disposable gloves', 10),
  ('industrial_gloves', 'Industrial Gloves', 'Reusable industrial work gloves', 20),
  ('safety_glasses', 'Safety Glasses', 'Eye protection', 30),
  ('face_masks', 'Face Masks', 'Disposable and reusable masks', 40),
  ('disposable_apparel', 'Disposable Apparel', 'Coveralls, sleeves, etc.', 50),
  ('hand_hygiene', 'Hand Hygiene', 'Soaps, sanitizers', 60),
  ('wipers', 'Wipers', 'Shop towels, wipes', 70),
  ('liners', 'Liners', 'Glove liners', 80)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Resolve category id for disposable_gloves (for attribute_definitions)
DO $$
DECLARE
  cat_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO cat_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE EXCEPTION 'Category disposable_gloves not found';
  END IF;

  -- Attribute definitions for disposable gloves (required/filterable as needed)
  INSERT INTO catalogos.attribute_definitions (category_id, attribute_key, label, value_type, is_required, is_filterable, sort_order) VALUES
    (cat_id, 'material', 'Material', 'string', false, true, 10),
    (cat_id, 'color', 'Color', 'string', false, true, 20),
    (cat_id, 'size', 'Size', 'string', false, true, 30),
    (cat_id, 'thickness_mil', 'Thickness (mil)', 'number', false, true, 40),
    (cat_id, 'powder_free', 'Powder free', 'boolean', false, true, 50),
    (cat_id, 'latex_free', 'Latex free', 'boolean', false, true, 60),
    (cat_id, 'case_qty', 'Case quantity', 'number', false, true, 70),
    (cat_id, 'medical_grade', 'Medical grade', 'boolean', false, true, 80),
    (cat_id, 'food_safe', 'Food safe', 'boolean', false, true, 90),
    (cat_id, 'grip_texture', 'Grip texture', 'string', false, true, 100),
    (cat_id, 'brand', 'Brand', 'string', false, true, 110)
  ON CONFLICT (category_id, attribute_key) DO UPDATE SET
    label = EXCLUDED.label,
    value_type = EXCLUDED.value_type,
    is_filterable = EXCLUDED.is_filterable,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

  -- Allowed values for material
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'material' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
    SELECT attr_id, v, ord FROM (VALUES
      ('nitrile', 1), ('latex', 2), ('vinyl', 3), ('polyethylene', 4)
    ) AS t(v, ord)
    ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
  END IF;

  -- Allowed values for color
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'color' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
    SELECT attr_id, v, ord FROM (VALUES
      ('black', 1), ('blue', 2), ('white', 3), ('grey', 4), ('green', 5), ('purple', 6), ('pink', 7), ('orange', 8), ('yellow', 9), ('clear', 10)
    ) AS t(v, ord)
    ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
  END IF;

  -- Allowed values for size
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'size' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
    SELECT attr_id, v, ord FROM (VALUES
      ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5), ('XXL', 6), ('one_size', 7)
    ) AS t(v, ord)
    ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
  END IF;

  -- Allowed values for grip_texture
  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = cat_id AND attribute_key = 'grip_texture' LIMIT 1;
  IF attr_id IS NOT NULL THEN
    INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
    SELECT attr_id, v, ord FROM (VALUES
      ('smooth', 1), ('textured', 2), ('grip', 3), ('micro_roughened', 4)
    ) AS t(v, ord)
    ON CONFLICT (attribute_definition_id, value_text) DO NOTHING;
  END IF;
END $$;

-- Optional: sample supplier and default pricing rule for testing
INSERT INTO catalogos.suppliers (name, slug, is_active) VALUES ('Sample Supplier', 'sample-supplier', true)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

-- Default margin rule (priority 0); scope is global when scope_* are null
INSERT INTO catalogos.pricing_rules (rule_type, margin_percent, priority)
SELECT 'default_margin', 35, 0
WHERE NOT EXISTS (SELECT 1 FROM catalogos.pricing_rules WHERE rule_type = 'default_margin' AND scope_category_id IS NULL AND scope_supplier_id IS NULL AND scope_product_id IS NULL);
