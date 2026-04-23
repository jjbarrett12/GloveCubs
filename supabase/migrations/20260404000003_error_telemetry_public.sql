-- =============================================================================
-- Productionization: ensure error_telemetry exists in public for all apps.
-- Storefront and CatalogOS share the same DB; this allows telemetry to work
-- regardless of which app's migrations run first. Idempotent (IF NOT EXISTS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.error_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    message TEXT NOT NULL,
    error_code TEXT,
    stack_trace TEXT,
    context JSONB,
    entity_type TEXT,
    entity_id TEXT,
    user_id TEXT,
    supplier_id TEXT,
    buyer_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_telemetry_category ON public.error_telemetry(category);
CREATE INDEX IF NOT EXISTS idx_error_telemetry_severity ON public.error_telemetry(severity);
CREATE INDEX IF NOT EXISTS idx_error_telemetry_created ON public.error_telemetry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_telemetry_entity ON public.error_telemetry(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.error_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    error_code TEXT,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_alerts_acknowledged ON public.error_alerts(acknowledged, created_at DESC);

COMMENT ON TABLE public.error_telemetry IS 'Production error event tracking; shared by storefront and catalogos.';
