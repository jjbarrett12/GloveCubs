-- =============================================================================
-- One storefront listing per product family: canonical_products.family_id +
-- is_listing_primary, sync from catalogos.products, search resolves variants
-- to listing rows, aggregated offers per family.
-- =============================================================================

ALTER TABLE public.canonical_products
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES catalogos.product_families(id) ON DELETE SET NULL;

ALTER TABLE public.canonical_products
  ADD COLUMN IF NOT EXISTS is_listing_primary BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.canonical_products.family_id IS 'Mirrors catalogos.products.family_id; variants share one family.';
COMMENT ON COLUMN public.canonical_products.is_listing_primary IS 'True for exactly one variant per family (storefront listing row); standalone products are always true.';

CREATE INDEX IF NOT EXISTS idx_canonical_products_family_id
  ON public.canonical_products (family_id)
  WHERE family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_products_listing_primary
  ON public.canonical_products (is_listing_primary, is_active)
  WHERE is_active = true AND is_listing_primary = true;

-- Map any variant (or listing) id to the storefront listing product id for its family.
CREATE OR REPLACE FUNCTION public.resolve_canonical_listing_product_id(p_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT cp2.id
      FROM public.canonical_products cp1
      JOIN public.canonical_products cp2
        ON cp1.family_id IS NOT NULL
       AND cp2.family_id = cp1.family_id
       AND cp2.is_listing_primary = true
       AND cp2.is_active = true
      WHERE cp1.id = p_id
      LIMIT 1
    ),
    (
      SELECT cp.id
      FROM public.canonical_products cp
      WHERE cp.id = p_id
        AND cp.is_listing_primary = true
        AND cp.is_active = true
      LIMIT 1
    ),
    p_id
  );
$$;

COMMENT ON FUNCTION public.resolve_canonical_listing_product_id(uuid) IS
  'Returns the is_listing_primary row for the family of p_id, or p_id if standalone / fallback.';

CREATE OR REPLACE FUNCTION catalogos.sync_canonical_products()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos, public
AS $$
DECLARE
  affected INT := 0;
BEGIN
  INSERT INTO public.canonical_products (
    id, name, title, sku, category_id, category, brand_id, description, attributes,
    material, glove_type, size, color, pack_size, product_line_code, family_id, is_listing_primary,
    is_active, created_at, updated_at
  )
  SELECT
    p.id,
    p.name,
    p.name,
    p.sku,
    p.category_id,
    c.slug,
    p.brand_id,
    p.description,
    COALESCE(p.attributes, '{}'::jsonb),
    (p.attributes->>'material')::TEXT,
    (p.attributes->>'glove_type')::TEXT,
    (p.attributes->>'size')::TEXT,
    (p.attributes->>'color')::TEXT,
    (p.attributes->>'pack_size')::INTEGER,
    COALESCE(m.product_line_code, 'ppe_gloves'),
    p.family_id,
    (
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(p.family_id, p.id)
        ORDER BY p.sku ASC NULLS LAST, p.created_at ASC
      ) = 1
    ),
    COALESCE(p.is_active, true),
    p.created_at,
    p.updated_at
  FROM catalogos.products p
  LEFT JOIN catalogos.categories c ON c.id = p.category_id
  LEFT JOIN catalogos.category_product_line m ON m.category_slug = c.slug
  WHERE p.is_active = true
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    title = EXCLUDED.name,
    sku = EXCLUDED.sku,
    category_id = EXCLUDED.category_id,
    category = EXCLUDED.category,
    brand_id = EXCLUDED.brand_id,
    description = EXCLUDED.description,
    attributes = EXCLUDED.attributes,
    material = EXCLUDED.material,
    glove_type = EXCLUDED.glove_type,
    size = EXCLUDED.size,
    color = EXCLUDED.color,
    pack_size = EXCLUDED.pack_size,
    product_line_code = EXCLUDED.product_line_code,
    family_id = EXCLUDED.family_id,
    is_listing_primary = EXCLUDED.is_listing_primary,
    is_active = EXCLUDED.is_active,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON FUNCTION catalogos.sync_canonical_products IS
  'Upsert public.canonical_products from catalogos.products; sets family_id, one is_listing_primary per family (lowest sku, then created_at), standalone always primary.';

SELECT catalogos.sync_canonical_products();

-- ---------------------------------------------------------------------------
-- Full-text search: match variants + supplier SKUs, return one row per listing;
-- aggregate offers across all variants in each family.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION search_products_fts(
    p_search_query TEXT,
    p_search_pattern TEXT,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_material TEXT DEFAULT NULL,
    p_size TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    title TEXT,
    sku TEXT,
    material TEXT,
    glove_type TEXT,
    size TEXT,
    color TEXT,
    pack_size INTEGER,
    category TEXT,
    offer_count BIGINT,
    best_price NUMERIC,
    best_supplier TEXT,
    relevance REAL
) AS $$
BEGIN
    RETURN QUERY
    WITH supplier_product_matches AS (
        SELECT DISTINCT so.product_id
        FROM supplier_offers so
        WHERE so.is_active = true
          AND (
              so.sku ILIKE p_search_pattern
              OR COALESCE(so.product_name, '') ILIKE p_search_pattern
          )
    ),
    product_matches_raw AS (
        SELECT
            cp.id,
            cp.name,
            cp.title,
            cp.sku,
            cp.material,
            cp.glove_type,
            cp.size,
            cp.color,
            cp.pack_size,
            cp.category,
            CASE
                WHEN cp.search_vector @@ to_tsquery('english', p_search_query) THEN
                    ts_rank(cp.search_vector, to_tsquery('english', p_search_query)) * 10
                ELSE
                    0
            END +
            CASE
                WHEN cp.name ILIKE p_search_pattern THEN 5
                WHEN cp.title ILIKE p_search_pattern THEN 3
                WHEN cp.sku ILIKE p_search_pattern THEN 4
                WHEN cp.id IN (SELECT product_id FROM supplier_product_matches) THEN 2
                ELSE 0
            END +
            COALESCE(similarity(cp.name, REPLACE(p_search_pattern, '%', '')), 0) * 3
            AS relevance_score
        FROM canonical_products cp
        WHERE
            cp.is_active = true
            AND (
                cp.search_vector @@ to_tsquery('english', p_search_query)
                OR cp.name ILIKE p_search_pattern
                OR cp.title ILIKE p_search_pattern
                OR cp.sku ILIKE p_search_pattern
                OR cp.material ILIKE p_search_pattern
                OR similarity(cp.name, REPLACE(p_search_pattern, '%', '')) > 0.3
                OR cp.id IN (SELECT product_id FROM supplier_product_matches)
            )
            AND (p_material IS NULL OR cp.material ILIKE '%' || p_material || '%')
            AND (p_size IS NULL OR cp.size = p_size)
            AND (p_category IS NULL OR cp.category = p_category)
    ),
    listing_relevance AS (
        SELECT
            public.resolve_canonical_listing_product_id(pmr.id) AS listing_id,
            MAX(pmr.relevance_score) AS relevance_score
        FROM product_matches_raw pmr
        GROUP BY 1
    ),
    product_matches AS (
        SELECT
            cp.id,
            cp.name,
            cp.title,
            cp.sku,
            cp.material,
            cp.glove_type,
            cp.size,
            cp.color,
            cp.pack_size,
            cp.category,
            lr.relevance_score
        FROM listing_relevance lr
        INNER JOIN canonical_products cp ON cp.id = lr.listing_id AND cp.is_active = true
    ),
    offer_stats AS (
        SELECT
            public.resolve_canonical_listing_product_id(so.product_id) AS listing_id,
            COUNT(*)::BIGINT AS offer_count,
            MIN(CASE WHEN ots.trust_band IN ('high_trust', 'medium_trust') THEN so.price END) AS best_price
        FROM supplier_offers so
        LEFT JOIN offer_trust_scores ots ON so.supplier_id = ots.supplier_id AND so.product_id = ots.product_id
        WHERE so.is_active = true
        GROUP BY 1
    ),
    best_suppliers AS (
        SELECT DISTINCT ON (listing_id)
            listing_id,
            supplier_name
        FROM (
            SELECT
                public.resolve_canonical_listing_product_id(so.product_id) AS listing_id,
                s.name AS supplier_name,
                so.price
            FROM supplier_offers so
            JOIN offer_trust_scores ots ON so.supplier_id = ots.supplier_id AND so.product_id = ots.product_id
            JOIN suppliers s ON so.supplier_id = s.id
            WHERE so.is_active = true AND ots.trust_band IN ('high_trust', 'medium_trust')
        ) ranked
        ORDER BY listing_id, price ASC NULLS LAST
    )
    SELECT
        pm.id,
        pm.name,
        pm.title,
        pm.sku,
        pm.material,
        pm.glove_type,
        pm.size,
        pm.color,
        pm.pack_size,
        pm.category,
        COALESCE(os.offer_count, 0)::BIGINT,
        os.best_price,
        bs.supplier_name,
        pm.relevance_score::REAL
    FROM product_matches pm
    LEFT JOIN offer_stats os ON pm.id = os.listing_id
    LEFT JOIN best_suppliers bs ON pm.id = bs.listing_id
    ORDER BY pm.relevance_score DESC, pm.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION search_products_listing_count(
    p_search_query TEXT,
    p_search_pattern TEXT,
    p_material TEXT DEFAULT NULL,
    p_size TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH supplier_product_matches AS (
        SELECT DISTINCT so.product_id
        FROM supplier_offers so
        WHERE so.is_active = true
          AND (
              so.sku ILIKE p_search_pattern
              OR COALESCE(so.product_name, '') ILIKE p_search_pattern
          )
    ),
    product_matches_raw AS (
        SELECT cp.id
        FROM canonical_products cp
        WHERE
            cp.is_active = true
            AND (
                cp.search_vector @@ to_tsquery('english', p_search_query)
                OR cp.name ILIKE p_search_pattern
                OR cp.title ILIKE p_search_pattern
                OR cp.sku ILIKE p_search_pattern
                OR cp.material ILIKE p_search_pattern
                OR similarity(cp.name, REPLACE(p_search_pattern, '%', '')) > 0.3
                OR cp.id IN (SELECT product_id FROM supplier_product_matches)
            )
            AND (p_material IS NULL OR cp.material ILIKE '%' || p_material || '%')
            AND (p_size IS NULL OR cp.size = p_size)
            AND (p_category IS NULL OR cp.category = p_category)
    )
    SELECT COUNT(DISTINCT public.resolve_canonical_listing_product_id(pmr.id))::BIGINT
    FROM product_matches_raw pmr;
$$;

COMMENT ON FUNCTION search_products_listing_count IS
  'Distinct storefront listings matching search_products_fts criteria (variant matches collapse to family).';

CREATE OR REPLACE FUNCTION search_products_autocomplete(
    p_query TEXT,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    match_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH raw AS (
        SELECT
            public.resolve_canonical_listing_product_id(cp.id) AS listing_id,
            cp.name AS raw_name,
            CASE WHEN cp.name ILIKE p_query || '%' THEN 0 ELSE 1 END AS pref
        FROM canonical_products cp
        WHERE
            cp.is_active = true
            AND (
                cp.name ILIKE p_query || '%'
                OR cp.name ILIKE '%' || p_query || '%'
            )
    ),
    dedup AS (
        SELECT DISTINCT ON (listing_id)
            listing_id,
            raw_name,
            pref
        FROM raw
        ORDER BY listing_id, pref ASC, LENGTH(raw_name) ASC
    )
    SELECT
        d.listing_id::TEXT,
        COALESCE(cp.name, d.raw_name)::TEXT,
        'product'::TEXT AS match_type
    FROM dedup d
    JOIN canonical_products cp ON cp.id = d.listing_id AND cp.is_active = true
    ORDER BY d.pref ASC, LENGTH(cp.name)
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.resolve_canonical_listing_product_id(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_products_listing_count(text, text, text, text, text) TO anon, authenticated, service_role;
