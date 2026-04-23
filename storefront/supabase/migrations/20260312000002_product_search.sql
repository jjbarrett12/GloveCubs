-- Product Search Infrastructure
-- Full-text search and trigram indexes for fast, relevant product search

-- ============================================================================
-- ENABLE EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- ADD SEARCH COLUMNS IF NOT EXISTS
-- ============================================================================

DO $$
BEGIN
    -- Add full-text search vector column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'canonical_products' AND column_name = 'search_vector'
    ) THEN
        ALTER TABLE canonical_products ADD COLUMN search_vector tsvector;
    END IF;
    
    -- Add material column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'canonical_products' AND column_name = 'material'
    ) THEN
        ALTER TABLE canonical_products ADD COLUMN material TEXT;
    END IF;
    
    -- Add glove_type column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'canonical_products' AND column_name = 'glove_type'
    ) THEN
        ALTER TABLE canonical_products ADD COLUMN glove_type TEXT;
    END IF;
    
    -- Add size column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'canonical_products' AND column_name = 'size'
    ) THEN
        ALTER TABLE canonical_products ADD COLUMN size TEXT;
    END IF;
    
    -- Add color column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'canonical_products' AND column_name = 'color'
    ) THEN
        ALTER TABLE canonical_products ADD COLUMN color TEXT;
    END IF;
    
    -- Add pack_size column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'canonical_products' AND column_name = 'pack_size'
    ) THEN
        ALTER TABLE canonical_products ADD COLUMN pack_size INTEGER;
    END IF;
END $$;

-- ============================================================================
-- CREATE SEARCH INDEXES
-- ============================================================================

-- Full-text search index on search_vector
CREATE INDEX IF NOT EXISTS idx_canonical_products_search_vector 
    ON canonical_products USING GIN (search_vector);

-- Trigram indexes for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_canonical_products_name_trgm 
    ON canonical_products USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_canonical_products_title_trgm 
    ON canonical_products USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_canonical_products_sku_trgm 
    ON canonical_products USING GIN (sku gin_trgm_ops);

-- B-tree indexes for filtering
CREATE INDEX IF NOT EXISTS idx_canonical_products_material 
    ON canonical_products (material) WHERE material IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_products_size 
    ON canonical_products (size) WHERE size IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_products_category 
    ON canonical_products (category) WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_products_active 
    ON canonical_products (is_active) WHERE is_active = true;

-- ============================================================================
-- UPDATE SEARCH VECTOR FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.sku, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.material, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.glove_type, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.size, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for search vector updates
DROP TRIGGER IF EXISTS trg_update_product_search_vector ON canonical_products;
CREATE TRIGGER trg_update_product_search_vector
    BEFORE INSERT OR UPDATE ON canonical_products
    FOR EACH ROW
    EXECUTE FUNCTION update_product_search_vector();

-- ============================================================================
-- BACKFILL EXISTING PRODUCTS
-- ============================================================================

UPDATE canonical_products 
SET search_vector = 
    setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(title, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(sku, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(material, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(glove_type, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(size, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(category, '')), 'C')
WHERE search_vector IS NULL;

-- ============================================================================
-- SEARCH FUNCTION WITH FULL-TEXT AND TRIGRAM
-- ============================================================================

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
        -- Find products that match via supplier product names
        SELECT DISTINCT so.product_id
        FROM supplier_offers so
        WHERE so.is_active = true
          AND (
              so.sku ILIKE p_search_pattern
              OR COALESCE(so.product_name, '') ILIKE p_search_pattern
          )
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
    offer_stats AS (
        SELECT 
            so.product_id,
            COUNT(*) AS offer_count,
            MIN(CASE WHEN ots.trust_band IN ('high_trust', 'medium_trust') THEN so.price END) AS best_price
        FROM supplier_offers so
        LEFT JOIN offer_trust_scores ots ON so.supplier_id = ots.supplier_id AND so.product_id = ots.product_id
        WHERE so.is_active = true
        GROUP BY so.product_id
    ),
    best_suppliers AS (
        SELECT DISTINCT ON (so.product_id)
            so.product_id,
            s.name AS supplier_name
        FROM supplier_offers so
        JOIN offer_trust_scores ots ON so.supplier_id = ots.supplier_id AND so.product_id = ots.product_id
        JOIN suppliers s ON so.supplier_id = s.id
        WHERE so.is_active = true AND ots.trust_band IN ('high_trust', 'medium_trust')
        ORDER BY so.product_id, so.price ASC
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
    LEFT JOIN offer_stats os ON pm.id = os.product_id
    LEFT JOIN best_suppliers bs ON pm.id = bs.product_id
    ORDER BY pm.relevance_score DESC, pm.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- AUTOCOMPLETE FUNCTION
-- ============================================================================

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
    SELECT 
        cp.id,
        cp.name,
        'product'::TEXT AS match_type
    FROM canonical_products cp
    WHERE 
        cp.is_active = true
        AND (
            cp.name ILIKE p_query || '%'
            OR cp.name ILIKE '%' || p_query || '%'
        )
    ORDER BY 
        CASE WHEN cp.name ILIKE p_query || '%' THEN 0 ELSE 1 END,
        LENGTH(cp.name)
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN canonical_products.search_vector IS 'Full-text search vector for fast product search';
COMMENT ON FUNCTION search_products_fts IS 'Search products using full-text search and trigram matching';
COMMENT ON FUNCTION search_products_autocomplete IS 'Quick autocomplete suggestions for product search';
