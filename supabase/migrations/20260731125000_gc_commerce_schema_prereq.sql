-- =============================================================================
-- Forward-only prerequisite: gc_commerce schema (non-destructive).
-- Enables later migrations that create objects in gc_commerce (e.g. identity
-- bridge). Does not create tables beyond the schema shell.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gc_commerce;

COMMENT ON SCHEMA gc_commerce IS
  'GloveCubs B2B commerce schema; prerequisite for legacy_user_map and related objects.';

GRANT USAGE ON SCHEMA gc_commerce TO postgres, service_role;
