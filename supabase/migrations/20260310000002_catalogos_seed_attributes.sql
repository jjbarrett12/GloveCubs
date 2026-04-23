-- CatalogOS: seed attribute definitions for disposable gloves (Phase 1)
INSERT INTO catalogos_attribute_definitions (category, attribute_key, label, value_type, allowed_values) VALUES
  ('disposable_gloves', 'product_type', 'Product type', 'string', '["exam", "industrial", "food_service", "chemical", "general_purpose"]'::jsonb),
  ('disposable_gloves', 'material', 'Material', 'string', '["nitrile", "latex", "vinyl", "polyethylene"]'::jsonb),
  ('disposable_gloves', 'color', 'Color', 'string', '["black", "blue", "white", "grey", "green", "purple", "pink", "orange", "yellow", "clear"]'::jsonb),
  ('disposable_gloves', 'size', 'Size', 'string', '["XS", "S", "M", "L", "XL", "XXL", "one_size"]'::jsonb),
  ('disposable_gloves', 'thickness_mil', 'Thickness (mil)', 'number', NULL),
  ('disposable_gloves', 'powder_free', 'Powder free', 'boolean', NULL),
  ('disposable_gloves', 'latex_free', 'Latex free', 'boolean', NULL),
  ('disposable_gloves', 'case_qty', 'Case quantity', 'number', NULL),
  ('disposable_gloves', 'medical_grade', 'Medical grade', 'boolean', NULL),
  ('disposable_gloves', 'food_safe', 'Food safe', 'boolean', NULL),
  ('disposable_gloves', 'grip_texture', 'Grip texture', 'string', '["smooth", "textured", "grip", "micro_roughened"]'::jsonb),
  ('disposable_gloves', 'brand', 'Brand', 'string', NULL)
ON CONFLICT (category, attribute_key) DO NOTHING;

-- Sample supplier for testing (slug unique)
INSERT INTO catalogos_suppliers (name, slug, is_active) VALUES ('Sample Supplier', 'sample-supplier', true)
ON CONFLICT (slug) DO NOTHING;
