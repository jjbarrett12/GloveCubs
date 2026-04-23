-- POST /api/orders: client Idempotency-Key header deduplication (per user).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

COMMENT ON COLUMN public.orders.idempotency_key IS
  'Optional client Idempotency-Key (HTTP header); unique per user when set. Cleared when order is cancelled after failed inventory reserve so checkout can retry.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_user_id_idempotency_key
  ON public.orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '';
