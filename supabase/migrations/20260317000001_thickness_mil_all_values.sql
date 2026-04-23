-- =============================================================================
-- Thickness (mil): list all thicknesses 2–20; remove 7_plus catch-all.
-- Ensures "12mil", "12-mil", "12 mil" normalize to one filter value "12".
-- =============================================================================

DO $$
DECLARE
  attr_id UUID;
  dg_id UUID;
  ord INT;
BEGIN
  SELECT id INTO dg_id FROM catalogos.categories WHERE slug = 'disposable_gloves' LIMIT 1;
  IF dg_id IS NULL THEN RAISE EXCEPTION 'Category disposable_gloves not found'; END IF;

  SELECT id INTO attr_id FROM catalogos.attribute_definitions WHERE category_id = dg_id AND attribute_key = 'thickness_mil' LIMIT 1;
  IF attr_id IS NULL THEN RAISE EXCEPTION 'thickness_mil attribute not found'; END IF;

  -- Insert thicknesses 7 through 20 (so all thicknesses are listed, not 7+)
  FOR ord IN 7..20 LOOP
    INSERT INTO catalogos.attribute_allowed_values (attribute_definition_id, value_text, sort_order)
    VALUES (attr_id, ord::TEXT, ord)
    ON CONFLICT (attribute_definition_id, value_text) DO UPDATE SET sort_order = EXCLUDED.sort_order;
  END LOOP;

  -- Optional: remove 7_plus so only explicit thicknesses remain (uncomment to drop legacy value)
  -- DELETE FROM catalogos.attribute_allowed_values WHERE attribute_definition_id = attr_id AND value_text = '7_plus';
END $$;
