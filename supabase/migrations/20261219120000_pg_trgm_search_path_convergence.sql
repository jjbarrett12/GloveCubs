-- =============================================================================
-- Forward convergence: pg_trgm + storefront search path (pre-invitation)
-- =============================================================================
-- Historical migrations 20260422103000 / 20260701100000 were amended for clean-room
-- replay. Supabase records migration checksums — already-applied environments will
-- NOT re-run those files. This forward migration converges deployed DBs without
-- moving an existing pg_trgm extension.
--
-- Canonical schema for new installs: extensions (Supabase platform default).
-- Allowed existing schemas: extensions | public. Other schemas fail loudly.
-- Lexically after PO-receive grants, before company invitations.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $pg_trgm_guard$
DECLARE
  ext_schema text;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF ext_schema IS NULL THEN
    RAISE EXCEPTION 'pg_trgm extension missing after CREATE EXTENSION';
  END IF;

  IF ext_schema NOT IN ('extensions', 'public') THEN
    RAISE EXCEPTION
      'pg_trgm is installed in schema %, expected extensions or public (do not move automatically)',
      ext_schema;
  END IF;
END
$pg_trgm_guard$;

CREATE OR REPLACE FUNCTION public.gc_trgm_similarity(a text, b text)
RETURNS real
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions
AS $$
BEGIN
  RETURN similarity(a, b);
END;
$$;

COMMENT ON FUNCTION public.gc_trgm_similarity(text, text) IS
  'Schema-stable wrapper over pg_trgm similarity(); search_path includes public + extensions.';

DO $trgm_idx$
DECLARE
  ext_schema text;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF to_regclass('catalogos.idx_catalogos_products_name_trgm') IS NULL
     AND to_regclass('catalogos.products') IS NOT NULL THEN
    EXECUTE format(
      'CREATE INDEX idx_catalogos_products_name_trgm ON catalogos.products USING GIN (name %I.gin_trgm_ops)',
      ext_schema
    );
  END IF;
END
$trgm_idx$;

-- Smoke: wrapper must resolve (fails migration if extension placement is broken).
DO $smoke$
BEGIN
  PERFORM public.gc_trgm_similarity('nitrile', 'nitrile');
END
$smoke$;
