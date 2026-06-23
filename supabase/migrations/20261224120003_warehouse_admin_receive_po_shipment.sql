CREATE OR REPLACE FUNCTION public.admin_receive_purchase_order_shipment_atomic(
  p_po_id bigint,
  p_operator_user_id uuid,
  p_lines jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_receipt_notes text DEFAULT NULL,
  p_allow_overage boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, catalog_v2
AS $$
DECLARE
  po_row public.purchase_orders%ROWTYPE;
  req_line jsonb;
  po_line jsonb;
  v_variant_id uuid;
  v_qty int;
  v_damaged int;
  v_bin text;
  v_line_notes text;
  v_ordered int;
  v_already int;
  v_new_total int;
  v_loc text;
  v_inv catalog_v2.variant_inventory%ROWTYPE;
  v_on_hand int;
  v_incoming int;
  v_bal int;
  v_received jsonb;
  v_receipt_lines jsonb := '[]'::jsonb;
  v_all_complete boolean := true;
  v_key text;
  v_expected jsonb := '{}'::jsonb;
  v_cumulative jsonb;
  v_elem jsonb;
  v_existing_receipt bigint;
  v_line_idx int := 0;
BEGIN
  IF p_po_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_NOT_FOUND', 'error', 'Purchase order not found');
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_LINES_REQUIRED', 'error', 'lines required');
  END IF;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT id INTO v_existing_receipt FROM public.purchase_order_receipts
    WHERE purchase_order_id = p_po_id AND idempotency_key = btrim(p_idempotency_key);
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'po_id', p_po_id, 'duplicate', true, 'receipt_id', v_existing_receipt);
    END IF;
  END IF;

  SELECT * INTO po_row FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_NOT_FOUND', 'error', 'Purchase order not found');
  END IF;

  IF po_row.purchase_order_type <> 'inbound_stock' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PO_INVALID_TYPE',
      'error', 'Only inbound_stock purchase orders may receive warehouse inventory'
    );
  END IF;

  IF po_row.status = 'received' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_ALREADY_RECEIVED', 'error', 'PO already fully received');
  END IF;

  IF po_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_INVALID_STATUS', 'error', 'Cancelled PO cannot be received');
  END IF;

  IF po_row.status NOT IN ('draft', 'sent', 'partially_received') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_INVALID_STATUS', 'error', format('Status %s not eligible', po_row.status));
  END IF;

  FOR po_line IN SELECT value FROM jsonb_array_elements(COALESCE(po_row.lines, '[]'::jsonb)) AS t(value)
  LOOP
    v_variant_id := catalog_v2._po_line_variant_uuid(po_line);
    IF v_variant_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'PO_LINES_NEED_SKU_ASSIGNMENT',
        'error', format('PO line %s needs SKU assignment before warehouse receipt', v_line_idx)
      );
    END IF;
    v_ordered := GREATEST(COALESCE(NULLIF(TRIM(po_line->>'quantity'), '')::int, 0), 0);
    IF v_ordered <= 0 THEN
      v_line_idx := v_line_idx + 1;
      CONTINUE;
    END IF;
    v_key := v_variant_id::text;
    v_expected := jsonb_set(v_expected, ARRAY[v_key], to_jsonb(COALESCE((v_expected->>v_key)::int, 0) + v_ordered), true);
    v_line_idx := v_line_idx + 1;
  END LOOP;

  IF v_expected = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_LINES_REQUIRED', 'error', 'No receivable lines');
  END IF;

  v_received := COALESCE(po_row.received_lines, '[]'::jsonb);

  FOR req_line IN SELECT value FROM jsonb_array_elements(p_lines) AS t(value)
    ORDER BY catalog_v2._po_line_variant_uuid(value)::text
  LOOP
    v_variant_id := catalog_v2._po_line_variant_uuid(req_line);
    IF v_variant_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PO_LINE_VARIANT_REQUIRED', 'error', 'Each receive line needs catalog_variant_id');
    END IF;

    v_qty := GREATEST(COALESCE(NULLIF(TRIM(req_line->>'quantity_received'), '')::int, 0), 0);
    v_damaged := GREATEST(COALESCE(NULLIF(TRIM(req_line->>'quantity_damaged'), '')::int, 0), 0);
    IF v_qty <= 0 AND v_damaged <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PO_LINES_MISMATCH', 'error', 'quantity_received or quantity_damaged required');
    END IF;

    v_key := v_variant_id::text;
    IF NOT v_expected ? v_key THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PO_LINES_MISMATCH', 'error', format('Variant %s not on PO', v_variant_id));
    END IF;

    v_ordered := (v_expected->>v_key)::int;
    v_already := 0;
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_received) AS t(value)
    LOOP
      IF catalog_v2._po_line_variant_uuid(v_elem) = v_variant_id THEN
        v_already := v_already + GREATEST(COALESCE(NULLIF(TRIM(v_elem->>'quantity_received'), '')::int, 0), 0);
      END IF;
    END LOOP;

    IF v_already + v_qty > v_ordered AND NOT p_allow_overage THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PO_OVER_RECEIPT', 'error', 'Receive exceeds ordered case quantity');
    END IF;

    SELECT COALESCE(cv.default_location_code, 'default'), cv.default_bin_location
    INTO v_loc, v_bin FROM catalog_v2.catalog_variants cv WHERE cv.id = v_variant_id;

    v_bin := COALESCE(NULLIF(TRIM(req_line->>'bin_location'), ''), v_bin);
    v_line_notes := NULLIF(TRIM(req_line->>'notes'), '');

    IF v_qty > 0 THEN
      INSERT INTO catalog_v2.variant_inventory (
        catalog_variant_id, location_code, quantity_on_hand, quantity_reserved,
        incoming_quantity, reorder_point, bin_location, quantity_uom
      ) VALUES (v_variant_id, COALESCE(v_loc, 'default'), 0, 0, 0, 0, v_bin, 'case')
      ON CONFLICT (catalog_variant_id, location_code) DO NOTHING;

      SELECT * INTO v_inv FROM catalog_v2.variant_inventory vi
      WHERE vi.catalog_variant_id = v_variant_id AND vi.location_code = COALESCE(v_loc, 'default')
      FOR UPDATE;

      v_on_hand := COALESCE(v_inv.quantity_on_hand, 0) + v_qty;
      v_incoming := GREATEST(COALESCE(v_inv.incoming_quantity, 0) - v_qty, 0);

      UPDATE catalog_v2.variant_inventory vi SET
        quantity_on_hand = v_on_hand, incoming_quantity = v_incoming,
        bin_location = COALESCE(v_bin, vi.bin_location), updated_at = now()
      WHERE vi.catalog_variant_id = v_variant_id AND vi.location_code = COALESCE(v_loc, 'default');

      SELECT quantity_on_hand INTO v_bal FROM catalog_v2.variant_inventory vi
      WHERE vi.catalog_variant_id = v_variant_id AND vi.location_code = COALESCE(v_loc, 'default');

      INSERT INTO catalog_v2.variant_stock_history (
        catalog_variant_id, location_code, delta, type, reference_type, reference_id,
        notes, user_id, balance_after, metadata
      ) VALUES (
        v_variant_id, COALESCE(v_loc, 'default'), v_qty, 'purchase_receipt', 'purchase_order', p_po_id,
        COALESCE(v_line_notes, format('PO #%s case receipt', COALESCE(po_row.po_number, p_po_id::text))),
        p_operator_user_id, COALESCE(v_bal, 0),
        jsonb_build_object('quantity_damaged', v_damaged, 'quantity_uom', 'case', 'po_number', po_row.po_number)
      );
    END IF;

    v_received := v_received || jsonb_build_array(jsonb_build_object(
      'catalog_variant_id', v_variant_id::text, 'quantity_received', v_qty, 'quantity_damaged', v_damaged
    ));
    v_receipt_lines := v_receipt_lines || jsonb_build_array(jsonb_build_object(
      'catalog_variant_id', v_variant_id::text, 'quantity_received', v_qty
    ));
  END LOOP;

  v_cumulative := '[]'::jsonb;
  FOR v_key IN SELECT jsonb_object_keys(v_expected)
  LOOP
    v_variant_id := v_key::uuid;
    v_ordered := (v_expected->>v_key)::int;
    v_already := 0;
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_received) AS t(value)
    LOOP
      IF catalog_v2._po_line_variant_uuid(v_elem) = v_variant_id THEN
        v_already := v_already + GREATEST(COALESCE(NULLIF(TRIM(v_elem->>'quantity_received'), '')::int, 0), 0);
      END IF;
    END LOOP;
    v_cumulative := v_cumulative || jsonb_build_array(jsonb_build_object('catalog_variant_id', v_key, 'quantity_received', v_already));
    IF v_already < v_ordered THEN v_all_complete := false; END IF;
  END LOOP;

  INSERT INTO public.purchase_order_receipts (purchase_order_id, idempotency_key, operator_user_id, lines, notes)
  VALUES (p_po_id, NULLIF(btrim(p_idempotency_key), ''), p_operator_user_id, v_receipt_lines, p_receipt_notes);

  UPDATE public.purchase_orders SET
    status = CASE WHEN v_all_complete THEN 'received' ELSE 'partially_received' END,
    received_lines = v_cumulative,
    received_at = CASE WHEN v_all_complete THEN now() ELSE received_at END,
    received_by_user_id = CASE WHEN v_all_complete THEN p_operator_user_id ELSE received_by_user_id END,
    updated_at = now()
  WHERE id = p_po_id;

  RETURN jsonb_build_object(
    'ok', true, 'po_id', p_po_id,
    'status', CASE WHEN v_all_complete THEN 'received' ELSE 'partially_received' END,
    'receipt_complete', v_all_complete
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'po_id', p_po_id, 'duplicate', true);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_RECEIVE_FAILED', 'error', SQLERRM);
END;
$$;
