-- =============================================================================
-- Deprecate (do not drop) public.canonical_products + sync function
-- =============================================================================
-- Purpose:
--   The post-cutover state of canonical_products:
--     - catalogos.sync_canonical_products() reads from catalogos.products,
--       which was renamed to catalogos.products_deleted_do_not_use in
--       20260901000000_kill_catalogos_products_cutover.sql. The function is
--       structurally dead.
--     - storefront catalog read code does NOT touch public.canonical_products
--       (verified: see storefront/src/lib/catalog/store-products.ts and
--       store-product-detail.ts). The only repo references are the deprecated
--       /admin/api/product-import stub and an old import_candidates migration.
--
--   We DROP the dead sync function (zero risk; it cannot run successfully) and
--   mark public.canonical_products deprecated, but we DO NOT drop the table —
--   an unknown out-of-repo consumer (analytics, sitemap generator, third-party
--   crawler) might still read it. Drop is deferred to a follow-up after one
--   release confirms no downstream complaint.
--
-- Rollback:
--   Re-create the function from 20260404000011_canonical_products_product_line_registry.sql
--   if needed; the table itself is untouched.
-- =============================================================================

DROP FUNCTION IF EXISTS catalogos.sync_canonical_products();

DO $$
BEGIN
  IF to_regclass('public.canonical_products') IS NOT NULL THEN
    EXECUTE $cmt$
COMMENT ON TABLE public.canonical_products IS
  'DEPRECATED — search projection from killed catalogos.products. Storefront does not read this table. Source sync function (catalogos.sync_canonical_products) was dropped in 20261111120400. Plan: remove after one release with zero out-of-repo consumer complaints.'
$cmt$;
  END IF;
END $$;
