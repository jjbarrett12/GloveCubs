-- =============================================================================
-- CatalogOS — RLS (Row Level Security) recommendations
-- Internal admin-only: enable RLS and allow service_role / authenticated admin.
-- Apply after schema and seed. Adjust role names to match your Supabase auth.
-- =============================================================================

-- Enable RLS on all catalogos tables (no policy = deny all for anon; service_role bypasses RLS)
ALTER TABLE catalogos.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.attribute_allowed_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.import_batch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.ingestion_job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_products_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_products_normalized ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.publish_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.review_decisions ENABLE ROW LEVEL SECURITY;

-- Policy: allow full access for service_role (backend ingestion/publish) and for a dedicated admin role
-- Supabase service_role bypasses RLS by default; these policies apply to authenticated users.

-- Use a single "catalogos_admin" role or map to your auth.admin claim.
-- Example: allow if auth.jwt() ->> 'role' = 'admin' or auth.role() = 'service_role'

CREATE POLICY "catalogos_admin_all_suppliers"
  ON catalogos.suppliers FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_supplier_contacts"
  ON catalogos.supplier_contacts FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_supplier_feeds"
  ON catalogos.supplier_feeds FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_categories"
  ON catalogos.categories FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_brands"
  ON catalogos.brands FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_attribute_definitions"
  ON catalogos.attribute_definitions FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_attribute_allowed_values"
  ON catalogos.attribute_allowed_values FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_products"
  ON catalogos.products FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_product_attributes"
  ON catalogos.product_attributes FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_product_images"
  ON catalogos.product_images FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_ingestion_jobs"
  ON catalogos.ingestion_jobs FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_import_batches"
  ON catalogos.import_batches FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_import_batch_logs"
  ON catalogos.import_batch_logs FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_ingestion_job_logs"
  ON catalogos.ingestion_job_logs FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_supplier_products_raw"
  ON catalogos.supplier_products_raw FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_supplier_products_normalized"
  ON catalogos.supplier_products_normalized FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_supplier_offers"
  ON catalogos.supplier_offers FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_pricing_rules"
  ON catalogos.pricing_rules FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_publish_events"
  ON catalogos.publish_events FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "catalogos_admin_all_review_decisions"
  ON catalogos.review_decisions FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');
