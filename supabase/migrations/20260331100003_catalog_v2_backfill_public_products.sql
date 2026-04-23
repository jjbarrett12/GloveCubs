-- =============================================================================
-- Catalog v2 — idempotent backfill from public.products → catalog_v2
-- =============================================================================
-- Does NOT drop or truncate public.products. Re-runnable: skips rows already
-- linked via catalog_products.legacy_public_product_id.
--
-- Run after:
--   20260331100001_catalog_v2_additive_schema.sql
--   20260331100002_catalog_v2_legacy_migration_prereqs.sql
--
-- Execute manually after deploy (or uncomment the final SELECT):
--   SELECT catalog_v2.backfill_legacy_public_products();
-- =============================================================================

CREATE OR REPLACE FUNCTION catalog_v2.backfill_legacy_public_products()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_type_id UUID;
  v_supplier_id UUID;
  r_product RECORD;
  r_size TEXT;
  v_cp_id UUID;
  v_cv_id UUID;
  v_sp_id UUID;
  v_slug TEXT;
  v_base_sku TEXT;
  v_sizes TEXT[];
  v_sort INT;
  v_variant_sku TEXT;
  v_ext_id TEXT;
  v_qty INT;
  v_def_material UUID;
  v_def_color UUID;
  v_def_size UUID;
  v_def_thickness UUID;
  v_def_powder UUID;
  v_def_grade UUID;
  v_def_category UUID;
  v_def_subcategory UUID;
  n_inserted_cp INT := 0;
  n_inserted_cv INT := 0;
BEGIN
  SELECT id INTO v_type_id FROM catalog_v2.catalog_product_types WHERE code = 'legacy_glove' LIMIT 1;
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'catalog_v2: legacy_glove product type missing; run 20260331100002 migration';
  END IF;

  SELECT id INTO v_supplier_id FROM catalogos.suppliers WHERE slug = 'glovecubs-legacy-catalog' LIMIT 1;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'catalog_v2: glovecubs-legacy-catalog supplier missing; run 20260331100002 migration';
  END IF;

  SELECT id INTO v_def_material FROM catalog_v2.catalog_attribute_definitions
    WHERE product_type_id = v_type_id AND attribute_key = 'material';
  SELECT id INTO v_def_color FROM catalog_v2.catalog_attribute_definitions
    WHERE product_type_id = v_type_id AND attribute_key = 'color';
  SELECT id INTO v_def_size FROM catalog_v2.catalog_attribute_definitions
    WHERE product_type_id = v_type_id AND attribute_key = 'size';
  SELECT id INTO v_def_thickness FROM catalog_v2.catalog_attribute_definitions
    WHERE product_type_id = v_type_id AND attribute_key = 'thickness';
  SELECT id INTO v_def_powder FROM catalog_v2.catalog_attribute_definitions
    WHERE product_type_id = v_type_id AND attribute_key = 'powder';
  SELECT id INTO v_def_grade FROM catalog_v2.catalog_attribute_definitions
    WHERE product_type_id = v_type_id AND attribute_key = 'grade';
  SELECT id INTO v_def_category FROM catalog_v2.catalog_attribute_definitions
    WHERE product_type_id = v_type_id AND attribute_key = 'category';
  SELECT id INTO v_def_subcategory FROM catalog_v2.catalog_attribute_definitions
    WHERE product_type_id = v_type_id AND attribute_key = 'subcategory';

  FOR r_product IN
    SELECT p.*
    FROM public.products p
    WHERE NOT EXISTS (
      SELECT 1 FROM catalog_v2.catalog_products cp
      WHERE cp.legacy_public_product_id = p.id
    )
  LOOP
    v_slug := COALESCE(NULLIF(trim(both from r_product.slug), ''), 'legacy-' || r_product.id::TEXT);
    IF EXISTS (SELECT 1 FROM catalog_v2.catalog_products WHERE slug = v_slug AND legacy_public_product_id IS DISTINCT FROM r_product.id) THEN
      v_slug := v_slug || '-' || r_product.id::TEXT;
    END IF;

    v_base_sku := COALESCE(NULLIF(trim(both from r_product.sku), ''), 'P-' || r_product.id::TEXT);

    INSERT INTO catalog_v2.catalog_products (
      product_type_id,
      manufacturer_id,
      slug,
      internal_sku,
      name,
      description,
      status,
      legacy_public_product_id,
      metadata
    ) VALUES (
      v_type_id,
      r_product.manufacturer_id,
      v_slug,
      v_base_sku,
      COALESCE(r_product.name, 'Product ' || r_product.id::TEXT),
      r_product.description,
      CASE WHEN COALESCE(r_product.in_stock, 1) = 0 THEN 'draft' ELSE 'active' END,
      r_product.id,
      jsonb_build_object(
        'migration_source', 'public.products',
        'migrated_at', now(),
        'legacy_brand', r_product.brand,
        'legacy_retail_price', r_product.price,
        'legacy_bulk_price', r_product.bulk_price,
        'legacy_in_stock', r_product.in_stock,
        'legacy_featured', r_product.featured,
        'legacy_use_case', r_product.use_case,
        'legacy_certifications', r_product.certifications,
        'legacy_texture', r_product.texture,
        'legacy_cuff_style', r_product.cuff_style,
        'legacy_sterility', r_product.sterility,
        'legacy_video_url', r_product.video_url,
        'legacy_industry_tags', COALESCE(r_product.industry_tags, '[]'::jsonb),
        'legacy_pack_qty', r_product.pack_qty,
        'legacy_case_qty', r_product.case_qty,
        'legacy_attributes_snapshot', COALESCE(r_product.attributes, '{}'::jsonb)
      )
    )
    RETURNING id INTO v_cp_id;

    n_inserted_cp := n_inserted_cp + 1;

    -- Sizes: split comma list; empty => single implicit variant
    IF r_product.sizes IS NOT NULL AND trim(both from r_product.sizes) <> '' THEN
      v_sizes := string_to_array(r_product.sizes, ',');
    ELSE
      v_sizes := ARRAY[NULL::TEXT];
    END IF;

    SELECT COALESCE(quantity_on_hand, 0) INTO v_qty FROM public.inventory i WHERE i.product_id = r_product.id LIMIT 1;
    IF v_qty IS NULL THEN
      v_qty := 0;
    END IF;

    v_sort := 0;
    FOREACH r_size IN ARRAY v_sizes
    LOOP
      v_sp_id := NULL;
      v_sort := v_sort + 1;
      v_variant_sku := v_base_sku || CASE
        WHEN r_size IS NOT NULL AND trim(both from r_size) <> '' THEN '-' || regexp_replace(trim(both from r_size), '\s+', '-', 'g')
        ELSE ''
      END;

      -- Avoid SKU collision (re-run / duplicates)
      IF EXISTS (SELECT 1 FROM catalog_v2.catalog_variants WHERE variant_sku = v_variant_sku) THEN
        v_variant_sku := v_variant_sku || '-L' || r_product.id::TEXT;
      END IF;

      INSERT INTO catalog_v2.catalog_variants (
        catalog_product_id,
        variant_sku,
        sort_order,
        is_active,
        attribute_signature,
        metadata
      ) VALUES (
        v_cp_id,
        v_variant_sku,
        v_sort,
        COALESCE(r_product.in_stock, 1) <> 0,
        'legacy:' || r_product.id::TEXT || ':' || COALESCE(trim(both from r_size), 'BASE'),
        jsonb_build_object('migration_source', 'public.products', 'legacy_product_id', r_product.id)
      )
      RETURNING id INTO v_cv_id;

      n_inserted_cv := n_inserted_cv + 1;

      -- Attribute values (product-level attrs copied onto each variant for filter parity)
      IF v_def_material IS NOT NULL AND r_product.material IS NOT NULL AND trim(both from r_product.material) <> '' THEN
        INSERT INTO catalog_v2.catalog_variant_attribute_values (catalog_variant_id, attribute_definition_id, value_text)
        VALUES (v_cv_id, v_def_material, trim(both from r_product.material))
        ON CONFLICT (catalog_variant_id, attribute_definition_id) DO NOTHING;
      END IF;
      IF v_def_color IS NOT NULL AND r_product.color IS NOT NULL AND trim(both from r_product.color) <> '' THEN
        INSERT INTO catalog_v2.catalog_variant_attribute_values (catalog_variant_id, attribute_definition_id, value_text)
        VALUES (v_cv_id, v_def_color, trim(both from r_product.color))
        ON CONFLICT (catalog_variant_id, attribute_definition_id) DO NOTHING;
      END IF;
      IF v_def_size IS NOT NULL AND r_size IS NOT NULL AND trim(both from r_size) <> '' THEN
        INSERT INTO catalog_v2.catalog_variant_attribute_values (catalog_variant_id, attribute_definition_id, value_text)
        VALUES (v_cv_id, v_def_size, trim(both from r_size))
        ON CONFLICT (catalog_variant_id, attribute_definition_id) DO NOTHING;
      END IF;
      IF v_def_thickness IS NOT NULL AND r_product.thickness IS NOT NULL AND trim(both from r_product.thickness::TEXT) <> '' THEN
        INSERT INTO catalog_v2.catalog_variant_attribute_values (catalog_variant_id, attribute_definition_id, value_text)
        VALUES (v_cv_id, v_def_thickness, trim(both from r_product.thickness::TEXT))
        ON CONFLICT (catalog_variant_id, attribute_definition_id) DO NOTHING;
      END IF;
      IF v_def_powder IS NOT NULL AND r_product.powder IS NOT NULL AND trim(both from r_product.powder) <> '' THEN
        INSERT INTO catalog_v2.catalog_variant_attribute_values (catalog_variant_id, attribute_definition_id, value_text)
        VALUES (v_cv_id, v_def_powder, trim(both from r_product.powder))
        ON CONFLICT (catalog_variant_id, attribute_definition_id) DO NOTHING;
      END IF;
      IF v_def_grade IS NOT NULL AND r_product.grade IS NOT NULL AND trim(both from r_product.grade) <> '' THEN
        INSERT INTO catalog_v2.catalog_variant_attribute_values (catalog_variant_id, attribute_definition_id, value_text)
        VALUES (v_cv_id, v_def_grade, trim(both from r_product.grade))
        ON CONFLICT (catalog_variant_id, attribute_definition_id) DO NOTHING;
      END IF;
      IF v_def_category IS NOT NULL AND r_product.category IS NOT NULL AND trim(both from r_product.category) <> '' THEN
        INSERT INTO catalog_v2.catalog_variant_attribute_values (catalog_variant_id, attribute_definition_id, value_text)
        VALUES (v_cv_id, v_def_category, trim(both from r_product.category))
        ON CONFLICT (catalog_variant_id, attribute_definition_id) DO NOTHING;
      END IF;
      IF v_def_subcategory IS NOT NULL AND r_product.subcategory IS NOT NULL AND trim(both from r_product.subcategory) <> '' THEN
        INSERT INTO catalog_v2.catalog_variant_attribute_values (catalog_variant_id, attribute_definition_id, value_text)
        VALUES (v_cv_id, v_def_subcategory, trim(both from r_product.subcategory))
        ON CONFLICT (catalog_variant_id, attribute_definition_id) DO NOTHING;
      END IF;

      -- Images: primary URL on product; extras in images[]
      IF v_sort = 1 THEN
        IF r_product.image_url IS NOT NULL AND trim(both from r_product.image_url) <> ''
           AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_product_images i WHERE i.catalog_product_id = v_cp_id AND i.url = trim(both from r_product.image_url)) THEN
          INSERT INTO catalog_v2.catalog_product_images (catalog_product_id, url, sort_order, is_primary)
          VALUES (v_cp_id, trim(both from r_product.image_url), 0, true);
        END IF;
        IF r_product.images IS NOT NULL AND jsonb_typeof(r_product.images) = 'array' THEN
          INSERT INTO catalog_v2.catalog_product_images (catalog_product_id, url, sort_order, is_primary)
          SELECT v_cp_id, trim(both from elem), ord::INT, false
          FROM jsonb_array_elements_text(r_product.images) WITH ORDINALITY AS t(elem, ord)
          WHERE trim(both from elem) <> ''
            AND trim(both from elem) IS DISTINCT FROM trim(both from r_product.image_url)
            AND NOT EXISTS (SELECT 1 FROM catalog_v2.catalog_product_images i WHERE i.catalog_product_id = v_cp_id AND i.url = trim(both from elem));
        END IF;
      END IF;

      v_ext_id := 'legacy:' || r_product.id::TEXT || ':' || COALESCE(nullif(trim(both from r_size), ''), 'BASE');

      INSERT INTO catalog_v2.supplier_products (
        supplier_id,
        external_id,
        supplier_sku,
        name,
        brand_text,
        raw_attributes,
        is_active
      )
      SELECT
        v_supplier_id,
        v_ext_id,
        v_variant_sku,
        r_product.name,
        r_product.brand,
        jsonb_build_object(
          'legacy_product_id', r_product.id,
          'legacy_cost', r_product.cost,
          'legacy_price', r_product.price,
          'legacy_bulk_price', r_product.bulk_price
        ),
        true
      WHERE NOT EXISTS (
        SELECT 1 FROM catalog_v2.supplier_products sp
        WHERE sp.supplier_id = v_supplier_id AND sp.external_id = v_ext_id
      )
      RETURNING id INTO v_sp_id;

      IF v_sp_id IS NULL THEN
        SELECT id INTO v_sp_id FROM catalog_v2.supplier_products
        WHERE supplier_id = v_supplier_id AND external_id = v_ext_id;
      END IF;

      INSERT INTO catalog_v2.catalog_supplier_product_map (supplier_product_id, catalog_variant_id, match_method, match_confidence)
      VALUES (v_sp_id, v_cv_id, 'legacy_backfill', 1.0)
      ON CONFLICT (supplier_product_id) DO UPDATE SET
        catalog_variant_id = EXCLUDED.catalog_variant_id,
        match_method = EXCLUDED.match_method,
        match_confidence = EXCLUDED.match_confidence;

      -- Cost → supplier_offers (retail/bulk in metadata; B2B margins remain on customer_manufacturer_pricing by manufacturer_id)
      IF r_product.cost IS NOT NULL AND r_product.cost > 0
         AND NOT EXISTS (
           SELECT 1 FROM catalog_v2.supplier_offers o
           WHERE o.supplier_product_id = v_sp_id
             AND (o.metadata->>'migration_source') = 'legacy_public_products'
         ) THEN
        INSERT INTO catalog_v2.supplier_offers (
          supplier_product_id,
          unit_cost,
          currency,
          effective_from,
          is_active,
          metadata
        ) VALUES (
          v_sp_id,
          r_product.cost,
          'USD',
          CURRENT_DATE,
          true,
          jsonb_build_object(
            'migration_source', 'legacy_public_products',
            'legacy_retail_price', r_product.price,
            'legacy_bulk_price', r_product.bulk_price
          )
        );
      END IF;

      -- Inventory: public.inventory is per product_id — assign full QOH to first variant only (see docs)
      INSERT INTO catalog_v2.variant_inventory (catalog_variant_id, location_code, quantity_on_hand, quantity_reserved)
      VALUES (
        v_cv_id,
        'default',
        CASE WHEN v_sort = 1 THEN GREATEST(v_qty, 0) ELSE 0 END,
        0
      )
      ON CONFLICT (catalog_variant_id, location_code) DO UPDATE SET
        quantity_on_hand = EXCLUDED.quantity_on_hand,
        updated_at = now();

      INSERT INTO catalog_v2.catalog_publish_state (catalog_variant_id, channel, is_published, first_published_at, last_published_at)
      VALUES (
        v_cv_id,
        'storefront',
        COALESCE(r_product.in_stock, 1) <> 0,
        CASE WHEN COALESCE(r_product.in_stock, 1) <> 0 THEN now() ELSE NULL END,
        CASE WHEN COALESCE(r_product.in_stock, 1) <> 0 THEN now() ELSE NULL END
      )
      ON CONFLICT (catalog_variant_id, channel) DO UPDATE SET
        is_published = EXCLUDED.is_published,
        last_published_at = CASE WHEN EXCLUDED.is_published THEN now() ELSE catalog_v2.catalog_publish_state.last_published_at END;

    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'catalog_products_inserted', n_inserted_cp,
    'catalog_variants_inserted', n_inserted_cv
  );
END;
$$;

COMMENT ON FUNCTION catalog_v2.backfill_legacy_public_products IS 'Idempotent: copies unmigrated public.products rows into catalog_v2 (parents, variants, attrs, images, synthetic supplier offers, inventory on first variant).';

-- Run backfill explicitly when ready (idempotent):
--   supabase/scripts/run_catalog_v2_legacy_backfill.sql
-- or: SELECT catalog_v2.backfill_legacy_public_products();
