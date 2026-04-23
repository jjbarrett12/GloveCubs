-- =============================================================================
-- Remove legacy thickness_mil value "7_plus" from attribute_allowed_values.
-- Run after data migration (TypeScript migrateThickness7Plus) so existing rows
-- have been updated to canonical numeric thickness. Facet layer also excludes
-- 7_plus from counts so it no longer surfaces on the storefront.
-- Version bumped from 20260318000001 (duplicate with products_slug) for
-- single canonical migration stream on empty databases.
-- =============================================================================

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
    DELETE FROM catalogos.attribute_allowed_values
    WHERE attribute_definition_id = attr_id AND value_text = '7_plus';
  END IF;
END $$;
