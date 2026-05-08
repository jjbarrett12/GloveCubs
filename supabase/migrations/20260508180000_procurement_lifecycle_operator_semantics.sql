-- Phase operator semantics: distinguish quote *linkage* (DB spine) from commercial *follow-up*.
-- Does not remove existing stages; extends CHECK on procurement_opportunities.lifecycle_stage.

ALTER TABLE public.procurement_opportunities
  DROP CONSTRAINT IF EXISTS procurement_opportunities_lifecycle_check;

ALTER TABLE public.procurement_opportunities
  ADD CONSTRAINT procurement_opportunities_lifecycle_check CHECK (
    lifecycle_stage IN (
      'draft',
      'open',
      'scoped',
      'evidencing',
      'sourcing_ready',
      'quote_linked',
      'sales_follow_up',
      'closed',
      'stale'
    )
  );

COMMENT ON COLUMN public.procurement_opportunities.lifecycle_stage IS
  'Procurement thread stage. quote_linked = catalogos.quote_requests row linked on spine (not email delivery). sales_follow_up = commercial follow-up needed (e.g. operator notification failed); not a per-company ACL.';
