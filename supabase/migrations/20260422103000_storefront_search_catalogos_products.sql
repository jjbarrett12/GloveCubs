-- Storefront search + listing resolution read directly from catalogos.products.
-- Replaces public.canonical_products as the source inside search RPCs and resolve_canonical_listing_product_id.

-- -----------------------------------------------------------------------------
-- 1) FTS / trigram on catalogos.products (mirrors former canonical_products search surface)
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.products
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_catalogos_products_search_vector
  ON catalogos.products USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_catalogos_products_name_trgm
  ON catalogos.products USING GIN (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION catalogos.catalogos_products_search_tsv()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  cat_slug text;
BEGIN
  SELECT c.slug INTO cat_slug FROM catalogos.categories c WHERE c.id = NEW.category_id;
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.sku, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.attributes->>'material', '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.attributes->>'glove_type', '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.attributes->>'size', '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.attributes->>'color', '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(cat_slug, '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalogos_products_search_tsv ON catalogos.products;
CREATE TRIGGER trg_catalogos_products_search_tsv
  BEFORE INSERT OR UPDATE OF name, sku, description, attributes, category_id, is_active
  ON catalogos.products
  FOR EACH ROW
  EXECUTE FUNCTION catalogos.catalogos_products_search_tsv();

UPDATE catalogos.products p
SET search_vector =
  setweight(to_tsvector('english', COALESCE(p.name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(p.sku, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(p.description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(p.attributes->>'material', '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(p.attributes->>'glove_type', '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(p.attributes->>'size', '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(p.attributes->>'color', '')), 'C') ||
  setweight(
    to_tsvector(
      'english',
      COALESCE((SELECT c.slug FROM catalogos.categories c WHERE c.id = p.category_id), '')
    ),
    'C'
  )
WHERE p.search_vector IS NULL;

-- -----------------------------------------------------------------------------
-- 2) Listing id resolution from catalogos.products (same UUID ids as before)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_canonical_listing_product_id(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = catalogos, public
AS $$
DECLARE
  fid uuid;
  lid uuid;
BEGIN
  SELECT p.family_id INTO fid
  FROM catalogos.products p
  WHERE p.id = p_id AND COALESCE(p.is_active, true);

  IF NOT FOUND THEN
    RETURN p_id;
  END IF;

  IF fid IS NULL THEN
    RETURN p_id;
  END IF;

  SELECT p2.id INTO lid
  FROM catalogos.products p2
  WHERE p2.family_id = fid AND COALESCE(p2.is_active, true)
  ORDER BY p2.sku ASC NULLS LAST, p2.created_at ASC
  LIMIT 1;

  RETURN COALESCE(lid, p_id);
END;
$$;

COMMENT ON FUNCTION public.resolve_canonical_listing_product_id(uuid) IS
  'Returns the primary listing row id for the family of p_id (lowest sku, then created_at), or p_id when standalone; uses catalogos.products.';

-- -----------------------------------------------------------------------------
-- 3) search_products_fts / count / autocomplete — catalogos.products as source
-- -----------------------------------------------------------------------------
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
)
LANGUAGE plpgsql
STABLE
SET search_path = public, catalogos
AS $$
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
            p.id,
            p.name,
            p.name AS title,
            p.sku,
            (p.attributes->>'material')::text AS material,
            (p.attributes->>'glove_type')::text AS glove_type,
            (p.attributes->>'size')::text AS size,
            (p.attributes->>'color')::text AS color,
            (p.attributes->>'pack_size')::integer AS pack_size,
            c.slug AS category,
            CASE
                WHEN p.search_vector @@ to_tsquery('english', p_search_query) THEN
                    ts_rank(p.search_vector, to_tsquery('english', p_search_query)) * 10
                ELSE
                    0
            END +
            CASE
                WHEN p.name ILIKE p_search_pattern THEN 5
                WHEN COALESCE(p.description, '') ILIKE p_search_pattern THEN 3
                WHEN p.sku ILIKE p_search_pattern THEN 4
                WHEN p.id IN (SELECT product_id FROM supplier_product_matches) THEN 2
                ELSE 0
            END +
            COALESCE(similarity(p.name, REPLACE(p_search_pattern, '%', '')), 0) * 3
            AS relevance_score
        FROM catalogos.products p
        LEFT JOIN catalogos.categories c ON c.id = p.category_id
        WHERE
            p.is_active = true
            AND (
                p.search_vector @@ to_tsquery('english', p_search_query)
                OR p.name ILIKE p_search_pattern
                OR p.sku ILIKE p_search_pattern
                OR (p.attributes->>'material') ILIKE p_search_pattern
                OR similarity(p.name, REPLACE(p_search_pattern, '%', '')) > 0.3
                OR p.id IN (SELECT product_id FROM supplier_product_matches)
            )
            AND (p_material IS NULL OR (p.attributes->>'material') ILIKE '%' || p_material || '%')
            AND (p_size IS NULL OR (p.attributes->>'size') = p_size)
            AND (p_category IS NULL OR c.slug = p_category)
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
            p.id,
            p.name,
            p.name AS title,
            p.sku,
            (p.attributes->>'material')::text AS material,
            (p.attributes->>'glove_type')::text AS glove_type,
            (p.attributes->>'size')::text AS size,
            (p.attributes->>'color')::text AS color,
            (p.attributes->>'pack_size')::integer AS pack_size,
            c.slug AS category,
            lr.relevance_score
        FROM listing_relevance lr
        INNER JOIN catalogos.products p ON p.id = lr.listing_id AND p.is_active = true
        LEFT JOIN catalogos.categories c ON c.id = p.category_id
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
        pm.id::text,
        pm.name::text,
        pm.title::text,
        pm.sku::text,
        pm.material::text,
        pm.glove_type::text,
        pm.size::text,
        pm.color::text,
        pm.pack_size::integer,
        pm.category::text,
        COALESCE(os.offer_count, 0)::BIGINT,
        os.best_price,
        bs.supplier_name::text,
        pm.relevance_score::REAL
    FROM product_matches pm
    LEFT JOIN offer_stats os ON pm.id = os.listing_id
    LEFT JOIN best_suppliers bs ON pm.id = bs.listing_id
    ORDER BY pm.relevance_score DESC, pm.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

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
SET search_path = public, catalogos
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
        SELECT p.id
        FROM catalogos.products p
        LEFT JOIN catalogos.categories c ON c.id = p.category_id
        WHERE
            p.is_active = true
            AND (
                p.search_vector @@ to_tsquery('english', p_search_query)
                OR p.name ILIKE p_search_pattern
                OR p.sku ILIKE p_search_pattern
                OR (p.attributes->>'material') ILIKE p_search_pattern
                OR similarity(p.name, REPLACE(p_search_pattern, '%', '')) > 0.3
                OR p.id IN (SELECT product_id FROM supplier_product_matches)
            )
            AND (p_material IS NULL OR (p.attributes->>'material') ILIKE '%' || p_material || '%')
            AND (p_size IS NULL OR (p.attributes->>'size') = p_size)
            AND (p_category IS NULL OR c.slug = p_category)
    )
    SELECT COUNT(DISTINCT public.resolve_canonical_listing_product_id(pmr.id))::BIGINT
    FROM product_matches_raw pmr;
$$;

CREATE OR REPLACE FUNCTION search_products_autocomplete(
    p_query TEXT,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    match_type TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, catalogos
AS $$
BEGIN
    RETURN QUERY
    WITH raw AS (
        SELECT
            public.resolve_canonical_listing_product_id(p.id) AS listing_id,
            p.name AS raw_name,
            CASE WHEN p.name ILIKE p_query || '%' THEN 0 ELSE 1 END AS pref
        FROM catalogos.products p
        WHERE
            p.is_active = true
            AND (
                p.name ILIKE p_query || '%'
                OR p.name ILIKE '%' || p_query || '%'
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
        COALESCE(p.name, d.raw_name)::TEXT,
        'product'::TEXT AS match_type
    FROM dedup d
    JOIN catalogos.products p ON p.id = d.listing_id AND p.is_active = true
    ORDER BY d.pref ASC, LENGTH(p.name)
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION search_products_fts IS
  'Full-text + fuzzy storefront search; reads catalogos.products (listing rows via resolve_canonical_listing_product_id).';
