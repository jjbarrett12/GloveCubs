-- catalog_v2 server writes (storefront admin, CatalogOS) use SUPABASE_SERVICE_ROLE_KEY via PostgREST.
-- Tables created after initial schema setup need explicit grants; without them PostgREST returns
-- "permission denied for table …" even for service_role.

GRANT USAGE ON SCHEMA catalog_v2 TO postgres, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA catalog_v2 TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA catalog_v2 TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA catalog_v2
  GRANT ALL ON TABLES TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA catalog_v2
  GRANT ALL ON SEQUENCES TO postgres, service_role;
