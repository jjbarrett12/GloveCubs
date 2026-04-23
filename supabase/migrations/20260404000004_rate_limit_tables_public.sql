-- =============================================================================
-- Productionization: shared rate limit tables for multi-instance rate limiting.
-- CatalogOS and Storefront use the same DB; these tables allow DB-backed
-- rate limiting so limits are shared across instances. Idempotent (IF NOT EXISTS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_identifier_created
    ON public.rate_limit_events(identifier, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rate_limit_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT UNIQUE NOT NULL,
    blocked_until TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_identifier ON public.rate_limit_blocks(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_blocked_until ON public.rate_limit_blocks(blocked_until);

COMMENT ON TABLE public.rate_limit_events IS 'Rate limit event log; shared by CatalogOS and Storefront for production-safe limits.';
COMMENT ON TABLE public.rate_limit_blocks IS 'Active rate limit blocks; shared across instances.';
