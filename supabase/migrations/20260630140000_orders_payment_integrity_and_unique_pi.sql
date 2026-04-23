-- Replace non-unique partial index with unique partial index (same predicate).
DROP INDEX IF EXISTS public.idx_orders_stripe_payment_intent_id;

-- One PaymentIntent must not attach to two orders; payment mismatch review flags.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_stripe_payment_intent_id
  ON public.orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL AND btrim(stripe_payment_intent_id) <> '';

COMMENT ON INDEX public.uq_orders_stripe_payment_intent_id IS
  'Enforces 1:1 PaymentIntent ↔ order for webhook resolution and fraud prevention.';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_integrity_hold BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_integrity_notes TEXT;

COMMENT ON COLUMN public.orders.payment_integrity_hold IS
  'Set true when Stripe amount/currency does not match order.total; blocks auto paid transition until ops review.';

COMMENT ON COLUMN public.orders.payment_integrity_notes IS
  'JSON or text details for payment mismatch / manual review.';
