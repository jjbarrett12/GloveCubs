-- =============================================================================
-- Publish ↔ public.canonical_products search sync: status on staging rows + retry queue.
-- =============================================================================

CREATE TYPE catalogos.publish_search_sync_status AS ENUM (
  'staged',
  'published_pending_sync',
  'published_synced',
  'sync_failed'
);

COMMENT ON TYPE catalogos.publish_search_sync_status IS
  'Storefront search sync lifecycle: staged (not live-synced); published_pending_sync (live write done, canonical sync in flight); published_synced; sync_failed.';

ALTER TABLE catalogos.supplier_products_normalized
  ADD COLUMN IF NOT EXISTS search_publish_status catalogos.publish_search_sync_status NOT NULL DEFAULT 'staged';

COMMENT ON COLUMN catalogos.supplier_products_normalized.search_publish_status IS
  'Whether public.canonical_products reflects this publish; see publish_search_sync_status enum.';

CREATE INDEX IF NOT EXISTS idx_supplier_products_norm_search_publish_status
  ON catalogos.supplier_products_normalized (search_publish_status);

CREATE TABLE IF NOT EXISTS catalogos.canonical_sync_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_id UUID NOT NULL REFERENCES catalogos.supplier_products_normalized (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES catalogos.products (id) ON DELETE CASCADE,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_canonical_sync_retry_normalized UNIQUE (normalized_id)
);

COMMENT ON TABLE catalogos.canonical_sync_retry_queue IS
  'Background retries for sync_canonical_products after publish; processed by /api/internal/retry-canonical-sync.';

CREATE INDEX IF NOT EXISTS idx_canonical_sync_retry_next_run
  ON catalogos.canonical_sync_retry_queue (next_run_at);

ALTER TABLE catalogos.canonical_sync_retry_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalogos_admin_all_canonical_sync_retry_queue" ON catalogos.canonical_sync_retry_queue;

CREATE POLICY "catalogos_admin_all_canonical_sync_retry_queue"
  ON catalogos.canonical_sync_retry_queue FOR ALL
  USING (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');
