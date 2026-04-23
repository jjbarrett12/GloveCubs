-- Add 'approved' to publish ↔ search sync enum (review accepted, not yet live-published / synced).
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_enum e
    INNER JOIN pg_catalog.pg_type t ON e.enumtypid = t.oid
    INNER JOIN pg_catalog.pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'catalogos'
      AND t.typname = 'publish_search_sync_status'
      AND e.enumlabel = 'approved'
  ) THEN
    ALTER TYPE catalogos.publish_search_sync_status ADD VALUE 'approved';
  END IF;
END;
$migration$;

COMMENT ON TYPE catalogos.publish_search_sync_status IS
  'Storefront search sync lifecycle: staged (ingested, not accepted); approved (accepted for publish, live write not done); published_pending_sync (live write done, sync in flight); published_synced; sync_failed.';
