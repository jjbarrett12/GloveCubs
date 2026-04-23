-- Public bucket for CatalogOS import pipeline: copy supplier hero images off hotlinks.
-- Writes use service role (bypasses RLS); reads are public for stable PDP-style URLs.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-import-images',
  'catalog-import-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "catalog_import_images_public_read" ON storage.objects;

CREATE POLICY "catalog_import_images_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'catalog-import-images');
