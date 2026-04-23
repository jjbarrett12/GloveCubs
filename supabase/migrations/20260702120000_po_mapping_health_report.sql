-- =============================================================================
-- Operator PO mapping health: active canonical variants vs supplier_offers +
-- suppliers.settings manufacturer linkage (aligns with lib/poLineBuilder.js).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.po_mapping_health_report(p_limit integer DEFAULT 50000)
RETURNS TABLE (
  catalog_product_id uuid,
  sku text,
  product_name text,
  issue_code text,
  issue_detail text
)
LANGUAGE sql
STABLE
SET search_path = public, catalogos
AS $$
  WITH cp AS (
    SELECT c.id, c.sku, c.name
    FROM public.canonical_products c
    WHERE c.is_active = true
    ORDER BY c.sku NULLS LAST, c.id
    LIMIT GREATEST(1, LEAST(COALESCE(NULLIF(p_limit, 0), 50000), 200000))
  ),
  agg AS (
    SELECT
      cp.id AS pid,
      cp.sku AS csku,
      cp.name AS cname,
      COUNT(so.id) AS offer_cnt,
      COUNT(so.id) FILTER (
        WHERE so.supplier_sku IS NULL OR TRIM(so.supplier_sku) = ''
      ) AS missing_sku_cnt,
      COALESCE(
        BOOL_OR(
          (sup.settings->>'manufacturer_id') ~ '^[1-9][0-9]*$'
          OR (sup.settings->>'mfg_id') ~ '^[1-9][0-9]*$'
          OR (sup.settings->>'public_manufacturer_id') ~ '^[1-9][0-9]*$'
        ),
        false
      ) AS has_mfg_link
    FROM cp
    LEFT JOIN catalogos.supplier_offers so
      ON so.product_id = cp.id AND so.is_active = true
    LEFT JOIN catalogos.suppliers sup ON sup.id = so.supplier_id
    GROUP BY cp.id, cp.sku, cp.name
  )
  SELECT
    a.pid,
    a.csku,
    a.cname,
    iss.issue_code,
    iss.issue_detail
  FROM agg a
  CROSS JOIN LATERAL (
    SELECT 'NO_ACTIVE_OFFERS'::text AS issue_code,
           'No active supplier_offers rows for this catalog variant.'::text AS issue_detail
    WHERE a.offer_cnt = 0
    UNION ALL
    SELECT 'MISSING_SUPPLIER_SKU'::text,
           format(
             '%s of %s active offer(s) have empty supplier_sku (manufacturer-facing part number required for POs).',
             a.missing_sku_cnt,
             a.offer_cnt
           )::text
    WHERE a.offer_cnt > 0 AND a.missing_sku_cnt > 0
    UNION ALL
    SELECT 'AMBIGUOUS_NO_MFG_LINK'::text,
           format(
             '%s active offers; no supplier has settings.manufacturer_id / mfg_id / public_manufacturer_id — PO line selection is non-deterministic.',
             a.offer_cnt
           )::text
    WHERE a.offer_cnt >= 2 AND NOT a.has_mfg_link
  ) iss;
$$;

COMMENT ON FUNCTION public.po_mapping_health_report(integer) IS
  'Lists active canonical_products variants with PO-blocking catalog/supplier issues (offers, SKUs, manufacturer linkage).';

GRANT EXECUTE ON FUNCTION public.po_mapping_health_report(integer) TO service_role;
