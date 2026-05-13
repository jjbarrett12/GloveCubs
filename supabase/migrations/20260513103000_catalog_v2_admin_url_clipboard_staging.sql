-- Admin clipboard URL staging: paste product page + optional image URL before CatalogOS crawl or as offline evidence.
-- Never auto-publishes; operators promote to a draft catalog_product manually.

CREATE TABLE IF NOT EXISTS catalog_v2.admin_url_clipboard_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_page_url TEXT NOT NULL,
  image_url TEXT,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'dismissed', 'converted_to_draft')),
  created_catalog_product_id UUID REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_url_clipboard_staging_status
  ON catalog_v2.admin_url_clipboard_staging (review_status, created_at DESC);

COMMENT ON TABLE catalog_v2.admin_url_clipboard_staging IS
  'Operator-pasted URLs with lightweight HTML evidence; review before any catalog write.';
