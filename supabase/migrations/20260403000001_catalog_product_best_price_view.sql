-- P0-1: Bounded catalog price: view for best offer price per product (no full-scan in app).
-- Enables efficient price filter/sort in catalog listing.

CREATE OR REPLACE VIEW catalogos.product_best_offer_price AS
SELECT
  product_id,
  MIN(COALESCE(sell_price, cost)) AS best_price,
  COUNT(*)::INT AS offer_count
FROM catalogos.supplier_offers
WHERE is_active = true
GROUP BY product_id;

COMMENT ON VIEW catalogos.product_best_offer_price IS 'Per-product min price and offer count for catalog listing; avoids full supplier_offers scan.';

-- Index to support joins/filters on product_id (view uses underlying supplier_offers indexes).
-- Ensure product_id lookups on supplier_offers are fast (already exists: idx_supplier_offers_product).
