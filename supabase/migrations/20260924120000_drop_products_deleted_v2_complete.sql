-- =============================================================================
-- Remove all dependencies on catalogos.products_deleted_do_not_use (renamed
-- listing table). Repoint FKs to catalog_v2.catalog_products(id); rewrite
-- views and functions to use catalog_v2 / public.canonical_products only.
-- Then DROP TABLE without CASCADE.
--
-- Preconditions: catalog_v2.catalog_products exists. Safe no-op if dead table
-- is already absent.
-- =============================================================================

DO $body$
DECLARE
  dead regclass := to_regclass('catalogos.products_deleted_do_not_use');
  r RECORD;
  n_dep INT;
BEGIN
  IF dead IS NULL THEN
    RAISE NOTICE '20260924120000: skip — catalogos.products_deleted_do_not_use not found';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1) Views (no references to dead rel)
  -- ---------------------------------------------------------------------------
  IF to_regclass('catalogos.supplier_offers') IS NOT NULL THEN
    EXECUTE $v$
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
LEFT JOIN catalog_v2.catalog_products p ON p.id = so.product_id
$v$;
    EXECUTE 'COMMENT ON VIEW public.supplier_offers IS ''Public view over catalogos.supplier_offers; product_name from catalog_v2.catalog_products.''';
  END IF;

  IF to_regclass('public.order_items') IS NOT NULL THEN
    EXECUTE $v$
CREATE OR REPLACE VIEW public.order_items_resolved AS
SELECT
  oi.id,
  oi.order_id,
  oi.product_id AS legacy_product_id,
  oi.canonical_product_id AS stored_canonical_product_id,
  COALESCE(
    oi.canonical_product_id,
    (
      SELECT cp.id
      FROM catalog_v2.catalog_products cp
      WHERE cp.legacy_public_product_id = oi.product_id
      ORDER BY cp.updated_at DESC NULLS LAST
      LIMIT 1
    )
  ) AS catalog_product_id,
  oi.quantity,
  oi.unit_price,
  oi.size,
  oi.created_at
FROM public.order_items oi
$v$;
    EXECUTE 'COMMENT ON VIEW public.order_items_resolved IS ''catalog_product_id via catalog_v2.catalog_products.legacy_public_product_id; no catalogos listing table.''';
  END IF;

  IF to_regclass('public.inventory') IS NOT NULL THEN
    EXECUTE 'DROP VIEW IF EXISTS public.inventory_resolved';
    EXECUTE $v$
CREATE VIEW public.inventory_resolved AS
SELECT
  inv.id,
  cp.legacy_public_product_id AS legacy_product_id,
  inv.canonical_product_id AS stored_canonical_product_id,
  cp.id AS catalog_product_id,
  inv.quantity_on_hand,
  inv.quantity_reserved,
  inv.reorder_point,
  inv.updated_at
FROM public.inventory inv
LEFT JOIN catalog_v2.catalog_products cp ON cp.id = inv.canonical_product_id
$v$;
    EXECUTE 'COMMENT ON VIEW public.inventory_resolved IS ''inventory.canonical_product_id → catalog_v2.catalog_products; catalog_product_id is v2 parent id.''';
  END IF;

  EXECUTE $v$
CREATE OR REPLACE VIEW catalogos.product_images AS
SELECT
  i.id,
  cp.id AS product_id,
  i.url,
  i.sort_order,
  i.created_at
FROM catalog_v2.catalog_products cp
INNER JOIN catalog_v2.catalog_product_images i
  ON i.catalog_product_id = cp.id
$v$;
  EXECUTE $c$
COMMENT ON VIEW catalogos.product_images IS
  'Read-through to catalog_v2.catalog_product_images; product_id is catalog_v2.catalog_products.id.'
$c$;
  EXECUTE 'GRANT SELECT ON catalogos.product_images TO postgres, service_role, authenticated, anon';

  -- ---------------------------------------------------------------------------
  -- 2) Triggers on dead table (must drop before DROP TABLE)
  -- ---------------------------------------------------------------------------
  EXECUTE 'DROP TRIGGER IF EXISTS trg_catalogos_products_search_tsv ON catalogos.products_deleted_do_not_use';
  EXECUTE 'DROP TRIGGER IF EXISTS trg_catalogos_products_live_product_id_deprecated ON catalogos.products_deleted_do_not_use';

  -- ---------------------------------------------------------------------------
  -- 3) RLS policies on dead table (named in historical migrations)
  -- ---------------------------------------------------------------------------
  EXECUTE 'DROP POLICY IF EXISTS "public read products" ON catalogos.products_deleted_do_not_use';
  EXECUTE 'DROP POLICY IF EXISTS "catalogos_admin_all_products" ON catalogos.products_deleted_do_not_use';

  -- ---------------------------------------------------------------------------
  -- 4) Functions: canonical sync from v2 only
  -- ---------------------------------------------------------------------------
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION catalogos.sync_canonical_products()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos, public, catalog_v2
AS $sync$
DECLARE
  affected INT := 0;
BEGIN
  INSERT INTO public.canonical_products (
    id, name, title, sku, category_id, category, brand_id, description, attributes,
    material, glove_type, size, color, pack_size, product_line_code, family_id, is_listing_primary,
    is_active, search_vector, created_at, updated_at
  )
  SELECT
    cp.id,
    cp.name,
    cp.name,
    COALESCE(cp.internal_sku, v0.variant_sku, cp.slug),
    NULL::UUID,
    pt.code,
    cp.brand_id,
    cp.description,
    COALESCE(cp.metadata, '{}'::JSONB),
    (COALESCE(cp.metadata, '{}'::JSONB)->>'material')::TEXT,
    (COALESCE(cp.metadata, '{}'::JSONB)->>'glove_type')::TEXT,
    (COALESCE(cp.metadata, '{}'::JSONB)->>'size')::TEXT,
    (COALESCE(cp.metadata, '{}'::JSONB)->>'color')::TEXT,
    CASE
      WHEN NULLIF(trim(both FROM COALESCE(cp.metadata->>'pack_size', '')), '') ~ '^[0-9]+$'
      THEN (NULLIF(trim(both FROM COALESCE(cp.metadata->>'pack_size', '')), ''))::INTEGER
      ELSE NULL
    END,
    COALESCE(m.product_line_code, 'ppe_gloves'),
    NULL::UUID,
    TRUE,
    (cp.status = 'active'),
    (
      setweight(to_tsvector('english', COALESCE(cp.name, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(cp.internal_sku, v0.variant_sku, cp.slug, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(cp.description, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(cp.metadata->>'material', '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(cp.metadata->>'glove_type', '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(cp.metadata->>'size', '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(cp.metadata->>'color', '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(pt.code, '')), 'C')
    ),
    cp.created_at,
    cp.updated_at
  FROM catalog_v2.catalog_products cp
  LEFT JOIN catalog_v2.catalog_product_types pt ON pt.id = cp.product_type_id
  LEFT JOIN catalogos.category_product_line m ON m.category_slug = pt.code
  LEFT JOIN LATERAL (
    SELECT v.variant_sku
    FROM catalog_v2.catalog_variants v
    WHERE v.catalog_product_id = cp.id AND v.is_active
    ORDER BY v.sort_order NULLS LAST, v.created_at
    LIMIT 1
  ) v0 ON TRUE
  WHERE cp.status = 'active'
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
    search_vector = EXCLUDED.search_vector,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$sync$
$fn$;

  EXECUTE $c$
COMMENT ON FUNCTION catalogos.sync_canonical_products() IS
  'Upsert public.canonical_products from catalog_v2.catalog_products (active parents + variant sku).'
$c$;

  -- ---------------------------------------------------------------------------
  -- 5) merge_product_attribute_facets → catalog_v2.metadata.attributes
  -- ---------------------------------------------------------------------------
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION catalogos.merge_product_attribute_facets(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos, public, catalog_v2
AS $merge$
DECLARE
  facet jsonb;
  cat uuid;
  base jsonb;
  fk text;
  meta jsonb;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN;
  END IF;

  SELECT d.category_id
  INTO cat
  FROM catalogos.product_attributes pa
  INNER JOIN catalogos.attribute_definitions d ON d.id = pa.attribute_definition_id
  WHERE pa.product_id = p_product_id
  ORDER BY pa.created_at NULLS LAST
  LIMIT 1;

  SELECT COALESCE(cp.metadata, '{}'::JSONB)
  INTO meta
  FROM catalog_v2.catalog_products cp
  WHERE cp.id = p_product_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  base := COALESCE(meta->'attributes', '{}'::JSONB);

  SELECT coalesce(
    jsonb_object_agg(
      d.attribute_key,
      to_jsonb(coalesce(pa.value_text, pa.value_number::text, pa.value_boolean::text))
    ),
    '{}'::JSONB
  )
  INTO facet
  FROM catalogos.product_attributes pa
  INNER JOIN catalogos.attribute_definitions d ON d.id = pa.attribute_definition_id
  WHERE pa.product_id = p_product_id;

  IF cat IS NOT NULL THEN
    FOR fk IN
      SELECT d.attribute_key
      FROM catalogos.attribute_definitions d
      WHERE d.category_id = cat
        AND d.attribute_key IS NOT NULL
        AND btrim(d.attribute_key) <> ''
    LOOP
      base := base - fk;
    END LOOP;
  END IF;

  UPDATE catalog_v2.catalog_products cp
  SET
    metadata = jsonb_set(
      COALESCE(cp.metadata, '{}'::JSONB),
      '{attributes}',
      base || coalesce(facet, '{}'::JSONB),
      true
    ),
    updated_at = now()
  WHERE cp.id = p_product_id;
END;
$merge$
$fn$;

  EXECUTE $c$
COMMENT ON FUNCTION catalogos.merge_product_attribute_facets(uuid) IS
  'Merges catalogos.product_attributes facets into catalog_v2.catalog_products.metadata.attributes.'
$c$;

  -- ---------------------------------------------------------------------------
  -- 6) Orphan remediation (nullable → NULL; NOT NULL parents → delete row)
  -- ---------------------------------------------------------------------------
  IF to_regclass('catalogos.supplier_products_normalized') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.supplier_products_normalized t
SET master_product_id = NULL
WHERE t.master_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.master_product_id)
$u$;
    EXECUTE $u$
UPDATE catalogos.supplier_products_normalized t
SET ai_suggested_master_product_id = NULL
WHERE t.ai_suggested_master_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.ai_suggested_master_product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.pricing_rules') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.pricing_rules t SET scope_product_id = NULL
WHERE t.scope_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.scope_product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.review_decisions') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.review_decisions t SET master_product_id = NULL
WHERE t.master_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.master_product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.product_change_events') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.product_change_events t SET product_id = NULL
WHERE t.product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.product_match_candidates') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.product_match_candidates t SET suggested_master_product_id = NULL
WHERE t.suggested_master_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.suggested_master_product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.product_duplicate_candidates') IS NOT NULL THEN
    EXECUTE $u$
DELETE FROM catalogos.product_duplicate_candidates t
WHERE NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.product_id_a)
   OR NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v2 WHERE v2.id = t.product_id_b)
$u$;
  END IF;

  IF to_regclass('catalogos.admin_catalog_audit') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.admin_catalog_audit t SET product_id = NULL
WHERE t.product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.catalog_sync_item_results') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.catalog_sync_item_results t SET published_product_id = NULL
WHERE t.published_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.published_product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.offer_trust_scores') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.offer_trust_scores t SET product_id = NULL
WHERE t.product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.product_resolution_candidates') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.product_resolution_candidates t SET candidate_product_id = NULL
WHERE t.candidate_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.candidate_product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.match_decisions') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.match_decisions t SET candidate_product_id = NULL
WHERE t.candidate_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.candidate_product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.canonical_sync_retry_queue') IS NOT NULL THEN
    EXECUTE $u$
DELETE FROM catalogos.canonical_sync_retry_queue t
WHERE NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.product_id)
$u$;
  END IF;

  IF to_regclass('public.import_job_items') IS NOT NULL THEN
    EXECUTE $u$
UPDATE public.import_job_items t SET created_catalog_product_id = NULL
WHERE t.created_catalog_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.created_catalog_product_id)
$u$;
  END IF;

  IF to_regclass('public.product_favorites') IS NOT NULL THEN
    EXECUTE $u$
DELETE FROM public.product_favorites t
WHERE NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.bulk_quote_requests') IS NOT NULL THEN
    EXECUTE $u$
DELETE FROM catalogos.bulk_quote_requests t
WHERE NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.product_id)
$u$;
  END IF;

  IF to_regclass('catalogos.quote_line_items') IS NOT NULL THEN
    EXECUTE $u$
UPDATE catalogos.quote_line_items q
SET product_id = (q.product_snapshot->>'canonical_product_id')::UUID
WHERE NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = q.product_id)
  AND q.product_snapshot ? 'canonical_product_id'
  AND trim(both FROM COALESCE(q.product_snapshot->>'canonical_product_id', '')) <> ''
  AND EXISTS (
    SELECT 1 FROM catalog_v2.catalog_products v
    WHERE v.id = (q.product_snapshot->>'canonical_product_id')::UUID
  )
$u$;
    EXECUTE $u$
DELETE FROM catalogos.quote_line_items t
WHERE NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_products v WHERE v.id = t.product_id)
$u$;
  END IF;

  -- ---------------------------------------------------------------------------
  -- PHASE A — FK CLEANUP (drops only; no ADD CONSTRAINT in this phase)
  -- ---------------------------------------------------------------------------
  FOR iter IN 1..30
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.confrelid = 'catalogos.products_deleted_do_not_use'::regclass
    );

    FOR r IN
      SELECT c.conname, c.conrelid::regclass AS tbl
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.confrelid = 'catalogos.products_deleted_do_not_use'::regclass
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl::text, r.conname);
    END LOOP;
  END LOOP;

  SELECT COUNT(*)::INT INTO n_dep
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND c.confrelid = 'catalogos.products_deleted_do_not_use'::regclass;

  IF n_dep > 0 THEN
    RAISE EXCEPTION 'FK cleanup incomplete before rebuild';
  END IF;

  -- ---------------------------------------------------------------------------
  -- PHASE B — REBUILD (ADD CONSTRAINT only after Phase A count is zero)
  --     Drop same-named FK on child first so re-point from prior migrations cannot 42710.
  -- ---------------------------------------------------------------------------
  IF to_regclass('catalogos.supplier_products_normalized') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.supplier_products_normalized DROP CONSTRAINT IF EXISTS supplier_products_normalized_master_product_id_fkey';
    EXECUTE 'ALTER TABLE catalogos.supplier_products_normalized DROP CONSTRAINT IF EXISTS supplier_products_normalized_ai_suggested_master_product_i_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.supplier_products_normalized
  ADD CONSTRAINT supplier_products_normalized_master_product_id_fkey
  FOREIGN KEY (master_product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
    EXECUTE $fk$
ALTER TABLE catalogos.supplier_products_normalized
  ADD CONSTRAINT supplier_products_normalized_ai_suggested_master_product_i_fkey
  FOREIGN KEY (ai_suggested_master_product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
  END IF;

  IF to_regclass('catalogos.pricing_rules') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.pricing_rules DROP CONSTRAINT IF EXISTS pricing_rules_scope_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.pricing_rules
  ADD CONSTRAINT pricing_rules_scope_product_id_fkey
  FOREIGN KEY (scope_product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE
$fk$;
  END IF;

  IF to_regclass('catalogos.review_decisions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.review_decisions DROP CONSTRAINT IF EXISTS review_decisions_master_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.review_decisions
  ADD CONSTRAINT review_decisions_master_product_id_fkey
  FOREIGN KEY (master_product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
  END IF;

  IF to_regclass('catalogos.product_change_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.product_change_events DROP CONSTRAINT IF EXISTS product_change_events_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.product_change_events
  ADD CONSTRAINT product_change_events_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
  END IF;

  IF to_regclass('catalogos.product_match_candidates') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.product_match_candidates DROP CONSTRAINT IF EXISTS product_match_candidates_suggested_master_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.product_match_candidates
  ADD CONSTRAINT product_match_candidates_suggested_master_product_id_fkey
  FOREIGN KEY (suggested_master_product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
  END IF;

  IF to_regclass('catalogos.product_duplicate_candidates') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.product_duplicate_candidates DROP CONSTRAINT IF EXISTS product_duplicate_candidates_product_id_a_fkey';
    EXECUTE 'ALTER TABLE catalogos.product_duplicate_candidates DROP CONSTRAINT IF EXISTS product_duplicate_candidates_product_id_b_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.product_duplicate_candidates
  ADD CONSTRAINT product_duplicate_candidates_product_id_a_fkey
  FOREIGN KEY (product_id_a) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE
$fk$;
    EXECUTE $fk$
ALTER TABLE catalogos.product_duplicate_candidates
  ADD CONSTRAINT product_duplicate_candidates_product_id_b_fkey
  FOREIGN KEY (product_id_b) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE
$fk$;
  END IF;

  IF to_regclass('catalogos.admin_catalog_audit') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.admin_catalog_audit DROP CONSTRAINT IF EXISTS admin_catalog_audit_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.admin_catalog_audit
  ADD CONSTRAINT admin_catalog_audit_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
  END IF;

  IF to_regclass('catalogos.catalog_sync_item_results') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.catalog_sync_item_results DROP CONSTRAINT IF EXISTS catalog_sync_item_results_published_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.catalog_sync_item_results
  ADD CONSTRAINT catalog_sync_item_results_published_product_id_fkey
  FOREIGN KEY (published_product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
  END IF;

  IF to_regclass('catalogos.quote_line_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.quote_line_items DROP CONSTRAINT IF EXISTS quote_line_items_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.quote_line_items
  ADD CONSTRAINT quote_line_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE
$fk$;
  END IF;

  IF to_regclass('catalogos.offer_trust_scores') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.offer_trust_scores DROP CONSTRAINT IF EXISTS offer_trust_scores_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.offer_trust_scores
  ADD CONSTRAINT offer_trust_scores_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
  END IF;

  IF to_regclass('catalogos.bulk_quote_requests') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.bulk_quote_requests DROP CONSTRAINT IF EXISTS bulk_quote_requests_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.bulk_quote_requests
  ADD CONSTRAINT bulk_quote_requests_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE
$fk$;
  END IF;

  IF to_regclass('catalogos.product_resolution_candidates') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.product_resolution_candidates DROP CONSTRAINT IF EXISTS product_resolution_candidates_candidate_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.product_resolution_candidates
  ADD CONSTRAINT product_resolution_candidates_candidate_product_id_fkey
  FOREIGN KEY (candidate_product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
  END IF;

  IF to_regclass('catalogos.match_decisions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.match_decisions DROP CONSTRAINT IF EXISTS match_decisions_candidate_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.match_decisions
  ADD CONSTRAINT match_decisions_candidate_product_id_fkey
  FOREIGN KEY (candidate_product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
  END IF;

  IF to_regclass('catalogos.canonical_sync_retry_queue') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.canonical_sync_retry_queue DROP CONSTRAINT IF EXISTS canonical_sync_retry_queue_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.canonical_sync_retry_queue
  ADD CONSTRAINT canonical_sync_retry_queue_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE
$fk$;
  END IF;

  IF to_regclass('public.import_job_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.import_job_items DROP CONSTRAINT IF EXISTS import_job_items_created_catalog_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE public.import_job_items
  ADD CONSTRAINT import_job_items_created_catalog_product_id_fkey
  FOREIGN KEY (created_catalog_product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE SET NULL
$fk$;
  END IF;

  IF to_regclass('public.product_favorites') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.product_favorites DROP CONSTRAINT IF EXISTS product_favorites_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE public.product_favorites
  ADD CONSTRAINT product_favorites_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE
$fk$;
  END IF;

  IF to_regclass('catalogos.supplier_offers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.supplier_offers DROP CONSTRAINT IF EXISTS supplier_offers_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.supplier_offers
  ADD CONSTRAINT supplier_offers_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE
$fk$;
  END IF;

  IF to_regclass('catalogos.publish_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.publish_events DROP CONSTRAINT IF EXISTS publish_events_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.publish_events
  ADD CONSTRAINT publish_events_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE
$fk$;
  END IF;

  IF to_regclass('catalogos.product_attributes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE catalogos.product_attributes DROP CONSTRAINT IF EXISTS product_attributes_product_id_fkey';
    EXECUTE $fk$
ALTER TABLE catalogos.product_attributes
  ADD CONSTRAINT product_attributes_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE
$fk$;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 9) Pre-DROP checks (no FKs, no user triggers, no view definitions using rel)
  -- ---------------------------------------------------------------------------
  SELECT COUNT(*)::INT INTO n_dep
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND c.confrelid = 'catalogos.products_deleted_do_not_use'::regclass;

  IF n_dep > 0 THEN
    RAISE EXCEPTION '20260924120000: % foreign key(s) still reference catalogos.products_deleted_do_not_use',
      n_dep;
  END IF;

  SELECT COUNT(*)::INT INTO n_dep
  FROM pg_trigger t
  WHERE t.tgrelid = dead::oid
    AND NOT t.tgisinternal;

  IF n_dep > 0 THEN
    RAISE EXCEPTION '20260924120000: % non-internal trigger(s) remain on catalogos.products_deleted_do_not_use',
      n_dep;
  END IF;

  SELECT COUNT(*)::INT INTO n_dep
  FROM information_schema.view_table_usage u
  WHERE u.table_schema = 'catalogos'
    AND u.table_name = 'products_deleted_do_not_use';

  IF n_dep > 0 THEN
    RAISE EXCEPTION '20260924120000: % view(s) still reference catalogos.products_deleted_do_not_use (information_schema.view_table_usage)',
      n_dep;
  END IF;

  SELECT COUNT(*)::INT INTO n_dep
  FROM pg_depend d
  WHERE d.refobjid = dead::oid
    AND d.objid <> dead::oid
    AND d.deptype NOT IN ('i', 'p', 'a');

  IF n_dep > 0 THEN
    RAISE EXCEPTION '20260924120000: pg_depend reports % non-internal dependent row(s) on catalogos.products_deleted_do_not_use (objid <> refobjid); aborting DROP',
      n_dep;
  END IF;

  EXECUTE 'DROP TABLE catalogos.products_deleted_do_not_use';

  RAISE NOTICE '20260924120000: dropped catalogos.products_deleted_do_not_use';
END;
$body$;
