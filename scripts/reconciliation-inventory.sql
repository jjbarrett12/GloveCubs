-- =============================================================================
-- GloveCubs — operator reconciliation pack (inventory ↔ orders)
-- Run sections in Supabase SQL Editor or psql. Tune intervals and status lists
-- to match your business rules.
--
-- Monitoring hooks (see server + jobs):
--   - paymentLog / console: inventory.reserve_failed_* , inventory.release_* ,
--     inventory.release_on_admin_abandon_failed , inventory.deduct_failed_admin_ship ,
--     inventory.release_failed_stale_* , Stripe webhook 500 retries if release fails
--     after payment_intent.payment_failed / payment_intent.canceled.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Active orders that should have passed checkout but show no reservation
--    (excludes terminal / abandoned states; widen window if your SLA differs)
-- ---------------------------------------------------------------------------
SELECT o.id,
       o.order_number,
       o.status,
       o.user_id,
       o.created_at,
       o.inventory_reserved_at
FROM public.orders o
WHERE o.status IN ('pending', 'processing', 'pending_payment', 'invoiced')
  AND o.inventory_reserved_at IS NULL
  AND o.created_at < now() - interval '30 minutes'
ORDER BY o.created_at DESC;

-- Stricter: only card/ACH-style flow (was awaiting payment)
SELECT o.id, o.order_number, o.status, o.created_at
FROM public.orders o
WHERE o.status = 'pending_payment'
  AND o.inventory_reserved_at IS NULL
  AND o.created_at < now() - interval '15 minutes'
ORDER BY o.created_at DESC;

-- ---------------------------------------------------------------------------
-- B) Cancelled / failed / expired but inventory still logically held
--    (reserved_at set, never released, never deducted)
-- ---------------------------------------------------------------------------
SELECT o.id,
       o.order_number,
       o.status,
       o.inventory_reserved_at,
       o.inventory_released_at,
       o.inventory_deducted_at,
       o.updated_at
FROM public.orders o
WHERE o.status IN ('cancelled', 'payment_failed', 'expired')
  AND o.inventory_reserved_at IS NOT NULL
  AND o.inventory_released_at IS NULL
  AND o.inventory_deducted_at IS NULL
ORDER BY o.updated_at DESC;

-- ---------------------------------------------------------------------------
-- C) Inventory row integrity (DB CHECKs should prevent negatives; this catches drift)
-- ---------------------------------------------------------------------------
SELECT product_id,
       canonical_product_id,
       quantity_on_hand,
       quantity_reserved,
       quantity_on_hand - quantity_reserved AS available
FROM public.inventory
WHERE quantity_on_hand < 0
   OR quantity_reserved < 0
   OR quantity_reserved > quantity_on_hand
ORDER BY product_id;

-- ---------------------------------------------------------------------------
-- D) “Shipped” (or delivered) but fulfillment deduct never recorded
-- ---------------------------------------------------------------------------
SELECT o.id,
       o.order_number,
       o.status,
       o.inventory_reserved_at,
       o.inventory_deducted_at,
       o.updated_at
FROM public.orders o
WHERE o.status IN ('shipped', 'delivered')
  AND o.inventory_deducted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)
ORDER BY o.updated_at DESC;

-- ---------------------------------------------------------------------------
-- E) Reserved units vs open order demand (by product_id)
--    open_demand = lines on orders still expected to consume stock
--    Tune status list to match when you consider an order “open”.
-- ---------------------------------------------------------------------------
WITH open_demand AS (
  SELECT oi.product_id,
         SUM(GREATEST(COALESCE(oi.quantity, 0), 0))::bigint AS qty_needed
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.status IN ('pending', 'processing', 'pending_payment', 'invoiced')
  GROUP BY oi.product_id
)
SELECT i.product_id,
       i.quantity_on_hand,
       i.quantity_reserved,
       COALESCE(d.qty_needed, 0) AS open_order_demand_units,
       i.quantity_reserved - COALESCE(d.qty_needed, 0) AS reserved_minus_open_demand
FROM public.inventory i
LEFT JOIN open_demand d ON d.product_id = i.product_id
WHERE i.quantity_reserved > 0
  AND i.quantity_reserved > COALESCE(d.qty_needed, 0)
ORDER BY reserved_minus_open_demand DESC;

-- ---------------------------------------------------------------------------
-- F) Reserved with zero open demand (stronger signal than E)
-- ---------------------------------------------------------------------------
WITH open_demand AS (
  SELECT oi.product_id,
         SUM(GREATEST(COALESCE(oi.quantity, 0), 0))::bigint AS qty_needed
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.status IN ('pending', 'processing', 'pending_payment', 'invoiced')
  GROUP BY oi.product_id
)
SELECT i.product_id, i.quantity_on_hand, i.quantity_reserved
FROM public.inventory i
LEFT JOIN open_demand d ON d.product_id = i.product_id
WHERE i.quantity_reserved > 0
  AND COALESCE(d.qty_needed, 0) = 0
ORDER BY i.quantity_reserved DESC;

-- ---------------------------------------------------------------------------
-- G) Orders reserved but no line items (data integrity)
-- ---------------------------------------------------------------------------
SELECT o.id, o.order_number, o.status, o.inventory_reserved_at
FROM public.orders o
WHERE o.inventory_reserved_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id);

-- ---------------------------------------------------------------------------
-- H) stock_history aggregates (investigative — not a full ledger tie-out)
-- ---------------------------------------------------------------------------
SELECT product_id,
       type,
       SUM(delta) AS sum_delta,
       COUNT(*) AS row_count
FROM public.stock_history
WHERE created_at > now() - interval '7 days'
  AND type IN ('reserve', 'release', 'deduct')
GROUP BY product_id, type
ORDER BY product_id, type;

-- ---------------------------------------------------------------------------
-- I) Paid / confirmed (post–pending_payment) but never shipped and not abandoned
--    (possible “should have deducted?” — usually deduct runs at ship; adjust)
-- ---------------------------------------------------------------------------
SELECT o.id, o.order_number, o.status, o.payment_confirmed_at, o.inventory_deducted_at
FROM public.orders o
WHERE o.status IN ('pending', 'processing')
  AND o.payment_confirmed_at IS NOT NULL
  AND o.inventory_reserved_at IS NOT NULL
  AND o.inventory_deducted_at IS NULL
ORDER BY o.created_at DESC
LIMIT 200;
