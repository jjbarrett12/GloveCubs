-- =============================================================================
-- Identity bridge: gc_commerce.legacy_user_map (forward-only, non-destructive).
-- Recreates / extends the mapping table for environments where it is missing
-- or predates audit columns. Safe if 20260331211000 already applied: adds columns.
-- =============================================================================

-- Touch helper (idempotent; matches prior mapping migrations)
CREATE OR REPLACE FUNCTION gc_commerce.touch_legacy_mapping_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Base table: full shape when created fresh
CREATE TABLE IF NOT EXISTS gc_commerce.legacy_user_map (
  legacy_user_id BIGINT NOT NULL,
  auth_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapping_source TEXT,
  mapped_by UUID,
  mapped_at TIMESTAMPTZ DEFAULT NOW(),
  review_status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT
);

-- Upgrade path: older rows from 20260331211000 (no audit columns)
ALTER TABLE gc_commerce.legacy_user_map
  ADD COLUMN IF NOT EXISTS mapping_source TEXT;

ALTER TABLE gc_commerce.legacy_user_map
  ADD COLUMN IF NOT EXISTS mapped_by UUID;

ALTER TABLE gc_commerce.legacy_user_map
  ADD COLUMN IF NOT EXISTS mapped_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE gc_commerce.legacy_user_map
  ADD COLUMN IF NOT EXISTS review_status TEXT;

UPDATE gc_commerce.legacy_user_map
SET review_status = 'pending'
WHERE review_status IS NULL;

ALTER TABLE gc_commerce.legacy_user_map
  ALTER COLUMN review_status SET DEFAULT 'pending';

ALTER TABLE gc_commerce.legacy_user_map
  ALTER COLUMN review_status SET NOT NULL;

ALTER TABLE gc_commerce.legacy_user_map
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Primary key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pk_gc_legacy_user_map'
      AND conrelid = 'gc_commerce.legacy_user_map'::regclass
  ) THEN
    ALTER TABLE gc_commerce.legacy_user_map
      ADD CONSTRAINT pk_gc_legacy_user_map PRIMARY KEY (legacy_user_id);
  END IF;
END $$;

-- Auth user uniqueness (1:1 bridge)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_gc_legacy_user_map_auth_user'
      AND conrelid = 'gc_commerce.legacy_user_map'::regclass
  ) THEN
    ALTER TABLE gc_commerce.legacy_user_map
      ADD CONSTRAINT uq_gc_legacy_user_map_auth_user UNIQUE (auth_user_id);
  END IF;
END $$;

-- FK: mapped row must reference a real auth user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_gc_legacy_user_map_auth'
      AND conrelid = 'gc_commerce.legacy_user_map'::regclass
  ) THEN
    ALTER TABLE gc_commerce.legacy_user_map
      ADD CONSTRAINT fk_gc_legacy_user_map_auth
      FOREIGN KEY (auth_user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

-- FK: operator who recorded the mapping (optional)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_legacy_user_map_mapped_by_auth'
      AND conrelid = 'gc_commerce.legacy_user_map'::regclass
  ) THEN
    ALTER TABLE gc_commerce.legacy_user_map
      ADD CONSTRAINT fk_legacy_user_map_mapped_by_auth
      FOREIGN KEY (mapped_by) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE gc_commerce.legacy_user_map IS
  'Maps legacy public.users.id (BIGINT) to auth.users.id (UUID). 1:1 via PK and UNIQUE(auth_user_id). Admin/service writes only.';

COMMENT ON COLUMN gc_commerce.legacy_user_map.mapping_source IS
  'e.g. manual_admin, email_exact, import — set by writer; nullable for legacy rows.';

COMMENT ON COLUMN gc_commerce.legacy_user_map.mapped_by IS
  'auth.users.id of operator who created/approved the mapping.';

COMMENT ON COLUMN gc_commerce.legacy_user_map.review_status IS
  'pending | approved | rejected (application-enforced strings; default pending).';

-- Indexes (lookup / queues)
CREATE INDEX IF NOT EXISTS idx_gc_legacy_user_map_auth_user
  ON gc_commerce.legacy_user_map (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_gc_legacy_user_map_review_status
  ON gc_commerce.legacy_user_map (review_status);

CREATE INDEX IF NOT EXISTS idx_gc_legacy_user_map_mapped_at
  ON gc_commerce.legacy_user_map (mapped_at DESC NULLS LAST);

DROP TRIGGER IF EXISTS tr_gc_legacy_user_map_updated_at ON gc_commerce.legacy_user_map;
CREATE TRIGGER tr_gc_legacy_user_map_updated_at
  BEFORE UPDATE ON gc_commerce.legacy_user_map
  FOR EACH ROW
  EXECUTE PROCEDURE gc_commerce.touch_legacy_mapping_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: block anon/authenticated direct access unless app admin (JWT).
-- service_role and postgres bypass RLS (Supabase admin API / SQL editor).
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.legacy_user_map ENABLE ROW LEVEL SECURITY;

-- Requires public.app_admins (auth_user_id PK) from gc single-truth cutover migrations.
DROP POLICY IF EXISTS legacy_user_map_admin_all ON gc_commerce.legacy_user_map;

CREATE POLICY legacy_user_map_admin_all
  ON gc_commerce.legacy_user_map
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_admins a
      WHERE a.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_admins a
      WHERE a.auth_user_id = auth.uid()
    )
  );

-- Allow authenticated to attempt DML/SELECT only where RLS passes (policy above).
GRANT USAGE ON SCHEMA gc_commerce TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.legacy_user_map TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.legacy_user_map TO postgres, service_role;
