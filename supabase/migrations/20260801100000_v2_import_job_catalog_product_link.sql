-- V2: track approved bulk-import products against catalogos.products (UUID), without legacy public.products bigint.

ALTER TABLE public.import_job_items
  ADD COLUMN IF NOT EXISTS created_catalog_product_id uuid REFERENCES catalogos.products (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.import_job_items.created_catalog_product_id IS 'Catalog product UUID when a draft is approved into catalogos.products; replaces legacy created_product_id for new approvals.';
