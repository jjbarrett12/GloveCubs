-- Review metadata for variant family inference (scores, flags) — family-first workflow.

ALTER TABLE catalogos.supplier_products_normalized
  ADD COLUMN IF NOT EXISTS family_group_meta JSONB;

COMMENT ON COLUMN catalogos.supplier_products_normalized.family_group_meta IS
  'Deterministic inference audit: score breakdown, title similarity, guard flags (v1 schema).';
