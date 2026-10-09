-- =============================================================================
-- Phase 1A: correct security review blockers (orders, membership, cost views,
-- quote status history, reset claim columns, least-privilege mutations).
-- Continues after 20261227120400. Do not rename to calendar-today timestamps.
-- Rollback: restore prior policies only with explicit security review; prefer
--   leave deny-by-default and re-add narrow policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Password reset claim columns (app claim → update → consume / release)
-- -----------------------------------------------------------------------------
ALTER TABLE public.password_reset_tokens
  ADD COLUMN IF NOT EXISTS claim_id UUID;

ALTER TABLE public.password_reset_tokens
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

ALTER TABLE public.password_reset_tokens
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.password_reset_tokens.claim_id IS
  'In-flight password-update claim; concurrent claims fail until claim_expires_at.';
COMMENT ON COLUMN public.password_reset_tokens.claim_expires_at IS
  'When an abandoned claim becomes reclaimable without consuming the token.';

-- -----------------------------------------------------------------------------
-- Orders / order_lines: customers SELECT only; no client INSERT/UPDATE/DELETE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS gc_orders_insert ON gc_commerce.orders;
REVOKE INSERT, UPDATE, DELETE ON TABLE gc_commerce.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE gc_commerce.orders FROM anon;
GRANT SELECT ON TABLE gc_commerce.orders TO authenticated;

DROP POLICY IF EXISTS gc_order_lines_insert ON gc_commerce.order_lines;
DROP POLICY IF EXISTS gc_order_lines_update ON gc_commerce.order_lines;
DROP POLICY IF EXISTS gc_order_lines_delete ON gc_commerce.order_lines;
REVOKE INSERT, UPDATE, DELETE ON TABLE gc_commerce.order_lines FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE gc_commerce.order_lines FROM anon;
GRANT SELECT ON TABLE gc_commerce.order_lines TO authenticated;

-- -----------------------------------------------------------------------------
-- company_members: customer SELECT only; writes service_role / internal only
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS gc_company_members_insert_owner_admin ON gc_commerce.company_members;
DROP POLICY IF EXISTS gc_company_members_update_owner_admin ON gc_commerce.company_members;
DROP POLICY IF EXISTS gc_company_members_delete_owner_admin ON gc_commerce.company_members;
REVOKE INSERT, UPDATE, DELETE ON TABLE gc_commerce.company_members FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE gc_commerce.company_members FROM anon;
GRANT SELECT ON TABLE gc_commerce.company_members TO authenticated;

COMMENT ON TABLE gc_commerce.company_members IS
  'Company membership. Customer clients may SELECT own company rows. INSERT/UPDATE/DELETE via service_role or internal admin only until a dedicated invitation system ships.';

-- -----------------------------------------------------------------------------
-- Quote status history: drop permissive open policy; admin/service only
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.quote_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_quote_status_history ON catalogos.quote_status_history;
DROP POLICY IF EXISTS catalogos_quote_status_history_admin_all ON catalogos.quote_status_history;

CREATE POLICY catalogos_quote_status_history_admin_all
  ON catalogos.quote_status_history
  FOR ALL
  TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

REVOKE ALL ON TABLE catalogos.quote_status_history FROM anon;
REVOKE ALL ON TABLE catalogos.quote_status_history FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalogos.quote_status_history TO authenticated;
GRANT ALL ON TABLE catalogos.quote_status_history TO service_role, postgres;

-- -----------------------------------------------------------------------------
-- Tighten ship-to / invoice deletes (no customer hard-delete of history)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS gc_ship_to_delete ON gc_commerce.ship_to_addresses;
-- No authenticated DELETE policy → deny. Soft-delete/internal via service_role.

DROP POLICY IF EXISTS gc_ship_to_insert ON gc_commerce.ship_to_addresses;
CREATE POLICY gc_ship_to_insert
  ON gc_commerce.ship_to_addresses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_admin()
    OR (
      company_id IS NOT NULL
      AND gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin'])
      AND created_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS gc_ship_to_update ON gc_commerce.ship_to_addresses;
CREATE POLICY gc_ship_to_update
  ON gc_commerce.ship_to_addresses
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_admin()
    OR (company_id IS NOT NULL AND gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin']))
  )
  WITH CHECK (
    public.is_active_admin()
    OR (company_id IS NOT NULL AND gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin']))
  );

-- Members retain SELECT via existing gc_ship_to_select.
REVOKE DELETE ON TABLE gc_commerce.ship_to_addresses FROM authenticated;

DROP POLICY IF EXISTS gc_uploaded_invoices_delete ON gc_commerce.uploaded_invoices;
REVOKE DELETE ON TABLE gc_commerce.uploaded_invoices FROM authenticated;
GRANT SELECT, INSERT ON TABLE gc_commerce.uploaded_invoices TO authenticated;

-- -----------------------------------------------------------------------------
-- Cost-bearing compatibility views: cost always NULL on public shape;
-- internal view retains supplier_unit_cost for service_role only.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW catalog_v2.v_products_legacy_shape AS
SELECT
  cp.legacy_public_product_id AS id,
  cp.id AS canonical_product_id,
  cp.internal_sku AS sku,
  cp.name,
  COALESCE(cp.metadata->>'legacy_brand', '') AS brand,
  NULL::numeric AS cost,
  NULLIF(cp.metadata->>'legacy_retail_price', '')::numeric AS price,
  NULLIF(cp.metadata->>'legacy_bulk_price', '')::numeric AS bulk_price,
  (
    SELECT i.url
    FROM catalog_v2.catalog_product_images i
    WHERE i.catalog_product_id = cp.id
    ORDER BY i.is_primary DESC, i.sort_order, i.created_at
    LIMIT 1
  ) AS image_url,
  cp.manufacturer_id,
  cp.created_at,
  cp.updated_at,
  cp.description,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'material'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS material,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'color'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS color,
  COALESCE(size_csv.sizes, '') AS sizes,
  NULLIF(cp.metadata->>'legacy_pack_qty', '')::integer AS pack_qty,
  NULLIF(cp.metadata->>'legacy_case_qty', '')::integer AS case_qty,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'category'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS category,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'subcategory'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS subcategory,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'thickness'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS thickness,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'powder'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS powder,
  (
    SELECT vav.value_text FROM catalog_v2.catalog_variants cv
    INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
    INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'grade'
    WHERE cv.catalog_product_id = cp.id
    ORDER BY cv.sort_order, cv.id LIMIT 1
  ) AS grade,
  cp.slug,
  COALESCE(NULLIF(cp.metadata->>'legacy_in_stock', '')::smallint, 1::smallint) AS in_stock,
  COALESCE(NULLIF(cp.metadata->>'legacy_featured', '')::smallint, 0::smallint) AS featured,
  cp.metadata->>'legacy_use_case' AS use_case,
  cp.metadata->>'legacy_certifications' AS certifications,
  cp.metadata->>'legacy_texture' AS texture,
  cp.metadata->>'legacy_cuff_style' AS cuff_style,
  cp.metadata->>'legacy_sterility' AS sterility,
  cp.metadata->>'legacy_video_url' AS video_url,
  COALESCE(cp.metadata->'legacy_industry_tags', '[]'::jsonb) AS industry_tags,
  COALESCE((
    SELECT jsonb_agg(trim(both from u.url) ORDER BY u.sort_order, u.created_at)
    FROM catalog_v2.catalog_product_images u
    WHERE u.catalog_product_id = cp.id
  ), '[]'::jsonb) AS images,
  COALESCE(cp.metadata->'legacy_attributes_snapshot', '{}'::jsonb) AS attributes,
  ARRAY[]::text[] AS attribute_warnings,
  '{}'::jsonb AS source_confidence
FROM catalog_v2.catalog_products cp
LEFT JOIN LATERAL (
  SELECT string_agg(vav.value_text, ',' ORDER BY cv.sort_order) AS sizes
  FROM catalog_v2.catalog_variants cv
  INNER JOIN catalog_v2.catalog_variant_attribute_values vav ON vav.catalog_variant_id = cv.id
  INNER JOIN catalog_v2.catalog_attribute_definitions d ON d.id = vav.attribute_definition_id AND d.attribute_key = 'size'
  WHERE cv.catalog_product_id = cp.id
) size_csv ON true
WHERE cp.legacy_public_product_id IS NOT NULL;

CREATE OR REPLACE VIEW public.products_legacy_from_catalog_v2 AS
SELECT * FROM catalog_v2.v_products_legacy_shape;

CREATE OR REPLACE VIEW catalog_v2.v_products_legacy_shape_internal AS
SELECT
  base.*,
  cost_l.min_unit_cost AS supplier_unit_cost
FROM catalog_v2.v_products_legacy_shape base
LEFT JOIN LATERAL (
  SELECT MIN(o.unit_cost) AS min_unit_cost
  FROM catalog_v2.catalog_variants cv
  INNER JOIN catalog_v2.catalog_supplier_product_map m ON m.catalog_variant_id = cv.id
  INNER JOIN catalog_v2.supplier_offers o ON o.supplier_product_id = m.supplier_product_id AND o.is_active = true
  WHERE cv.catalog_product_id = base.canonical_product_id
) cost_l ON true;

REVOKE ALL ON TABLE catalog_v2.v_products_legacy_shape FROM anon;
REVOKE ALL ON TABLE catalog_v2.v_products_legacy_shape FROM PUBLIC;
GRANT SELECT ON TABLE catalog_v2.v_products_legacy_shape TO authenticated, service_role, postgres;

REVOKE ALL ON TABLE public.products_legacy_from_catalog_v2 FROM anon;
REVOKE ALL ON TABLE public.products_legacy_from_catalog_v2 FROM PUBLIC;
GRANT SELECT ON TABLE public.products_legacy_from_catalog_v2 TO authenticated, service_role, postgres;

REVOKE ALL ON TABLE catalog_v2.v_products_legacy_shape_internal FROM anon;
REVOKE ALL ON TABLE catalog_v2.v_products_legacy_shape_internal FROM authenticated;
REVOKE ALL ON TABLE catalog_v2.v_products_legacy_shape_internal FROM PUBLIC;
GRANT SELECT ON TABLE catalog_v2.v_products_legacy_shape_internal TO service_role, postgres;

COMMENT ON VIEW catalog_v2.v_products_legacy_shape IS
  'Legacy product shape for APIs. cost is always NULL — supplier economics in v_products_legacy_shape_internal (service_role).';

COMMENT ON VIEW catalog_v2.v_products_legacy_shape_internal IS
  'Internal legacy product shape including supplier_unit_cost. service_role only.';

DO $$
DECLARE
  v TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'gc_commerce.v_audit_line_internal_pricing',
    'gc_commerce.v_audit_line_margin',
    'gc_commerce.v_audit_margin_risks_only',
    'gc_commerce.v_audit_order_margin_summary',
    'gc_commerce.v_pricing_checkout_audit_summary'
  ]
  LOOP
    IF to_regclass(v) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE %s FROM anon', v);
      EXECUTE format('REVOKE ALL ON TABLE %s FROM authenticated', v);
      EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC', v);
      EXECUTE format('GRANT SELECT ON TABLE %s TO service_role, postgres', v);
    END IF;
  END LOOP;
END $$;
