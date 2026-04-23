-- =============================================================================
-- Supplier Discovery Agent: leads, contacts, runs, events.
-- Schema: catalogos. Prevents duplicate leads by domain.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- supplier_leads
-- One row per potential supplier; domain is unique.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.supplier_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  website TEXT,
  domain TEXT,
  source_url TEXT,
  discovery_method TEXT NOT NULL DEFAULT 'manual',
  product_categories TEXT[] DEFAULT '{}',
  catalog_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  api_signal BOOLEAN NOT NULL DEFAULT false,
  csv_signal BOOLEAN NOT NULL DEFAULT false,
  pdf_catalog_signal BOOLEAN NOT NULL DEFAULT false,
  lead_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'contacted', 'onboarded', 'rejected')),
  notes TEXT,
  promoted_supplier_id UUID REFERENCES catalogos.suppliers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_supplier_leads_domain UNIQUE (domain)
);

CREATE INDEX idx_supplier_leads_status ON catalogos.supplier_leads (status);
CREATE INDEX idx_supplier_leads_lead_score ON catalogos.supplier_leads (lead_score DESC);
CREATE INDEX idx_supplier_leads_created_at ON catalogos.supplier_leads (created_at DESC);
CREATE INDEX idx_supplier_leads_domain ON catalogos.supplier_leads (domain) WHERE domain IS NOT NULL;

COMMENT ON TABLE catalogos.supplier_leads IS 'Potential suppliers discovered by agent; deduped by domain.';

-- -----------------------------------------------------------------------------
-- supplier_lead_contacts
-- Optional contacts per lead (email, phone, name).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.supplier_lead_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_lead_id UUID NOT NULL REFERENCES catalogos.supplier_leads(id) ON DELETE CASCADE,
  contact_name TEXT,
  contact_email TEXT,
  phone TEXT,
  role TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_lead_contacts_lead ON catalogos.supplier_lead_contacts (supplier_lead_id);

COMMENT ON TABLE catalogos.supplier_lead_contacts IS 'Contacts associated with a supplier lead.';

-- -----------------------------------------------------------------------------
-- supplier_discovery_runs
-- One row per discovery job (manual, scheduled, csv_import).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.supplier_discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  leads_created INT NOT NULL DEFAULT 0,
  leads_duplicate_skipped INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_discovery_runs_started ON catalogos.supplier_discovery_runs (started_at DESC);
CREATE INDEX idx_supplier_discovery_runs_status ON catalogos.supplier_discovery_runs (status);

COMMENT ON TABLE catalogos.supplier_discovery_runs IS 'Discovery job runs; one per adapter execution.';

-- -----------------------------------------------------------------------------
-- supplier_discovery_events
-- Log entries per run (lead created, duplicate, error).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.supplier_discovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES catalogos.supplier_discovery_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  supplier_lead_id UUID REFERENCES catalogos.supplier_leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_discovery_events_run ON catalogos.supplier_discovery_events (run_id);
CREATE INDEX idx_supplier_discovery_events_created ON catalogos.supplier_discovery_events (created_at DESC);

COMMENT ON TABLE catalogos.supplier_discovery_events IS 'Event log per discovery run (lead_created, duplicate_skipped, error).';
