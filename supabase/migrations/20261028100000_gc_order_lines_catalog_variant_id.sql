-- Link gc_commerce.order_lines to catalog_v2.catalog_variants for variant-based purchasing.

ALTER TABLE gc_commerce.order_lines
  ADD COLUMN IF NOT EXISTS catalog_variant_id UUID;

COMMENT ON COLUMN gc_commerce.order_lines.catalog_variant_id IS
  'catalog_v2.catalog_variants.id when the line is variant-scoped; NULL for legacy rows pre–variant cutover.';

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'gc_commerce' AND t.relname = 'order_lines' AND c.conname = 'fk_gc_order_lines_catalog_variant'
  ) THEN
    ALTER TABLE gc_commerce.order_lines
      ADD CONSTRAINT fk_gc_order_lines_catalog_variant
      FOREIGN KEY (catalog_variant_id)
      REFERENCES catalog_v2.catalog_variants (id)
      ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS idx_gc_order_lines_catalog_variant_id
  ON gc_commerce.order_lines (catalog_variant_id)
  WHERE catalog_variant_id IS NOT NULL;
