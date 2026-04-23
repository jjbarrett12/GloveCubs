-- =============================================================================
-- Supplier intake portal: tokenized access, requested_info_notes, submitted_via.
-- Schema: catalogos.
-- =============================================================================

ALTER TABLE catalogos.supplier_onboarding_requests
  ADD COLUMN IF NOT EXISTS access_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_info_notes TEXT,
  ADD COLUMN IF NOT EXISTS submitted_via TEXT NOT NULL DEFAULT 'admin'
    CHECK (submitted_via IN ('admin', 'supplier_portal'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_onboarding_requests_access_token
  ON catalogos.supplier_onboarding_requests (access_token) WHERE access_token IS NOT NULL;

COMMENT ON COLUMN catalogos.supplier_onboarding_requests.access_token IS 'Token for supplier-facing status page and updates; long random string.';
COMMENT ON COLUMN catalogos.supplier_onboarding_requests.access_token_expires_at IS 'Optional expiry for access token.';
COMMENT ON COLUMN catalogos.supplier_onboarding_requests.requested_info_notes IS 'Notes from internal team when status=waiting_for_supplier; shown to supplier.';
COMMENT ON COLUMN catalogos.supplier_onboarding_requests.submitted_via IS 'admin | supplier_portal.';
