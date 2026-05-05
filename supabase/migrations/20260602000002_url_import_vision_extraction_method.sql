-- Allow vision-based URL import rows (image URL → model extraction).
ALTER TABLE catalogos.url_import_products
  DROP CONSTRAINT IF EXISTS url_import_products_extraction_method_check;

ALTER TABLE catalogos.url_import_products
  ADD CONSTRAINT url_import_products_extraction_method_check
  CHECK (extraction_method IN ('deterministic', 'ai_fallback', 'vision_ai'));
