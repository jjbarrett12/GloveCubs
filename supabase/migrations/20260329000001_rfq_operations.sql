-- =============================================================================
-- RFQ Operations: assignment, priority, SLA, source, internal_notes.
-- Schema: catalogos.
-- =============================================================================

ALTER TABLE catalogos.quote_requests
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS due_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'storefront',
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Backfill submitted_at from created_at
UPDATE catalogos.quote_requests SET submitted_at = created_at WHERE submitted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quote_requests_assigned ON catalogos.quote_requests (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quote_requests_priority ON catalogos.quote_requests (priority);
CREATE INDEX IF NOT EXISTS idx_quote_requests_due_by ON catalogos.quote_requests (due_by) WHERE due_by IS NOT NULL;

COMMENT ON COLUMN catalogos.quote_requests.assigned_to IS 'User id or email of assignee.';
COMMENT ON COLUMN catalogos.quote_requests.priority IS 'low | normal | high | urgent.';
COMMENT ON COLUMN catalogos.quote_requests.due_by IS 'Optional SLA due date.';
COMMENT ON COLUMN catalogos.quote_requests.source IS 'Origin e.g. storefront.';
COMMENT ON COLUMN catalogos.quote_requests.internal_notes IS 'Internal team notes.';
COMMENT ON COLUMN catalogos.quote_requests.submitted_at IS 'When buyer submitted (default created_at).';
COMMENT ON COLUMN catalogos.quote_requests.first_viewed_at IS 'First time an admin opened the RFQ.';
COMMENT ON COLUMN catalogos.quote_requests.first_contacted_at IS 'When buyer was first contacted.';
COMMENT ON COLUMN catalogos.quote_requests.quoted_at IS 'When quote was sent.';
COMMENT ON COLUMN catalogos.quote_requests.closed_at IS 'When RFQ was closed.';
