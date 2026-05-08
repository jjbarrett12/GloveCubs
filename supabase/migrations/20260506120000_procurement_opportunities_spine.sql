-- Phase 2B: canonical procurement opportunity spine (public schema, service-role writes from storefront).
-- Links to existing sales_prospects and catalogos.quote_requests without replacing them.

CREATE TABLE IF NOT EXISTS public.procurement_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_environment_key TEXT,
  lifecycle_stage TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL,
  company_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  sales_prospect_id BIGINT REFERENCES public.sales_prospects (id) ON DELETE SET NULL,
  quote_request_id UUID REFERENCES catalogos.quote_requests (id) ON DELETE SET NULL,
  client_trace_id TEXT,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT procurement_opportunities_lifecycle_check CHECK (
    lifecycle_stage IN ('draft', 'open', 'scoped', 'evidencing', 'sourcing_ready', 'closed', 'stale')
  ),
  CONSTRAINT procurement_opportunities_source_check CHECK (
    source IN (
      'glove_finder',
      'request_pricing',
      'quote_cart',
      'contact',
      'invoice',
      'manual'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_opportunities_client_trace
  ON public.procurement_opportunities (client_trace_id)
  WHERE client_trace_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_opportunities_idempotency
  ON public.procurement_opportunities (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_procurement_opportunities_created
  ON public.procurement_opportunities (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_procurement_opportunities_env
  ON public.procurement_opportunities (operational_environment_key)
  WHERE operational_environment_key IS NOT NULL;

COMMENT ON TABLE public.procurement_opportunities IS
  'Canonical commercial thread; dual-written alongside legacy intake tables (Phase 2B).';

CREATE TABLE IF NOT EXISTS public.procurement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.procurement_opportunities (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procurement_events_opportunity
  ON public.procurement_events (opportunity_id, created_at DESC);

COMMENT ON TABLE public.procurement_events IS
  'Append-only procurement timeline; AI and notifications are advisory events only.';
