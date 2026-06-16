/**
 * Phase 1C-auth — admin identity audit queries.
 * Run in Supabase SQL editor or via: node scripts/audit-admin-identity.js
 */

-- app_admins operators missing an active admin_users row (blocking before redirect)
SELECT a.auth_user_id, a.email AS app_admins_email
FROM public.app_admins a
LEFT JOIN public.admin_users u ON u.id = a.auth_user_id AND u.is_active = true
WHERE a.auth_user_id IS NOT NULL
  AND u.id IS NULL
ORDER BY a.created_at NULLS LAST;

-- inactive admin_users still listed in app_admins (should deactivate or remove compat row)
SELECT u.id, u.email, u.is_active
FROM public.admin_users u
INNER JOIN public.app_admins a ON a.auth_user_id = u.id
WHERE u.is_active IS NOT TRUE
ORDER BY u.created_at NULLS LAST;

-- active admin_users without auth.users (orphan allowlist rows)
SELECT u.id, u.email
FROM public.admin_users u
LEFT JOIN auth.users au ON au.id = u.id
WHERE u.is_active = true
  AND au.id IS NULL
ORDER BY u.created_at NULLS LAST;

-- active admin_users missing app_admins compat mirror (warn — run grant script to sync)
SELECT u.id, u.email
FROM public.admin_users u
LEFT JOIN public.app_admins a ON a.auth_user_id = u.id
WHERE u.is_active = true
  AND a.auth_user_id IS NULL
ORDER BY u.created_at NULLS LAST;
