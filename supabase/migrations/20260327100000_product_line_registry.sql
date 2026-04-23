-- =============================================================================
-- Product line registry: decouple canonical catalog rows from glove-only naming.
-- - catalogos.product_line_definitions: stable codes for merchandising / search / pricing rules
-- - catalogos.category_product_line: maps category slug → line (extend when onboarding SKUs)
-- public.canonical_products.product_line_code and extended sync_canonical_products:
--   see 20260404000011_canonical_products_product_line_registry.sql (runs after canonical_products exists).
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.product_line_definitions (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.product_line_definitions IS 'Business product lines (PPE gloves, eye protection, etc.); categories map here—avoid hardcoding category slugs in app logic.';

CREATE TABLE IF NOT EXISTS catalogos.category_product_line (
  category_slug TEXT PRIMARY KEY,
  product_line_code TEXT NOT NULL REFERENCES catalogos.product_line_definitions(code) ON DELETE RESTRICT
);

COMMENT ON TABLE catalogos.category_product_line IS 'Maps catalogos.categories.slug → product_line_code; add a row per new category for correct line assignment.';

INSERT INTO catalogos.product_line_definitions (code, display_name, description) VALUES
  ('ppe_gloves', 'Hand protection (gloves)', 'Disposable and reusable gloves; legacy canonical column glove_type applies to this line.'),
  ('ppe_eye', 'Eye protection', 'Safety glasses, goggles, face shields.'),
  ('ppe_respiratory', 'Respiratory protection', 'Masks, respirators, cartridges.'),
  ('ppe_apparel', 'Protective apparel', 'Coveralls, sleeves, disposable garments.'),
  ('facility_consumables', 'Facility consumables', 'Wipers, soaps, sanitizers, non-wearable supplies.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO catalogos.category_product_line (category_slug, product_line_code) VALUES
  ('disposable_gloves', 'ppe_gloves'),
  ('industrial_gloves', 'ppe_gloves'),
  ('liners', 'ppe_gloves'),
  ('safety_glasses', 'ppe_eye'),
  ('face_masks', 'ppe_respiratory'),
  ('disposable_apparel', 'ppe_apparel'),
  ('hand_hygiene', 'facility_consumables'),
  ('wipers', 'facility_consumables')
ON CONFLICT (category_slug) DO UPDATE SET
  product_line_code = EXCLUDED.product_line_code;
