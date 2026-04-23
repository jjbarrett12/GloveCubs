COMMENT ON FUNCTION public.release_stock_for_order_atomic IS
  'Locks order + inventory. Decreases reserved. Stock_history release rows. Sets inventory_released_at.';
