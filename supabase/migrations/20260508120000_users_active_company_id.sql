-- Deterministic active organization for B2B portal users (public.users.id = auth.users.id).
-- Application validates membership in gc_commerce.company_members before persisting.

alter table public.users
  add column if not exists active_company_id uuid;

comment on column public.users.active_company_id is
  'Optional gc_commerce.companies id; must match company_members for this user. Resolved server-side for pricing/procurement parity.';
