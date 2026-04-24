-- =============================================================================
-- CUTOVER: catalogos.products → dead table; catalog_v2.catalog_products is SoT.
-- TRUNCATE CASCADE wipes all rows in tables that FK this listing table (dev/no data).
-- Then rename; repoint commerce + catalogos hot paths to catalog_v2.
--
-- All object changes are conditional (to_regclass): branches/environments may
-- omit public.order_items, public.inventory, or other relations.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('catalogos.products') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE catalogos.products CASCADE';
    EXECUTE 'ALTER TABLE catalogos.products RENAME TO products_deleted_do_not_use';
  END IF;
END $$;

DO $cmt$
BEGIN
  IF to_regclass('catalogos.products_deleted_do_not_use') IS NOT NULL THEN
    EXECUTE $c$
COMMENT ON TABLE catalogos.products_deleted_do_not_use IS
  'DO NOT USE — replaced by catalog_v2.catalog_products. No app reads/writes.'
$c$;
    EXECUTE 'REVOKE ALL ON TABLE catalogos.products_deleted_do_not_use FROM PUBLIC';
    EXECUTE 'GRANT SELECT ON TABLE catalogos.products_deleted_do_not_use TO service_role';
  END IF;
END $cmt$;

-- Public commerce UUIDs → catalog_v2 (drop listing FK left by rename chain)
DO $$
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS fk_order_items_canonical_catalog_product';
    EXECUTE 'ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS fk_order_items_canonical_catalog_v2_product';
    EXECUTE $fk$
ALTER TABLE public.order_items
  ADD CONSTRAINT fk_order_items_canonical_catalog_v2_product
  FOREIGN KEY (canonical_product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED
$fk$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.inventory') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS fk_inventory_canonical_catalog_product';
    EXECUTE 'ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS fk_inventory_canonical_catalog_v2_product';
    EXECUTE $fk$
ALTER TABLE public.inventory
  ADD CONSTRAINT fk_inventory_canonical_catalog_v2_product
  FOREIGN KEY (canonical_product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED
$fk$;
  END IF;
END $$;

-- CatalogOS tables: product_id is catalog_v2.catalog_products.id
DO $$
BEGIN
  IF to_regclass('catalogos.supplier_offers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.supplier_offers DROP CONSTRAINT IF EXISTS supplier_offers_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.supplier_offers
  ADD CONSTRAINT supplier_offers_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE CASCADE
$fk$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('catalogos.publish_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.publish_events DROP CONSTRAINT IF EXISTS publish_events_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.publish_events
  ADD CONSTRAINT publish_events_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE CASCADE
$fk$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('catalogos.product_attributes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.product_attributes DROP CONSTRAINT IF EXISTS product_attributes_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.product_attributes
  ADD CONSTRAINT product_attributes_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE CASCADE
$fk$;
  END IF;
END $$;
