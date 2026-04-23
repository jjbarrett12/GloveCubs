-- P0-2: Atomic feed commit via single transaction (all-or-nothing).
-- Replaces per-row app-side updates with one RPC that does BEGIN/COMMIT/ROLLBACK.

CREATE OR REPLACE FUNCTION catalogos.commit_feed_upload(
  p_upload_id UUID,
  p_supplier_id UUID,
  p_user_id UUID,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos
AS $$
DECLARE
  r JSONB;
  rec RECORD;
  v_matched_product_id UUID;
  v_sku TEXT;
  v_price NUMERIC;
  v_lead_time_days INT;
  v_existing_id UUID;
  v_created INT := 0;
  v_updated INT := 0;
  v_skipped INT := 0;
  v_committed INT := 0;
BEGIN
  -- 1) Verify upload ownership
  IF NOT EXISTS (
    SELECT 1 FROM catalogos.supplier_feed_uploads
    WHERE id = p_upload_id AND supplier_id = p_supplier_id
  ) THEN
    RAISE EXCEPTION 'Upload not found or access denied';
  END IF;

  -- 2) Process each row in one transaction
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_matched_product_id := (r->'normalized'->>'matched_product_id')::UUID;
    IF v_matched_product_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_sku := COALESCE(r->'extracted'->>'sku', '');
    v_price := (r->'extracted'->>'price')::NUMERIC;
    v_lead_time_days := (r->'extracted'->>'lead_time_days')::INT;

    IF v_price IS NULL OR v_price < 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id INTO v_existing_id
    FROM catalogos.supplier_offers
    WHERE supplier_id = p_supplier_id
      AND product_id = v_matched_product_id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE catalogos.supplier_offers
      SET
        cost = v_price,
        sell_price = v_price,
        lead_time_days = v_lead_time_days,
        supplier_sku = COALESCE(NULLIF(trim(v_sku), ''), supplier_sku),
        is_active = true,
        updated_at = now()
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO catalogos.supplier_offers (
        supplier_id,
        product_id,
        supplier_sku,
        cost,
        sell_price,
        lead_time_days,
        is_active
      ) VALUES (
        p_supplier_id,
        v_matched_product_id,
        COALESCE(NULLIF(trim(v_sku), ''), 'IMPORT-' || v_matched_product_id::TEXT),
        v_price,
        v_price,
        v_lead_time_days,
        true
      );
      v_created := v_created + 1;
    END IF;
  END LOOP;

  v_committed := v_created + v_updated;

  -- 3) Update upload status
  UPDATE catalogos.supplier_feed_uploads
  SET status = 'committed', completed_at = now(), updated_at = now()
  WHERE id = p_upload_id AND supplier_id = p_supplier_id;

  -- 4) Audit log (inside same transaction)
  INSERT INTO catalogos.supplier_audit_log (supplier_id, user_id, action, entity_type, entity_id, changes)
  VALUES (
    p_supplier_id,
    p_user_id,
    'commit_feed_upload',
    'supplier_feed_upload',
    p_upload_id,
    jsonb_build_object(
      'committed', v_committed,
      'created', v_created,
      'updated', v_updated,
      'skipped', v_skipped
    )
  );

  RETURN jsonb_build_object(
    'committed', v_committed,
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped
  );
END;
$$;

COMMENT ON FUNCTION catalogos.commit_feed_upload IS 'P0: Atomic feed commit; all updates and audit in one transaction.';
