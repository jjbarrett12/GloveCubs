-- Admin catalog audit trail (extends review_decisions with fine-grained edits and publish events).
-- catalogos schema; service role used by CatalogOS dashboard.

CREATE TABLE IF NOT EXISTS catalogos.admin_catalog_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_id UUID REFERENCES catalogos.supplier_products_normalized(id) ON DELETE SET NULL,
  product_id UUID REFERENCES catalogos.products(id) ON DELETE SET NULL,
  supplier_offer_id UUID,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'admin',
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_catalog_audit_normalized
  ON catalogos.admin_catalog_audit (normalized_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_catalog_audit_product
  ON catalogos.admin_catalog_audit (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_catalog_audit_created
  ON catalogos.admin_catalog_audit (created_at DESC);

COMMENT ON TABLE catalogos.admin_catalog_audit IS 'Fine-grained admin actions: attribute edits, publish, unpublish, offer updates.';

ALTER TABLE catalogos.admin_catalog_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogos_admin_all_admin_catalog_audit"
  ON catalogos.admin_catalog_audit FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');
