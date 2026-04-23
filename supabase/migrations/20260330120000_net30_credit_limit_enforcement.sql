-- Atomic credit limit check when opening Net 30 AR (row-locked company balance).
-- Prevents concurrent checkouts from exceeding credit_limit.

CREATE OR REPLACE FUNCTION public.glovecubs_apply_net30_order_ar(
  p_order_id BIGINT,
  p_company_id BIGINT,
  p_amount NUMERIC,
  p_terms_code TEXT,
  p_due_at TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opened TIMESTAMPTZ;
  v_credit_limit NUMERIC;
  v_out NUMERIC;
  v_projected NUMERIC;
  v_avail NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT invoice_ar_opened_at INTO v_opened
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_opened IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  IF p_company_id IS NOT NULL AND p_amount > 0 THEN
    SELECT c.credit_limit, COALESCE(c.outstanding_balance, 0)
    INTO v_credit_limit, v_out
    FROM public.companies c
    WHERE c.id = p_company_id
    FOR UPDATE;

    IF FOUND AND v_credit_limit IS NOT NULL THEN
      v_projected := round(v_out + p_amount, 2);
      v_avail := round(v_credit_limit - v_out, 2);
      IF v_projected > v_credit_limit THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'CREDIT_LIMIT_EXCEEDED',
          'credit_limit', v_credit_limit,
          'outstanding_balance', v_out,
          'order_total', p_amount,
          'projected_outstanding', v_projected,
          'available_credit', GREATEST(0, v_avail)
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.orders SET
    invoice_status = 'unpaid',
    invoice_amount_due = p_amount,
    invoice_amount_paid = 0,
    invoice_due_at = p_due_at,
    invoice_terms_code_applied = NULLIF(trim(COALESCE(p_terms_code, '')), ''),
    invoice_ar_opened_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  IF p_company_id IS NOT NULL AND p_amount > 0 THEN
    UPDATE public.companies SET
      outstanding_balance = round(COALESCE(outstanding_balance, 0) + p_amount, 2),
      updated_at = NOW()
    WHERE id = p_company_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$$;
