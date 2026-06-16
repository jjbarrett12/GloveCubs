-- Phase 1C-auth: public.admin_users is the canonical operator allowlist (id = auth.users.id).
-- Backfill from public.app_admins; keep app_admins for transitional Express/legacy compatibility.
--
-- Remote/staging DBs may already have public.admin_users from an older schema (e.g. without email).
-- CREATE TABLE IF NOT EXISTS skips creation when the table exists and does NOT reconcile columns.
-- Reconcile required columns below before any INSERT/ON CONFLICT that references them.

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reconcile columns on pre-existing admin_users (no drops, no table recreate).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_users'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'admin_users'
        AND column_name = 'id'
    ) THEN
      RAISE NOTICE 'public.admin_users exists without id column; skipping column reconcile (manual fix required)';
      RETURN;
    END IF;

    ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

    -- Backfill NULLs on newly added columns only.
    UPDATE public.admin_users
    SET is_active = true
    WHERE is_active IS NULL;

    UPDATE public.admin_users
    SET created_at = NOW()
    WHERE created_at IS NULL;
  END IF;
END $$;

COMMENT ON TABLE public.admin_users IS
  'Canonical operator allowlist. id MUST equal auth.users.id. Next /admin and Express isAdmin (Phase 1C-auth).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.admin_users'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%auth.users%'
  ) THEN
    ALTER TABLE public.admin_users
      ADD CONSTRAINT admin_users_id_auth_users_fkey
      FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN
    RAISE NOTICE 'admin_users FK to auth.users not applied (legacy rows may need reconciliation): %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON public.admin_users (is_active) WHERE is_active = true;

-- Backfill: every app_admins row gets an active admin_users row keyed by auth_user_id.
-- Uses app_admins.email when present; falls back to auth.users.email; otherwise NULL.
DO $$
DECLARE
  has_id_unique BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'app_admins'
  ) THEN
    RAISE NOTICE 'public.app_admins not found; skipping admin_users backfill';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_users'
      AND column_name = 'id'
  ) THEN
    RAISE NOTICE 'public.admin_users.id missing; skipping backfill';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.admin_users'::regclass
      AND c.contype IN ('p', 'u')
      AND a.attname = 'id'
      AND c.conkey IS NOT NULL
  ) INTO has_id_unique;

  IF has_id_unique THEN
    INSERT INTO public.admin_users (id, email, is_active, created_at)
    SELECT
      a.auth_user_id,
      COALESCE(NULLIF(trim(a.email), ''), NULLIF(trim(au.email), '')),
      true,
      COALESCE(a.created_at, NOW())
    FROM public.app_admins a
    LEFT JOIN auth.users au ON au.id = a.auth_user_id
    WHERE a.auth_user_id IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, public.admin_users.email),
      is_active = true;
  ELSE
    INSERT INTO public.admin_users (id, email, is_active, created_at)
    SELECT
      a.auth_user_id,
      COALESCE(NULLIF(trim(a.email), ''), NULLIF(trim(au.email), '')),
      true,
      COALESCE(a.created_at, NOW())
    FROM public.app_admins a
    LEFT JOIN auth.users au ON au.id = a.auth_user_id
    WHERE a.auth_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.admin_users existing
        WHERE existing.id = a.auth_user_id
      );

    UPDATE public.admin_users u
    SET
      email = COALESCE(
        NULLIF(trim(u.email), ''),
        COALESCE(NULLIF(trim(a.email), ''), NULLIF(trim(au.email), ''))
      ),
      is_active = true
    FROM public.app_admins a
    LEFT JOIN auth.users au ON au.id = a.auth_user_id
    WHERE a.auth_user_id IS NOT NULL
      AND u.id = a.auth_user_id
      AND (
        u.is_active IS DISTINCT FROM true
        OR NULLIF(trim(u.email), '') IS NULL
      );
  END IF;
END $$;

COMMENT ON TABLE public.app_admins IS
  'Transitional compatibility mirror for legacy Express admin JSON. Grants MUST use admin_users (see lib/admin-identity.js grantCanonicalAdminOperator).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users TO postgres, service_role;
