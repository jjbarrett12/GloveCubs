-- P0-3: Quote idempotency key and atomic quote+lines creation.

-- 1) Idempotency key: prevent duplicate quote on retry/double-submit
ALTER TABLE catalogos.quote_requests
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_requests_idempotency_key
  ON catalogos.quote_requests (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN catalogos.quote_requests.idempotency_key IS 'Client-provided key for idempotent submit; duplicate key returns existing quote.';

-- 2) Atomic create: quote + line items in one transaction
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
        'unit_price', NULL
      )
    );
  END LOOP;

  RETURN QUERY SELECT v_id, v_ref;
END;
$$;

COMMENT ON FUNCTION catalogos.create_quote_with_lines IS 'P0: Atomic quote + line items; idempotent when idempotency_key provided.';
