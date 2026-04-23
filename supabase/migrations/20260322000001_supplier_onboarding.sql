-- =============================================================================
-- Supplier Onboarding Agent: requests, steps, files.
-- Schema: catalogos. Integrates with suppliers and supplier_feeds.
-- =============================================================================

-- Workflow status: linear progression with optional reject.
CREATE TABLE catalogos.supplier_onboarding_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  website TEXT,
  contact_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  feed_type TEXT CHECK (feed_type IN ('url', 'csv', 'api', 'pdf', 'google_sheet')),
  feed_url TEXT,
  feed_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  pricing_basis_hints TEXT,
  packaging_hints TEXT,
  categories_supplied TEXT[] DEFAULT '{}',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN (
    'initiated',
    'waiting_for_supplier',
    'ready_for_review',
    'approved',
    'created_supplier',
    'feed_created',
    'ingestion_triggered',
    'completed',
    'rejected'
  )),
  source_lead_id UUID REFERENCES catalogos.supplier_leads(id) ON DELETE SET NULL,
  assigned_owner_id TEXT,
  created_supplier_id UUID REFERENCES catalogos.suppliers(id) ON DELETE SET NULL,
  created_feed_id UUID REFERENCES catalogos.supplier_feeds(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_onboarding_requests_status ON catalogos.supplier_onboarding_requests (status);
CREATE INDEX idx_supplier_onboarding_requests_created ON catalogos.supplier_onboarding_requests (created_at DESC);

COMMENT ON TABLE catalogos.supplier_onboarding_requests IS 'Onboarding request; progresses to supplier + feed creation and ingestion.';

-- Audit steps / state transitions.
CREATE TABLE catalogos.supplier_onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES catalogos.supplier_onboarding_requests(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_onboarding_steps_request ON catalogos.supplier_onboarding_steps (request_id);

COMMENT ON TABLE catalogos.supplier_onboarding_steps IS 'Audit log of onboarding steps and state changes.';

-- File uploads (PDF, CSV, etc.); store key references Supabase Storage or path.
CREATE TABLE catalogos.supplier_onboarding_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES catalogos.supplier_onboarding_requests(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  file_kind TEXT CHECK (file_kind IN ('catalog_pdf', 'catalog_csv', 'price_list', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_onboarding_files_request ON catalogos.supplier_onboarding_files (request_id);

COMMENT ON TABLE catalogos.supplier_onboarding_files IS 'Uploaded files for onboarding (catalog PDF/CSV, etc.).';
