-- =============================================================================
-- Bulk quote requests: B2B lead capture for "Request bulk pricing".
-- Schema: catalogos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalogos.bulk_quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalogos.products(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  email TEXT NOT NULL,
  boxes_per_month INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_quote_requests_product ON catalogos.bulk_quote_requests (product_id);
CREATE INDEX IF NOT EXISTS idx_bulk_quote_requests_created ON catalogos.bulk_quote_requests (created_at DESC);

COMMENT ON TABLE catalogos.bulk_quote_requests IS 'B2B bulk pricing requests from product cards and product pages.';
