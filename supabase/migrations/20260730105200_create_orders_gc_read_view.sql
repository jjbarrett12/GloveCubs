-- =============================================================================
-- Read-only bridge over gc_commerce.orders after legacy public.orders removal.
-- =============================================================================

CREATE OR REPLACE VIEW public.orders_gc_read AS
SELECT * FROM gc_commerce.orders;

COMMENT ON VIEW public.orders_gc_read IS 'Read-only bridge over gc_commerce.orders; legacy public.orders removed.';

GRANT SELECT ON public.orders_gc_read TO postgres, service_role;
