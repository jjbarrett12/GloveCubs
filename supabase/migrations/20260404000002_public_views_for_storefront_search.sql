-- =============================================================================
-- Productionization: public views over catalogos for storefront search.
-- Storefront uses supabaseAdmin (default schema = public). Without these views,
-- .from('supplier_offers') and .from('offer_trust_scores') would look in public
-- and find nothing (tables live in catalogos). This creates a single stable
-- query surface so search, offers, and trust scores work in production.
-- =============================================================================

-- 1) public.supplier_offers: mirror catalogos.supplier_offers with columns
--    storefront search and search_products_fts expect (price, sku, product_name).
CREATE OR REPLACE VIEW public.supplier_offers AS
SELECT
  so.id,
  so.supplier_id,
  so.product_id,
  so.supplier_sku AS sku,
  so.cost,
  so.sell_price,
  COALESCE(so.sell_price, so.cost) AS price,
  so.lead_time_days,
  so.raw_id,
  so.normalized_id,
  so.is_active,
  so.created_at,
  so.updated_at,
  p.name AS product_name
FROM catalogos.supplier_offers so
LEFT JOIN catalogos.products p ON p.id = so.product_id;

COMMENT ON VIEW public.supplier_offers IS 'Public view over catalogos.supplier_offers for storefront search; exposes price (coalesce sell_price,cost), sku, product_name.';

-- 2) public.offer_trust_scores: direct mirror of catalogos.offer_trust_scores.
CREATE OR REPLACE VIEW public.offer_trust_scores AS
SELECT
  id,
  offer_id,
  supplier_id,
  product_id,
  trust_score,
  trust_band,
  supplier_reliability_score,
  match_confidence,
  pricing_confidence,
  freshness_score,
  normalization_confidence,
  anomaly_penalty,
  override_penalty,
  factors,
  calculated_at,
  created_at
FROM catalogos.offer_trust_scores;

COMMENT ON VIEW public.offer_trust_scores IS 'Public view over catalogos.offer_trust_scores for storefront search and procurement.';

-- 3) public.suppliers: direct mirror of catalogos.suppliers (search_products_fts joins to it).
CREATE OR REPLACE VIEW public.suppliers AS
SELECT
  id,
  name,
  slug,
  settings,
  is_active,
  created_at,
  updated_at
FROM catalogos.suppliers;

COMMENT ON VIEW public.suppliers IS 'Public view over catalogos.suppliers for storefront search RPC joins.';
