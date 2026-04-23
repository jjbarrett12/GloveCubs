-- =============================================================================
-- Legacy → canonical mapping tables (migration safety).
-- Schema: gc_commerce (parallel to legacy public.*).
--
--   gc_commerce.legacy_user_map      public.users.id (BIGINT) → auth.users.id (UUID)
--   gc_commerce.legacy_company_map   public.companies.id (BIGINT) → gc_commerce.companies.id (UUID)
--   gc_commerce.legacy_product_map   public.products.id (BIGINT) → catalog product UUID
--
-- Uniqueness: one legacy id per row (PK); one canonical UUID per row (UNIQUE).
-- Audit: created_at, updated_at (updated via trigger on UPDATE).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Touch helper for mapping tables
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gc_commerce.touch_legacy_mapping_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- legacy_user_map
-- -----------------------------------------------------------------------------
CREATE TABLE gc_commerce.legacy_user_map (
  legacy_user_id BIGINT NOT NULL,
  auth_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_gc_legacy_user_map PRIMARY KEY (legacy_user_id),
  CONSTRAINT fk_gc_legacy_user_map_auth FOREIGN KEY (auth_user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT uq_gc_legacy_user_map_auth_user UNIQUE (auth_user_id)
);

COMMENT ON TABLE gc_commerce.legacy_user_map IS
  'Maps legacy public.users.id to Supabase auth.users.id (1:1 each direction).';

CREATE INDEX idx_gc_legacy_user_map_auth_user ON gc_commerce.legacy_user_map (auth_user_id);

CREATE TRIGGER tr_gc_legacy_user_map_updated_at
  BEFORE UPDATE ON gc_commerce.legacy_user_map
  FOR EACH ROW
  EXECUTE PROCEDURE gc_commerce.touch_legacy_mapping_updated_at();

-- -----------------------------------------------------------------------------
-- legacy_company_map (create full shape; align with backfill IF NOT EXISTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.legacy_company_map (
  legacy_company_id BIGINT NOT NULL,
  gc_company_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_gc_legacy_company_map PRIMARY KEY (legacy_company_id),
  CONSTRAINT fk_gc_legacy_company_map_gc FOREIGN KEY (gc_company_id) REFERENCES gc_commerce.companies (id) ON DELETE CASCADE,
  CONSTRAINT uq_gc_legacy_company_map_gc_company UNIQUE (gc_company_id)
);

COMMENT ON TABLE gc_commerce.legacy_company_map IS
  'Maps legacy public.companies.id to gc_commerce.companies.id (1:1 each direction).';

-- Upgrade path: table may have been created earlier with only created_at
ALTER TABLE gc_commerce.legacy_company_map
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE gc_commerce.legacy_company_map
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill migration used uq_gc_legacy_company_map_gc; align name without dropping uniqueness.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'gc_commerce'
      AND t.relname = 'legacy_company_map'
      AND c.conname = 'uq_gc_legacy_company_map_gc'
      AND c.contype = 'u'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'gc_commerce'
      AND t.relname = 'legacy_company_map'
      AND c.conname = 'uq_gc_legacy_company_map_gc_company'
  ) THEN
    ALTER TABLE gc_commerce.legacy_company_map
      RENAME CONSTRAINT uq_gc_legacy_company_map_gc TO uq_gc_legacy_company_map_gc_company;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gc_legacy_company_map_gc ON gc_commerce.legacy_company_map (gc_company_id);

DROP TRIGGER IF EXISTS tr_gc_legacy_company_map_updated_at ON gc_commerce.legacy_company_map;
CREATE TRIGGER tr_gc_legacy_company_map_updated_at
  BEFORE UPDATE ON gc_commerce.legacy_company_map
  FOR EACH ROW
  EXECUTE PROCEDURE gc_commerce.touch_legacy_mapping_updated_at();

-- -----------------------------------------------------------------------------
-- legacy_product_map
-- -----------------------------------------------------------------------------
CREATE TABLE gc_commerce.legacy_product_map (
  legacy_product_id BIGINT NOT NULL,
  catalog_product_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_gc_legacy_product_map PRIMARY KEY (legacy_product_id),
  CONSTRAINT uq_gc_legacy_product_map_catalog UNIQUE (catalog_product_id)
);

COMMENT ON TABLE gc_commerce.legacy_product_map IS
  'Maps legacy public.products.id to catalog master UUID (e.g. catalogos.products.id / canonical_products.id). No FK here to avoid ordering deps; add in a follow-up migration if desired.';

CREATE INDEX idx_gc_legacy_product_map_catalog ON gc_commerce.legacy_product_map (catalog_product_id);

CREATE TRIGGER tr_gc_legacy_product_map_updated_at
  BEFORE UPDATE ON gc_commerce.legacy_product_map
  FOR EACH ROW
  EXECUTE PROCEDURE gc_commerce.touch_legacy_mapping_updated_at();

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.legacy_user_map TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.legacy_company_map TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.legacy_product_map TO postgres, service_role;
