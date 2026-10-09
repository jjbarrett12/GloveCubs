-- One New Product Family draft can have only one review batch.
-- preview_session_id is the saved family draft id.
-- source_filename is the application constant 'new-family-wizard', not an uploaded file name.
-- Quick Add uses source_filename 'quick-add'. CSV and URL import use the real filename.
-- Those rows stay outside this partial index, so existing import flows can still
-- create more than one batch for the same preview session.

CREATE UNIQUE INDEX IF NOT EXISTS uq_import_batches_new_family_draft
  ON catalogos.import_batches (preview_session_id)
  WHERE source_filename = 'new-family-wizard'
    AND preview_session_id IS NOT NULL;

COMMENT ON INDEX catalogos.uq_import_batches_new_family_draft IS
  'One active New Product Family review batch per draft. Quick Add, CSV, and URL import are excluded.';
