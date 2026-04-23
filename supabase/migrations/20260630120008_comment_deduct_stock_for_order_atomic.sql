COMMENT ON FUNCTION public.deduct_stock_for_order_atomic IS
  'Locks order + inventory. Decrements on_hand and reserved. Stock_history deduct. Sets inventory_deducted_at.';
