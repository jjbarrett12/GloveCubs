-- =============================================================================
-- Admin PO receive hardening: operator metadata + atomic full receive RPC.
-- Full receive only (UI contract). Partial received_lines history rejected.
-- =============================================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_by_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.purchase_orders.received_at IS
  'Timestamp when PO was fully received into inventory (admin receive workflow).';
COMMENT ON COLUMN public.purchase_orders.received_by_user_id IS
  'Auth/public.users UUID of admin operator who received the PO.';
COMMENT ON COLUMN public.purchase_orders.sent_by_user_id IS
  'Auth/public.users UUID of admin operator who sent the PO to vendor.';

CREATE OR REPLACE FUNCTION public._po_line_canonical_uuid(p_line jsonb)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  v_text := NULLIF(TRIM(COALESCE(p_line->>'canonical_product_id', p_line->>'product_id', '')), '');
  IF v_text IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN v_text::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_receive_purchase_order_full_atomic(
  p_po_id bigint,
  p_operator_user_id uuid,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po_row public.purchase_orders%ROWTYPE;
  po_line jsonb;
  req_line jsonb;
  v_canon uuid;
  v_qty int;
  v_ordered int;
  inv_row public.inventory%ROWTYPE;
  v_on_hand int;
  v_incoming int;
  v_bal int;
  v_received jsonb := '[]'::jsonb;
  v_expected jsonb := '{}'::jsonb;
  v_request jsonb := '{}'::jsonb;
  v_key text;
  v_prev_qty numeric;
BEGIN
  IF p_po_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_NOT_FOUND', 'error', 'Purchase order not found');
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PO_LINES_REQUIRED',
      'error', 'lines array required: [{ canonical_product_id (UUID), quantity_received }]'
    );
  END IF;

  SELECT * INTO po_row
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_NOT_FOUND', 'error', 'Purchase order not found');
  END IF;

  IF po_row.status = 'received' OR po_row.received_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PO_ALREADY_RECEIVED',
      'error', 'Purchase order has already been received'
    );
  END IF;

  IF po_row.status NOT IN ('draft', 'sent') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PO_INVALID_STATUS',
      'error', format('Purchase order status %s is not eligible for receive', po_row.status)
    );
  END IF;

  IF COALESCE(jsonb_array_length(po_row.received_lines), 0) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PO_PARTIAL_UNSUPPORTED',
      'error', 'Partial receipts are not supported; this PO already has received_lines history'
    );
  END IF;

  -- Build expected full-receive map from PO lines.
  FOR po_line IN
    SELECT value FROM jsonb_array_elements(COALESCE(po_row.lines, '[]'::jsonb)) AS t(value)
  LOOP
    v_canon := public._po_line_canonical_uuid(po_line);
    IF v_canon IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'PO_LINE_CANONICAL_REQUIRED',
        'error', 'PO receive: each PO line must include canonical_product_id (catalog UUID)'
      );
    END IF;
    v_ordered := GREATEST(COALESCE(NULLIF(TRIM(po_line->>'quantity'), '')::int, 0), 0);
    IF v_ordered <= 0 THEN
      CONTINUE;
    END IF;
    v_key := v_canon::text;
    v_prev_qty := COALESCE((v_expected->>v_key)::numeric, 0);
    v_expected := jsonb_set(
      v_expected,
      ARRAY[v_key],
      to_jsonb((v_prev_qty + v_ordered)::int),
      true
    );
  END LOOP;

  IF v_expected = '{}'::jsonb THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PO_LINES_REQUIRED',
      'error', 'Purchase order has no receivable lines'
    );
  END IF;

  -- Build request map; must match expected exactly (full receive only).
  FOR req_line IN
    SELECT value FROM jsonb_array_elements(p_lines) AS t(value)
  LOOP
    v_canon := public._po_line_canonical_uuid(req_line);
    IF v_canon IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'PO_LINE_CANONICAL_REQUIRED',
        'error', 'PO receive: each line must include canonical_product_id (catalog UUID)'
      );
    END IF;
    v_qty := COALESCE(NULLIF(TRIM(req_line->>'quantity_received'), '')::int, 0);
    IF v_qty <= 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'PO_LINES_MISMATCH',
        'error', 'Each receive line must have a positive quantity_received'
      );
    END IF;
    v_key := v_canon::text;
    v_prev_qty := COALESCE((v_request->>v_key)::numeric, 0);
    v_request := jsonb_set(
      v_request,
      ARRAY[v_key],
      to_jsonb((v_prev_qty + v_qty)::int),
      true
    );
  END LOOP;

  IF v_request IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PO_LINES_MISMATCH',
      'error', 'Full receive only: requested lines must match all PO line quantities exactly'
    );
  END IF;

  -- Apply inventory + stock history atomically.
  FOR req_line IN
    SELECT value FROM jsonb_array_elements(p_lines) AS t(value)
    ORDER BY public._po_line_canonical_uuid(value)::text
  LOOP
    v_canon := public._po_line_canonical_uuid(req_line);
    v_qty := COALESCE(NULLIF(TRIM(req_line->>'quantity_received'), '')::int, 0);

    INSERT INTO public.inventory (
      canonical_product_id,
      quantity_on_hand,
      quantity_reserved,
      incoming_quantity,
      reorder_point
    ) VALUES (
      v_canon,
      0,
      0,
      0,
      0
    )
    ON CONFLICT (canonical_product_id) DO NOTHING;

    SELECT * INTO inv_row
    FROM public.inventory
    WHERE canonical_product_id = v_canon
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'inventory row missing for %', v_canon USING ERRCODE = 'P0001';
    END IF;

    v_on_hand := COALESCE(inv_row.quantity_on_hand, 0) + v_qty;
    v_incoming := GREATEST(COALESCE(inv_row.incoming_quantity, 0) - v_qty, 0);

    UPDATE public.inventory
    SET
      quantity_on_hand = v_on_hand,
      incoming_quantity = v_incoming,
      updated_at = now()
    WHERE canonical_product_id = v_canon;

    SELECT quantity_on_hand INTO v_bal
    FROM public.inventory
    WHERE canonical_product_id = v_canon;

    INSERT INTO public.stock_history (
      delta,
      type,
      reference_type,
      reference_id,
      notes,
      user_id,
      balance_after,
      canonical_product_id
    ) VALUES (
      v_qty,
      'receive',
      'purchase_order',
      p_po_id,
      format('PO #%s', p_po_id),
      p_operator_user_id,
      COALESCE(v_bal, 0),
      v_canon
    );

    v_received := v_received || jsonb_build_array(
      jsonb_build_object(
        'canonical_product_id', v_canon::text,
        'quantity_received', v_qty
      )
    );
  END LOOP;

  UPDATE public.purchase_orders
  SET
    status = 'received',
    received_lines = v_received,
    received_at = now(),
    received_by_user_id = p_operator_user_id,
    updated_at = now()
  WHERE id = p_po_id;

  RETURN jsonb_build_object('ok', true, 'po_id', p_po_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PO_RECEIVE_FAILED',
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.admin_receive_purchase_order_full_atomic IS
  'Locks PO row, validates full receive against PO lines, updates inventory + stock_history once, marks PO received.';

REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) TO service_role;
