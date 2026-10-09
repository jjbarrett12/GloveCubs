-- One CatalogOS publish commits catalog, offer, commerce, and staging together.
-- A failure at any stage, including gc_commerce.sellable_products, rolls the whole call back.
-- sell_price is never written. Storefront list approval stays a separate operator action.
-- fail_at is ignored unless the caller sets glovecubs.publish_fault_injection=on in the same transaction.

CREATE OR REPLACE FUNCTION catalogos.publish_assert_stage(p_fail text, p_stage text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_fail IS NOT NULL AND p_fail = p_stage THEN
    RAISE EXCEPTION 'publish_fault:%', p_stage USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION catalogos.publish_one_staged_row(p_plan jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos, catalog_v2, gc_commerce, public
AS $$
DECLARE
  v_fail text := NULLIF(p_plan->>'fail_at', '');
  v_product_id uuid := (p_plan->>'product_id')::uuid;
  v_variant_id uuid;
  v_brand_id uuid;
  v_meta jsonb;
  v_multi text[];
  v_facet jsonb := '{}'::jsonb;
  v_key text;
  v_values jsonb;
BEGIN
  IF v_fail IS NOT NULL
     AND coalesce(current_setting('glovecubs.publish_fault_injection', true), '') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'publish fault injection is disabled';
  END IF;

  PERFORM catalogos.publish_assert_stage(v_fail, 'product');

  IF NULLIF(p_plan->>'brand_name', '') IS NOT NULL THEN
    SELECT id INTO v_brand_id
    FROM catalogos.brands
    WHERE slug = p_plan->>'brand_slug';
    IF v_brand_id IS NULL THEN
      INSERT INTO catalogos.brands (name, slug)
      VALUES (p_plan->>'brand_name', p_plan->>'brand_slug')
      RETURNING id INTO v_brand_id;
    END IF;
  END IF;

  UPDATE catalog_v2.catalog_products
  SET
    name = COALESCE(NULLIF(p_plan->>'name', ''), name),
    description = CASE WHEN p_plan ? 'description' THEN NULLIF(p_plan->>'description', '') ELSE description END,
    brand_id = COALESCE(v_brand_id, brand_id),
    slug = COALESCE(NULLIF(p_plan->>'slug', ''), slug),
    internal_sku = COALESCE(NULLIF(p_plan->>'internal_sku', ''), internal_sku),
    updated_at = now()
  WHERE id = v_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog product % not found', v_product_id;
  END IF;

  PERFORM catalogos.publish_assert_stage(v_fail, 'variant');

  IF NULLIF(p_plan->>'variant_sku', '') IS NOT NULL THEN
    SELECT id INTO v_variant_id
    FROM catalog_v2.catalog_variants
    WHERE variant_sku = p_plan->>'variant_sku'
      AND catalog_product_id <> v_product_id
    LIMIT 1;
    IF v_variant_id IS NOT NULL THEN
      RAISE EXCEPTION 'variant_sku % is already used by another catalog product', p_plan->>'variant_sku';
    END IF;

    SELECT id INTO v_variant_id
    FROM catalog_v2.catalog_variants
    WHERE catalog_product_id = v_product_id
      AND size_code = p_plan->>'size_code'
    LIMIT 1;

    IF v_variant_id IS NULL THEN
      SELECT id INTO v_variant_id
      FROM catalog_v2.catalog_variants
      WHERE catalog_product_id = v_product_id
        AND variant_sku = p_plan->>'variant_sku'
      LIMIT 1;
    END IF;

    IF v_variant_id IS NULL THEN
      INSERT INTO catalog_v2.catalog_variants (
        catalog_product_id, variant_sku, size_code, sort_order, is_active, metadata, gtin, mpn
      ) VALUES (
        v_product_id,
        p_plan->>'variant_sku',
        NULLIF(p_plan->>'size_code', ''),
        0,
        true,
        COALESCE(p_plan->'variant_metadata', '{}'::jsonb),
        NULLIF(p_plan->>'gtin', ''),
        NULLIF(p_plan->>'mpn', '')
      )
      RETURNING id INTO v_variant_id;
    ELSE
      UPDATE catalog_v2.catalog_variants
      SET
        variant_sku = p_plan->>'variant_sku',
        size_code = COALESCE(NULLIF(p_plan->>'size_code', ''), size_code),
        metadata = COALESCE(p_plan->'variant_metadata', metadata),
        gtin = COALESCE(NULLIF(p_plan->>'gtin', ''), gtin),
        mpn = COALESCE(NULLIF(p_plan->>'mpn', ''), mpn),
        is_active = true,
        updated_at = now()
      WHERE id = v_variant_id;
    END IF;
  END IF;

  PERFORM catalogos.publish_assert_stage(v_fail, 'image');

  IF NULLIF(p_plan->>'image_url', '') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM catalog_v2.catalog_product_images
       WHERE catalog_product_id = v_product_id
         AND COALESCE(metadata->>'image_provenance', '') <> 'placeholder'
     ) THEN
    INSERT INTO catalog_v2.catalog_product_images (catalog_product_id, url, sort_order, metadata)
    VALUES (
      v_product_id,
      p_plan->>'image_url',
      0,
      jsonb_build_object('image_provenance', 'supplier_feed')
    );
  END IF;

  PERFORM catalogos.publish_assert_stage(v_fail, 'attributes');

  IF jsonb_typeof(p_plan->'purge_definition_ids') = 'array' THEN
    DELETE FROM catalogos.product_attributes
    WHERE product_id = v_product_id
      AND attribute_definition_id IN (
        SELECT value::uuid FROM jsonb_array_elements_text(p_plan->'purge_definition_ids')
      );
  END IF;

  IF jsonb_typeof(p_plan->'attribute_rows') = 'array' THEN
    DELETE FROM catalogos.product_attributes
    WHERE product_id = v_product_id
      AND attribute_definition_id IN (
        SELECT DISTINCT (value->>'attribute_definition_id')::uuid
        FROM jsonb_array_elements(p_plan->'attribute_rows')
      );
    INSERT INTO catalogos.product_attributes (
      product_id, attribute_definition_id, value_text, value_number, value_boolean
    )
    SELECT
      v_product_id,
      (value->>'attribute_definition_id')::uuid,
      NULLIF(value->>'value_text', ''),
      CASE WHEN value->>'value_number' IS NULL OR value->>'value_number' = '' THEN NULL ELSE (value->>'value_number')::numeric END,
      CASE WHEN value ? 'value_boolean' AND value->>'value_boolean' IS NOT NULL AND value->>'value_boolean' <> ''
        THEN (value->>'value_boolean')::boolean ELSE NULL END
    FROM jsonb_array_elements(p_plan->'attribute_rows');
  END IF;

  SELECT COALESCE(array_agg(value), ARRAY[]::text[])
  INTO v_multi
  FROM jsonb_array_elements_text(COALESCE(p_plan->'multi_select_keys', '[]'::jsonb));

  FOR v_key, v_values IN
    SELECT d.attribute_key, jsonb_agg(to_jsonb(COALESCE(pa.value_text, pa.value_number::text, pa.value_boolean::text)))
    FROM catalogos.product_attributes pa
    JOIN catalogos.attribute_definitions d ON d.id = pa.attribute_definition_id
    WHERE pa.product_id = v_product_id
    GROUP BY d.attribute_key
  LOOP
    IF v_key = ANY(v_multi) THEN
      v_facet := v_facet || jsonb_build_object(v_key, v_values);
    ELSE
      v_facet := v_facet || jsonb_build_object(v_key, v_values->0);
    END IF;
  END LOOP;

  SELECT COALESCE(metadata, '{}'::jsonb) INTO v_meta
  FROM catalog_v2.catalog_products
  WHERE id = v_product_id;
  v_meta := v_meta || COALESCE(p_plan->'metadata_patch', '{}'::jsonb) || jsonb_build_object('facet_attributes', v_facet);

  UPDATE catalog_v2.catalog_products
  SET metadata = v_meta, updated_at = now()
  WHERE id = v_product_id;

  PERFORM catalogos.publish_assert_stage(v_fail, 'offer');

  INSERT INTO catalogos.supplier_offers (
    supplier_id, product_id, supplier_sku, cost, raw_id, normalized_id, is_active, units_per_case,
    currency_code, cost_basis, pack_qty, normalized_unit_cost_minor, normalized_unit_uom,
    normalization_confidence, normalization_notes, catalog_variant_id,
    cost_source_type, cost_source_reference, cost_updated_at, cost_updated_by
  ) VALUES (
    (p_plan->>'supplier_id')::uuid,
    v_product_id,
    p_plan->>'supplier_sku',
    (p_plan->>'cost')::numeric,
    NULLIF(p_plan->>'raw_id', '')::uuid,
    NULLIF(p_plan->>'normalized_id', '')::uuid,
    true,
    CASE WHEN p_plan->>'units_per_case' IS NULL OR p_plan->>'units_per_case' = '' THEN NULL ELSE (p_plan->>'units_per_case')::numeric END,
    COALESCE(NULLIF(p_plan->>'currency_code', ''), 'USD'),
    COALESCE(NULLIF(p_plan->>'cost_basis', ''), 'per_case'),
    CASE WHEN p_plan->>'pack_qty' IS NULL OR p_plan->>'pack_qty' = '' THEN NULL ELSE (p_plan->>'pack_qty')::numeric END,
    CASE WHEN p_plan->>'normalized_unit_cost_minor' IS NULL OR p_plan->>'normalized_unit_cost_minor' = '' THEN NULL ELSE (p_plan->>'normalized_unit_cost_minor')::bigint END,
    NULLIF(p_plan->>'normalized_unit_uom', ''),
    NULLIF(p_plan->>'normalization_confidence', ''),
    COALESCE(p_plan->'normalization_notes', '[]'::jsonb),
    v_variant_id,
    NULLIF(p_plan->>'cost_source_type', ''),
    NULLIF(p_plan->>'cost_source_reference', ''),
    CASE WHEN p_plan->>'cost_updated_at' IS NULL OR p_plan->>'cost_updated_at' = '' THEN NULL ELSE (p_plan->>'cost_updated_at')::timestamptz END,
    NULLIF(p_plan->>'cost_updated_by', '')
  )
  ON CONFLICT (supplier_id, product_id, supplier_sku) DO UPDATE SET
    cost = EXCLUDED.cost,
    raw_id = EXCLUDED.raw_id,
    normalized_id = EXCLUDED.normalized_id,
    is_active = EXCLUDED.is_active,
    units_per_case = EXCLUDED.units_per_case,
    currency_code = EXCLUDED.currency_code,
    cost_basis = EXCLUDED.cost_basis,
    pack_qty = EXCLUDED.pack_qty,
    normalized_unit_cost_minor = EXCLUDED.normalized_unit_cost_minor,
    normalized_unit_uom = EXCLUDED.normalized_unit_uom,
    normalization_confidence = EXCLUDED.normalization_confidence,
    normalization_notes = EXCLUDED.normalization_notes,
    catalog_variant_id = EXCLUDED.catalog_variant_id,
    cost_source_type = EXCLUDED.cost_source_type,
    cost_source_reference = EXCLUDED.cost_source_reference,
    cost_updated_at = EXCLUDED.cost_updated_at,
    cost_updated_by = EXCLUDED.cost_updated_by;

  PERFORM catalogos.publish_assert_stage(v_fail, 'sellable');

  INSERT INTO gc_commerce.sellable_products (
    sku, display_name, catalog_product_id, currency_code,
    list_price_minor, bulk_price_minor, unit_cost_minor, is_active, updated_at
  ) VALUES (
    p_plan->>'sellable_sku',
    COALESCE(NULLIF(p_plan->>'sellable_name', ''), 'Product'),
    v_product_id,
    'USD',
    NULL,
    NULL,
    CASE WHEN p_plan->>'unit_cost_minor' IS NULL OR p_plan->>'unit_cost_minor' = '' THEN NULL ELSE (p_plan->>'unit_cost_minor')::bigint END,
    true,
    now()
  )
  ON CONFLICT (sku) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    catalog_product_id = EXCLUDED.catalog_product_id,
    list_price_minor = NULL,
    bulk_price_minor = NULL,
    unit_cost_minor = EXCLUDED.unit_cost_minor,
    is_active = true,
    updated_at = now();

  UPDATE catalog_v2.catalog_products
  SET status = 'active', updated_at = now()
  WHERE id = v_product_id;

  PERFORM catalogos.publish_assert_stage(v_fail, 'event');

  INSERT INTO catalogos.publish_events (normalized_id, product_id, published_by)
  VALUES ((p_plan->>'normalized_id')::uuid, v_product_id, NULLIF(p_plan->>'published_by', ''));

  UPDATE catalogos.supplier_products_normalized
  SET search_publish_status = 'published_synced', updated_at = now()
  WHERE id = (p_plan->>'normalized_id')::uuid;

  IF to_regclass('catalogos.catalog_sync_item_results') IS NOT NULL THEN
    BEGIN
      UPDATE catalogos.catalog_sync_item_results
      SET lifecycle_status = 'published',
          lifecycle_updated_at = now(),
          published_product_id = v_product_id
      WHERE promoted_normalized_id = (p_plan->>'normalized_id')::uuid;
    EXCEPTION
      WHEN undefined_column OR undefined_table THEN
        NULL;
    END;
  END IF;

  RETURN v_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION catalogos.publish_staged_rows_atomic(p_plans jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos, catalog_v2, gc_commerce, public
AS $$
DECLARE
  v_plan jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_id uuid;
BEGIN
  IF jsonb_typeof(p_plans) = 'array' THEN
    FOR v_plan IN SELECT value FROM jsonb_array_elements(p_plans) LOOP
      v_id := catalogos.publish_one_staged_row(v_plan);
      v_ids := v_ids || jsonb_build_array(v_id);
    END LOOP;
  ELSE
    v_id := catalogos.publish_one_staged_row(p_plans);
    v_ids := jsonb_build_array(v_id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'product_ids', v_ids);
END;
$$;

REVOKE ALL ON FUNCTION catalogos.publish_assert_stage(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION catalogos.publish_one_staged_row(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION catalogos.publish_staged_rows_atomic(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalogos.publish_assert_stage(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION catalogos.publish_one_staged_row(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION catalogos.publish_staged_rows_atomic(jsonb) TO service_role;

COMMENT ON FUNCTION catalogos.publish_staged_rows_atomic(jsonb) IS
  'Atomic CatalogOS publish. Catalog parent, variants, offers, sellable_products, and staging status commit together or not at all. Does not write sell_price or approve a storefront listing.';
