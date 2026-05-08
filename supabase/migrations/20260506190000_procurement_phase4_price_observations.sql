-- Phase 4: trusted spend memory — price observations derived ONLY from governed truth.

CREATE TABLE IF NOT EXISTS gc_commerce.price_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_line_id UUID NOT NULL REFERENCES gc_commerce.invoice_lines (id) ON DELETE RESTRICT,
  uploaded_invoice_id UUID NOT NULL REFERENCES gc_commerce.uploaded_invoices (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES gc_commerce.companies (id) ON DELETE RESTRICT,
  procurement_opportunity_id UUID REFERENCES public.procurement_opportunities (id) ON DELETE SET NULL,
  catalog_product_id UUID NOT NULL,
  catalogos_supplier_id UUID NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14, 4) NOT NULL,
  line_total NUMERIC(14, 4),
  currency TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  observation_source TEXT NOT NULL,
  trust_status TEXT NOT NULL DEFAULT 'trusted',
  exclusion_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_gc_price_observations_trust_status CHECK (
    trust_status IN ('trusted', 'excluded', 'superseded')
  ),
  CONSTRAINT ck_gc_price_observations_source CHECK (
    observation_source IN ('operator_governance', 'repair', 'invoice_supplier_governance')
  ),
  CONSTRAINT ck_gc_price_observations_trusted_shape CHECK (
    trust_status <> 'trusted'
    OR (
      catalogos_supplier_id IS NOT NULL
      AND unit_price IS NOT NULL
      AND catalog_product_id IS NOT NULL
    )
  )
);

COMMENT ON TABLE gc_commerce.price_observations IS
  'Append-only trusted spend memory; only rows with trust_status trusted participate in spend intelligence.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_gc_price_observations_line_trusted
  ON gc_commerce.price_observations (invoice_line_id)
  WHERE trust_status = 'trusted';

CREATE INDEX IF NOT EXISTS idx_gc_price_obs_company_product_observed
  ON gc_commerce.price_observations (company_id, catalog_product_id, observed_at DESC)
  WHERE trust_status = 'trusted';

CREATE INDEX IF NOT EXISTS idx_gc_price_obs_supplier_product_observed
  ON gc_commerce.price_observations (company_id, catalogos_supplier_id, catalog_product_id, observed_at DESC)
  WHERE trust_status = 'trusted';

CREATE INDEX IF NOT EXISTS idx_gc_price_obs_uploaded
  ON gc_commerce.price_observations (uploaded_invoice_id);

CREATE INDEX IF NOT EXISTS idx_gc_price_obs_opportunity
  ON gc_commerce.price_observations (procurement_opportunity_id)
  WHERE procurement_opportunity_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.price_observations TO postgres, service_role;
