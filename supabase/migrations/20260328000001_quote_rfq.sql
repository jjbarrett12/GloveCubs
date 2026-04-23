-- =============================================================================
-- Quote / RFQ flow: quote_requests, quote_line_items, quote_files.
-- Schema: catalogos. B2B buyer quote requests from catalog.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- quote_requests
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  urgency TEXT CHECK (urgency IN ('standard', 'urgent', 'asap')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new',
    'reviewing',
    'contacted',
    'quoted',
    'closed'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_requests_status ON catalogos.quote_requests (status);
CREATE INDEX idx_quote_requests_created ON catalogos.quote_requests (created_at DESC);

COMMENT ON TABLE catalogos.quote_requests IS 'Buyer quote/RFQ submissions from storefront.';

-- -----------------------------------------------------------------------------
-- quote_line_items
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.quote_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES catalogos.quote_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES catalogos.products(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes TEXT,
  product_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_line_items_quote ON catalogos.quote_line_items (quote_request_id);

COMMENT ON TABLE catalogos.quote_line_items IS 'Line items per quote request; product_snapshot preserves name/slug/sku at submit time.';

-- -----------------------------------------------------------------------------
-- quote_files (optional file uploads)
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.quote_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES catalogos.quote_requests(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_files_quote ON catalogos.quote_files (quote_request_id);

COMMENT ON TABLE catalogos.quote_files IS 'Optional file uploads attached to quote request.';
