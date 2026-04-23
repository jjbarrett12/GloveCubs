-- =============================================================================
-- Forward-only: public.app_admins.auth_user_id (nullable UUID → auth.users).
-- Additive only: no updates to existing rows; legacy id / user_id columns kept.
-- ON DELETE SET NULL preserves app_admins rows if an auth user is removed.
-- =============================================================================

ALTER TABLE public.app_admins
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.app_admins.auth_user_id IS
  'Supabase Auth user id for JWT-based admin checks; NULL until backfilled. Legacy user_id retained.';

CREATE INDEX IF NOT EXISTS idx_app_admins_auth_user_id
  ON public.app_admins (auth_user_id)
  WHERE auth_user_id IS NOT NULL;
