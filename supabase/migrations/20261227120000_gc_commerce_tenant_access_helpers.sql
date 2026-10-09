-- =============================================================================
-- Phase 1 tenant security: canonical membership / admin helpers for RLS.
-- Purpose: single source of truth for company membership and operator admin.
-- Rollback: DROP FUNCTION the helpers listed below (after dependent policies removed).
-- =============================================================================

CREATE OR REPLACE FUNCTION gc_commerce.is_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = gc_commerce, public
AS $$
  SELECT
    p_company_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM gc_commerce.company_members cm
      WHERE cm.company_id = p_company_id
        AND cm.user_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION gc_commerce.is_company_member(UUID) IS
  'True when auth.uid() is a member of p_company_id. Uses auth.uid() only — callers cannot supply another user id.';

CREATE OR REPLACE FUNCTION gc_commerce.has_company_role(p_company_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = gc_commerce, public
AS $$
  SELECT
    p_company_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND p_roles IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM gc_commerce.company_members cm
      WHERE cm.company_id = p_company_id
        AND cm.user_id = auth.uid()
        AND cm.role = ANY (p_roles)
    );
$$;

COMMENT ON FUNCTION gc_commerce.has_company_role(UUID, TEXT[]) IS
  'True when auth.uid() holds one of p_roles on p_company_id.';

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_users au
      WHERE au.id = auth.uid()
        AND au.is_active IS TRUE
    );
$$;

COMMENT ON FUNCTION public.is_active_admin() IS
  'True when auth.uid() is an active public.admin_users operator. Prefer this over app_admins for new policies.';

REVOKE ALL ON FUNCTION gc_commerce.is_company_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION gc_commerce.has_company_role(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION gc_commerce.is_company_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION gc_commerce.has_company_role(UUID, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated, service_role;
