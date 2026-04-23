-- Persist explicit catalog UUID on quote line product_snapshot for downstream order conversion / analytics.

CREATE OR REPLACE FUNCTION catalogos.create_quote_with_lines(
  p_idempotency_key TEXT,
  p_company_name TEXT,
  p_contact_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_notes TEXT,
  p_urgency TEXT,
  p_items JSONB
)
RETURNS TABLE (id UUID, reference_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos
AS $$
DECLARE
  v_id UUID;
  v_ref TEXT;
  v_item JSONB;
  v_submitted_at TIMESTAMPTZ := now();
  v_canonical TEXT;
BEGIN
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
    SELECT qr.id, qr.reference_number INTO v_id, v_ref
    FROM catalogos.quote_requests qr
    WHERE qr.idempotency_key = trim(p_idempotency_key)
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_ref;
      RETURN;
    END IF;
  END IF;

  v_ref := 'RFQ-' || upper(substring(md5(v_submitted_at::TEXT || random()::TEXT) from 1 for 8));

  INSERT INTO catalogos.quote_requests (
    reference_number,
    company_name,
    contact_name,
    email,
    phone,
    notes,
    urgency,
    status,
    priority,
    source,
    submitted_at,
    idempotency_key
  ) VALUES (
    v_ref,
    trim(p_company_name),
    trim(p_contact_name),
    trim(lower(p_email)),
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_notes), ''),
    p_urgency,
    'new',
    'normal',
    'storefront',
    v_submitted_at,
    CASE WHEN p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN trim(p_idempotency_key) ELSE NULL END
  )
  RETURNING catalogos.quote_requests.id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_canonical := NULLIF(trim(COALESCE(v_item->>'canonicalProductId', '')), '');
    IF v_canonical IS NULL OR v_canonical = '' THEN
      v_canonical := NULLIF(trim(COALESCE(v_item->>'productId', '')), '');
    END IF;

    INSERT INTO catalogos.quote_line_items (
      quote_request_id,
      product_id,
      quantity,
      notes,
      product_snapshot
    ) VALUES (
      v_id,
      (v_item->>'productId')::UUID,
      GREATEST(1, (v_item->>'quantity')::INT),
      NULLIF(trim(COALESCE(v_item->>'notes', '')), ''),
      jsonb_build_object(
        'name', COALESCE(v_item->>'name', ''),
        'slug', COALESCE(v_item->>'slug', ''),
        'sku', NULL,
        'unit_price', NULL,
        'canonical_product_id', v_canonical
      )
    );
  END LOOP;

  RETURN QUERY SELECT v_id, v_ref;
END;
$$;

COMMENT ON FUNCTION catalogos.create_quote_with_lines IS 'Atomic quote + line items; product_snapshot includes canonical_product_id for commerce alignment.';
