-- =============================================================================
-- Backfill catalog_v2.catalog_products.id into:
--   - gc_commerce.order_lines.product_snapshot.catalog_product_id
--   - gc_commerce.carts.items[].canonical_product_id + product_id (+ listing_id)
--
-- Mapping (same as app resolveCatalogV2ProductId):
--   catalogos.products.id + live_product_id -> catalog_v2.catalog_products.id
--   via catalog_v2.catalog_products.legacy_public_product_id = live_product_id
--
-- Idempotent: re-run skips rows already holding catalog_v2 ids; failure log uses
-- NOT EXISTS guard on (phase, legacy_id).
-- =============================================================================

CREATE OR REPLACE FUNCTION gc_map_catalogos_product_to_v2(p_catalogos_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT cp.id
  FROM catalogos.products p
  INNER JOIN catalog_v2.catalog_products cp ON cp.legacy_public_product_id = p.live_product_id
  WHERE p.id = p_catalogos_id
    AND p.live_product_id IS NOT NULL
  LIMIT 1;
$$;

DO $$
DECLARE
  v_order_lines_updated int := 0;
  v_order_lines_fail int := 0;
  v_carts_updated int := 0;
  v_cart_lines_fail int := 0;
  cart_rec RECORD;
  line_rec RECORD;
  elem jsonb;
  canon_t text;
  pid_t text;
  list_t text;
  canon_u uuid;
  pid_u uuid;
  list_u uuid;
  work_u uuid;
  v2_id uuid;
  new_items jsonb;
  changed boolean;
  v_ins int;
BEGIN
  -- ---------------------------------------------------------------------------
  -- 1) order_lines: snapshot catalog_product_id when it is catalogos.products.id
  -- ---------------------------------------------------------------------------
  WITH src AS (
    SELECT
      ol.id,
      NULLIF(TRIM(ol.product_snapshot->>'catalog_product_id'), '')::uuid AS snap_uid
    FROM gc_commerce.order_lines ol
    WHERE ol.product_snapshot ? 'catalog_product_id'
      AND NULLIF(TRIM(ol.product_snapshot->>'catalog_product_id'), '') IS NOT NULL
      AND NULLIF(TRIM(ol.product_snapshot->>'catalog_product_id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  candidates AS (
    SELECT s.id, s.snap_uid, gc_map_catalogos_product_to_v2(s.snap_uid) AS v2_id
    FROM src s
    INNER JOIN catalogos.products p ON p.id = s.snap_uid
    WHERE p.live_product_id IS NOT NULL
  ),
  to_fix AS (
    SELECT c.id, c.snap_uid, c.v2_id
    FROM candidates c
    WHERE c.v2_id IS NOT NULL
      AND c.snap_uid IS DISTINCT FROM c.v2_id
  ),
  upd AS (
    UPDATE gc_commerce.order_lines ol
    SET
      product_snapshot = jsonb_set(
        ol.product_snapshot,
        '{catalog_product_id}',
        to_jsonb(tf.v2_id::text),
        true
      ),
      updated_at = now()
    FROM to_fix tf
    WHERE ol.id = tf.id
    RETURNING ol.id
  )
  SELECT COUNT(*)::int FROM upd INTO v_order_lines_updated;

  -- Failures: snapshot UUID is a catalogos.products row but no v2 mapping
  INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
  SELECT
    'catalog_v2_order_lines_snapshot',
    'warning',
    'gc_commerce.order_lines',
    ol.id::text,
    'product_snapshot.catalog_product_id is catalogos.products.id but could not resolve to catalog_v2 (missing live_product_id or legacy_public_product_id match)',
    jsonb_build_object(
      'order_line_id', ol.id,
      'catalogos_product_id', s.snap_uid,
      'live_product_id', p.live_product_id
    )
  FROM gc_commerce.order_lines ol
  INNER JOIN LATERAL (
    SELECT NULLIF(TRIM(ol.product_snapshot->>'catalog_product_id'), '')::uuid AS snap_uid
  ) s ON true
  INNER JOIN catalogos.products p ON p.id = s.snap_uid
  WHERE s.snap_uid IS NOT NULL
    AND gc_map_catalogos_product_to_v2(s.snap_uid) IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM gc_commerce.backfill_log bl
      WHERE bl.phase = 'catalog_v2_order_lines_snapshot'
        AND bl.legacy_id = ol.id::text
        AND bl.severity = 'warning'
    );

  GET DIAGNOSTICS v_order_lines_fail = ROW_COUNT;

  -- ---------------------------------------------------------------------------
  -- 2) carts: each line — resolve catalogos -> v2 on canonical_product_id / product_id
  -- ---------------------------------------------------------------------------
  FOR cart_rec IN
    SELECT cart_key, items
    FROM gc_commerce.carts
    WHERE jsonb_typeof(items) = 'array'
      AND jsonb_array_length(COALESCE(items, '[]'::jsonb)) > 0
  LOOP
    new_items := '[]'::jsonb;
    changed := false;

    FOR line_rec IN
      SELECT t.elem, t.line_ord
      FROM jsonb_array_elements(COALESCE(cart_rec.items, '[]'::jsonb)) WITH ORDINALITY AS t(elem, line_ord)
    LOOP
      elem := line_rec.elem;
      canon_t := elem->>'canonical_product_id';
      pid_t := elem->>'product_id';
      list_t := elem->>'listing_id';

      canon_u := NULL;
      pid_u := NULL;
      list_u := NULL;

      IF canon_t IS NOT NULL AND NULLIF(TRIM(canon_t), '') IS NOT NULL THEN
        BEGIN
          canon_u := TRIM(canon_t)::uuid;
        EXCEPTION
          WHEN invalid_text_representation THEN canon_u := NULL;
        END;
      END IF;

      IF pid_t IS NOT NULL AND NULLIF(TRIM(pid_t), '') IS NOT NULL THEN
        BEGIN
          pid_u := TRIM(pid_t)::uuid;
        EXCEPTION
          WHEN invalid_text_representation THEN pid_u := NULL;
        END;
      END IF;

      IF list_t IS NOT NULL AND NULLIF(TRIM(list_t), '') IS NOT NULL THEN
        BEGIN
          list_u := TRIM(list_t)::uuid;
        EXCEPTION
          WHEN invalid_text_representation THEN list_u := NULL;
        END;
      END IF;

      IF canon_u IS NOT NULL AND pid_u IS NOT NULL AND canon_u IS DISTINCT FROM pid_u THEN
        INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
        SELECT
          'catalog_v2_cart_items',
          'warning',
          'gc_commerce.carts',
          cart_rec.cart_key || ':' || line_rec.line_ord::text,
          'cart line has mismatched canonical_product_id and product_id; left unchanged',
          jsonb_build_object(
            'cart_key', cart_rec.cart_key,
            'line_index', line_rec.line_ord,
            'canonical_product_id', canon_u,
            'product_id', pid_u
          )
        WHERE NOT EXISTS (
          SELECT 1 FROM gc_commerce.backfill_log bl
          WHERE bl.phase = 'catalog_v2_cart_items'
            AND bl.legacy_id = cart_rec.cart_key || ':' || line_rec.line_ord::text
            AND bl.severity = 'warning'
        );
        GET DIAGNOSTICS v_ins = ROW_COUNT;
        v_cart_lines_fail := v_cart_lines_fail + v_ins;
        new_items := new_items || jsonb_build_array(elem);
        CONTINUE;
      END IF;

      work_u := COALESCE(list_u, canon_u, pid_u);

      IF work_u IS NULL THEN
        new_items := new_items || jsonb_build_array(elem);
        CONTINUE;
      END IF;

      -- Already catalog_v2 parent id
      IF EXISTS (SELECT 1 FROM catalog_v2.catalog_products cp WHERE cp.id = work_u) THEN
        IF (canon_u IS DISTINCT FROM work_u) OR (pid_u IS DISTINCT FROM work_u) THEN
          elem := elem
            || jsonb_build_object('canonical_product_id', work_u::text, 'product_id', work_u::text);
          changed := true;
        END IF;
        new_items := new_items || jsonb_build_array(elem);
        CONTINUE;
      END IF;

      -- catalogos listing id
      IF EXISTS (SELECT 1 FROM catalogos.products p WHERE p.id = work_u) THEN
        v2_id := gc_map_catalogos_product_to_v2(work_u);
        IF v2_id IS NOT NULL AND (canon_u IS DISTINCT FROM v2_id OR pid_u IS DISTINCT FROM v2_id OR list_u IS NULL) THEN
          elem := elem
            || jsonb_build_object(
              'canonical_product_id', v2_id::text,
              'product_id', v2_id::text,
              'listing_id', work_u::text
            );
          changed := true;
        ELSIF v2_id IS NULL THEN
          INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
          SELECT
            'catalog_v2_cart_items',
            'warning',
            'gc_commerce.carts',
            cart_rec.cart_key || ':' || line_rec.line_ord::text,
            'cart line catalogos id could not resolve to catalog_v2',
            jsonb_build_object('cart_key', cart_rec.cart_key, 'line_index', line_rec.line_ord, 'catalogos_product_id', work_u)
          WHERE NOT EXISTS (
            SELECT 1
            FROM gc_commerce.backfill_log bl
            WHERE bl.phase = 'catalog_v2_cart_items'
              AND bl.legacy_id = cart_rec.cart_key || ':' || line_rec.line_ord::text
              AND bl.severity = 'warning'
          );
          GET DIAGNOSTICS v_ins = ROW_COUNT;
          v_cart_lines_fail := v_cart_lines_fail + v_ins;
        END IF;
        new_items := new_items || jsonb_build_array(elem);
        CONTINUE;
      END IF;

      new_items := new_items || jsonb_build_array(elem);
    END LOOP;

    IF changed THEN
      UPDATE gc_commerce.carts c
      SET items = new_items, updated_at = now()
      WHERE c.cart_key = cart_rec.cart_key;
      v_carts_updated := v_carts_updated + 1;
    END IF;
  END LOOP;

  INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
  VALUES (
    'catalog_v2_ids_backfill_summary',
    'info',
    NULL,
    NULL,
    'backfill_catalog_v2_ids_order_lines_carts summary',
    jsonb_build_object(
      'order_lines_updated', v_order_lines_updated,
      'order_lines_failure_log_rows', v_order_lines_fail,
      'carts_updated', v_carts_updated,
      'cart_item_failure_events', v_cart_lines_fail
    )
  );

  RAISE NOTICE 'backfill_catalog_v2_ids: order_lines_updated=%, order_lines_failure_logs=%, carts_updated=%, cart_failure_events=%',
    v_order_lines_updated, v_order_lines_fail, v_carts_updated, v_cart_lines_fail;
END $$;

DROP FUNCTION IF EXISTS gc_map_catalogos_product_to_v2(uuid);

-- -----------------------------------------------------------------------------
-- Post-run diagnostics (run manually in SQL editor)
-- -----------------------------------------------------------------------------
-- Latest summary counts (JSON):
--   SELECT details
--   FROM gc_commerce.backfill_log
--   WHERE phase = 'catalog_v2_ids_backfill_summary'
--   ORDER BY id DESC
--   LIMIT 1;
--
-- All failures from this migration (warnings):
--   SELECT id, phase, legacy_table, legacy_id, message, details, created_at
--   FROM gc_commerce.backfill_log
--   WHERE phase IN ('catalog_v2_order_lines_snapshot', 'catalog_v2_cart_items')
--     AND severity = 'warning'
--   ORDER BY id;
