COMMENT ON FUNCTION public.reserve_stock_for_order_atomic IS
  'Locks order + inventory rows (FOR UPDATE), reserves qty, writes stock_history, sets inventory_reserved_at. Idempotent.';
