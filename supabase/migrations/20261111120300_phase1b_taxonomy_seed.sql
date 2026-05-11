-- =============================================================================
-- Phase 1B taxonomy seed — wipes, can liners, paper towels, soap/sanitizer
-- =============================================================================
-- Purpose:
--   Seed catalogos.categories rows + per-category attribute_definitions rows
--   so CatalogOS can promote SKUs into these supporting-consumable categories
--   without ad-hoc taxonomy drift. Public exposure (storefront filters and
--   nav) stays gated until products actually land in each category.
--
-- Doctrine:
--   No empty-filter categories may launch publicly. attribute_definitions are
--   inserted now so promotion has a target; storefront facet rendering is
--   already empty-tolerant (returns no chips when no products carry a value).
--
-- Idempotency:
--   ON CONFLICT (slug) / (category_id, attribute_key) DO NOTHING. Safe to re-run.
--
-- Schema reminder (from 20260311000001_catalogos_schema_full.sql +
-- 20260316000001_catalogos_attribute_dictionary.sql):
--   catalogos.categories (slug UNIQUE, name, description, sort_order)
--   catalogos.attribute_definitions (
--     category_id, attribute_key, label, value_type, data_type,
--     cardinality, display_group, is_required, is_filterable, sort_order
--   )
--
-- Rollback (manual; data must be empty first or cascade will hit products):
--   DELETE FROM catalogos.attribute_definitions
--     WHERE category_id IN (SELECT id FROM catalogos.categories
--       WHERE slug IN ('wipes','can-liners','paper-towels','soap-sanitizer'));
--   DELETE FROM catalogos.categories
--     WHERE slug IN ('wipes','can-liners','paper-towels','soap-sanitizer');
-- =============================================================================

INSERT INTO catalogos.categories (slug, name, description, sort_order)
VALUES
  ('wipes',           'Wipes',                  'Industrial and janitorial wipes (dry, wet, disinfecting).', 200),
  ('can-liners',      'Can liners',             'Trash can liners and bag rolls.',                            210),
  ('paper-towels',    'Paper towels',           'Roll, multi-fold, and center-pull paper towels.',            220),
  ('soap-sanitizer',  'Soap and sanitizer',     'Hand soap and hand sanitizer (foam, gel, liquid).',          230)
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- WIPES
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM catalogos.categories WHERE slug = 'wipes' LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE NOTICE 'phase1b: wipes category not found; skipping attributes';
    RETURN;
  END IF;

  INSERT INTO catalogos.attribute_definitions (
    category_id, attribute_key, label, value_type, data_type, cardinality,
    display_group, is_required, is_filterable, sort_order
  ) VALUES
    (cat_id, 'material',       'Material',         'string',       'string',       'single', 'wipes_specs',     true,  true,  10),
    (cat_id, 'wipe_type',      'Wipe type',        'string',       'string',       'single', 'wipes_specs',     true,  true,  20),
    (cat_id, 'packaging',      'Packaging',        'string',       'string',       'single', 'wipes_specs',     false, true,  30),
    (cat_id, 'pack_size',      'Pack size',        'number',       'number',       'single', 'wipes_specs',     false, true,  40),
    (cat_id, 'industries',     'Industries',       'string_array', 'string_array', 'multi',  'commercial',      false, true, 100),
    (cat_id, 'uses',           'Uses',             'string_array', 'string_array', 'multi',  'commercial',      false, true, 105),
    (cat_id, 'certifications', 'Certifications',   'string_array', 'string_array', 'multi',  'commercial',      false, true, 110)
  ON CONFLICT (category_id, attribute_key) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- CAN LINERS
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM catalogos.categories WHERE slug = 'can-liners' LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE NOTICE 'phase1b: can-liners category not found; skipping attributes';
    RETURN;
  END IF;

  INSERT INTO catalogos.attribute_definitions (
    category_id, attribute_key, label, value_type, data_type, cardinality,
    display_group, is_required, is_filterable, sort_order
  ) VALUES
    (cat_id, 'material',     'Material',     'string',       'string',       'single', 'liner_specs', true,  true,  10),
    (cat_id, 'gauge_mil',    'Gauge (mil)',  'number',       'number',       'single', 'liner_specs', false, true,  20),
    (cat_id, 'capacity_gal', 'Capacity (gal)','number',      'number',       'single', 'liner_specs', false, true,  30),
    (cat_id, 'color',        'Color',        'string',       'string',       'single', 'liner_specs', false, true,  40),
    (cat_id, 'pack_size',    'Pack size',    'number',       'number',       'single', 'liner_specs', false, true,  50),
    (cat_id, 'industries',   'Industries',   'string_array', 'string_array', 'multi',  'commercial',  false, true, 100),
    (cat_id, 'uses',         'Uses',         'string_array', 'string_array', 'multi',  'commercial',  false, true, 105)
  ON CONFLICT (category_id, attribute_key) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- PAPER TOWELS
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM catalogos.categories WHERE slug = 'paper-towels' LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE NOTICE 'phase1b: paper-towels category not found; skipping attributes';
    RETURN;
  END IF;

  INSERT INTO catalogos.attribute_definitions (
    category_id, attribute_key, label, value_type, data_type, cardinality,
    display_group, is_required, is_filterable, sort_order
  ) VALUES
    (cat_id, 'format',       'Format',         'string',       'string',       'single', 'towel_specs', true,  true,  10),
    (cat_id, 'ply',          'Ply',            'number',       'number',       'single', 'towel_specs', false, true,  20),
    (cat_id, 'sheet_count',  'Sheets per roll','number',       'number',       'single', 'towel_specs', false, true,  30),
    (cat_id, 'pack_size',    'Pack size',      'number',       'number',       'single', 'towel_specs', false, true,  40),
    (cat_id, 'industries',   'Industries',     'string_array', 'string_array', 'multi',  'commercial',  false, true, 100),
    (cat_id, 'uses',         'Uses',           'string_array', 'string_array', 'multi',  'commercial',  false, true, 105)
  ON CONFLICT (category_id, attribute_key) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- SOAP / SANITIZER
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM catalogos.categories WHERE slug = 'soap-sanitizer' LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE NOTICE 'phase1b: soap-sanitizer category not found; skipping attributes';
    RETURN;
  END IF;

  INSERT INTO catalogos.attribute_definitions (
    category_id, attribute_key, label, value_type, data_type, cardinality,
    display_group, is_required, is_filterable, sort_order
  ) VALUES
    (cat_id, 'formulation',           'Formulation',           'string',       'string',       'single', 'soap_specs',  true,  true,  10),
    (cat_id, 'alcohol_pct',           'Alcohol %',             'number',       'number',       'single', 'soap_specs',  false, true,  20),
    (cat_id, 'dispenser_compatible',  'Dispenser compatible',  'string',       'string',       'single', 'soap_specs',  false, true,  30),
    (cat_id, 'packaging',             'Packaging',             'string',       'string',       'single', 'soap_specs',  false, true,  40),
    (cat_id, 'pack_size',             'Pack size',             'number',       'number',       'single', 'soap_specs',  false, true,  50),
    (cat_id, 'industries',            'Industries',            'string_array', 'string_array', 'multi',  'commercial',  false, true, 100),
    (cat_id, 'uses',                  'Uses',                  'string_array', 'string_array', 'multi',  'commercial',  false, true, 105),
    (cat_id, 'certifications',        'Certifications',        'string_array', 'string_array', 'multi',  'commercial',  false, true, 110)
  ON CONFLICT (category_id, attribute_key) DO NOTHING;
END $$;
