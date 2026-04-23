-- =============================================================================
-- AI CSV import: reusable profiles and preview sessions.
-- Schema: catalogos. Used for AI-inferred column mapping and deterministic transform.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- import_profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.import_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES catalogos.suppliers(id) ON DELETE SET NULL,
  profile_name TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  average_confidence NUMERIC(5,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_profiles_supplier ON catalogos.import_profiles (supplier_id);
CREATE INDEX IF NOT EXISTS idx_import_profiles_fingerprint ON catalogos.import_profiles (source_fingerprint);

COMMENT ON TABLE catalogos.import_profiles IS 'Reusable CSV import profiles; matched by source_fingerprint for same supplier/format.';

-- -----------------------------------------------------------------------------
-- import_profile_fields
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.import_profile_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_profile_id UUID NOT NULL REFERENCES catalogos.import_profiles(id) ON DELETE CASCADE,
  source_column_name TEXT NOT NULL,
  mapped_field_name TEXT NOT NULL,
  transform_type TEXT DEFAULT 'copy',
  confidence NUMERIC(5,4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (import_profile_id, source_column_name)
);

CREATE INDEX IF NOT EXISTS idx_import_profile_fields_profile ON catalogos.import_profile_fields (import_profile_id);

COMMENT ON TABLE catalogos.import_profile_fields IS 'Per-profile column mapping: source_column -> canonical mapped_field_name.';

-- -----------------------------------------------------------------------------
-- import_preview_sessions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.import_preview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES catalogos.suppliers(id) ON DELETE SET NULL,
  filename TEXT,
  headers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  inferred_mapping_json JSONB,
  validation_summary_json JSONB,
  confidence_summary_json JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'imported', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_preview_sessions_supplier ON catalogos.import_preview_sessions (supplier_id);
CREATE INDEX IF NOT EXISTS idx_import_preview_sessions_status ON catalogos.import_preview_sessions (status);
CREATE INDEX IF NOT EXISTS idx_import_preview_sessions_created ON catalogos.import_preview_sessions (created_at DESC);

COMMENT ON TABLE catalogos.import_preview_sessions IS 'Per-upload preview: headers, sample rows, AI-inferred mapping, validation/confidence summaries.';
