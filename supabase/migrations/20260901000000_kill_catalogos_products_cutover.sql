-- =============================================================================
-- CUTOVER: catalogos.products → dead table; catalog_v2.catalog_products is SoT.
-- TRUNCATE CASCADE wipes all rows in tables that FK this listing table (dev/no data).
-- Then rename; repoint commerce + catalogos hot paths to catalog_v2.
-- =============================================================================

TRUNCATE TABLE catalogos.products CASCADE;

ALTER TABLE catalogos.products RENAME TO products_deleted_do_not_use;

COMMENT ON TABLE catalogos.products_deleted_do_not_use IS
  'DO NOT USE — replaced by catalog_v2.catalog_products. No app reads/writes.';

REVOKE ALL ON TABLE catalogos.products_deleted_do_not_use FROM PUBLIC;
GRANT SELECT ON TABLE catalogos.products_deleted_do_not_use TO service_role;

-- Public commerce UUIDs → catalog_v2 (drop listing FK left by rename chain)
ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS fk_order_items_canonical_catalog_product;

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS fk_inventory_canonical_catalog_product;

ALTER TABLE public.order_items
  ADD CONSTRAINT fk_order_items_canonical_catalog_v2_product
  FOREIGN KEY (canonical_product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.inventory
  ADD CONSTRAINT fk_inventory_canonical_catalog_v2_product
  FOREIGN KEY (canonical_product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

-- CatalogOS tables: product_id is catalog_v2.catalog_products.id
ALTER TABLE catalogos.supplier_offers
  DROP CONSTRAINT IF EXISTS supplier_offers_product_id_fkey;

ALTER TABLE catalogos.supplier_offers
  ADD CONSTRAINT supplier_offers_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE CASCADE;

ALTER TABLE catalogos.publish_events
  DROP CONSTRAINT IF EXISTS publish_events_product_id_fkey;

ALTER TABLE catalogos.publish_events
  ADD CONSTRAINT publish_events_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE CASCADE;

ALTER TABLE catalogos.product_attributes
  DROP CONSTRAINT IF EXISTS product_attributes_product_id_fkey;

ALTER TABLE catalogos.product_attributes
  ADD CONSTRAINT product_attributes_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES catalog_v2.catalog_products (id)
  ON DELETE CASCADE;
