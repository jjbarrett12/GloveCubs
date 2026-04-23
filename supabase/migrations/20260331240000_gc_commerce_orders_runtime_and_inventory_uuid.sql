-- =============================================================================
-- gc_commerce.orders: checkout / ops columns (parity with legacy public.orders).
-- Status values expanded for Express + Stripe flows.
-- public.gc_*_stock_for_order_atomic: see 20260331240100 (inventory RPCs).
-- (stock_history.reference_id = 0, uuid in notes).
-- gc_commerce.v_company_commercial: commercial snapshot by gc company UUID only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Orders: operational columns
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_integrity_hold BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_integrity_notes TEXT,
  ADD COLUMN IF NOT EXISTS inventory_reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_deducted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_attribution JSONB,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS tax_reason TEXT;

DROP INDEX IF EXISTS uq_gc_orders_stripe_payment_intent_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gc_orders_stripe_payment_intent_id
  ON gc_commerce.orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL AND btrim(stripe_payment_intent_id) <> '';

ALTER TABLE gc_commerce.orders DROP CONSTRAINT IF EXISTS ck_gc_orders_status;
ALTER TABLE gc_commerce.orders ADD CONSTRAINT ck_gc_orders_status CHECK (
  status IN (
    'draft',
    'pending',
    'pending_payment',
    'payment_failed',
    'processing',
    'confirmed',
    'paid',
    'fulfilled',
    'cancelled',
    'refunded',
    'shipped',
    'expired',
    'abandoned'
  )
);

COMMENT ON COLUMN gc_commerce.orders.stripe_payment_intent_id IS 'Stripe PaymentIntent id. Unique when set.';
COMMENT ON COLUMN gc_commerce.orders.payment_integrity_hold IS 'Set when charged amount does not match order totals. Blocks auto paid until ops review.';

-- -----------------------------------------------------------------------------
-- 2) Commercial snapshot by gc company UUID (joins legacy_company_map → public.companies)
-- public.companies net-terms columns are added in 20260703120000. Until then use typed NULLs.
-- Cutover (20260331260000) drops this view in favor of gc_commerce.companies.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_company_commercial AS
SELECT
  m.gc_company_id AS id,
  m.legacy_company_id,
  p.name,
  p.default_gross_margin_percent,
  NULL::TEXT AS net_terms_status,
  NULL::NUMERIC(14, 2) AS credit_limit,
  NULL::NUMERIC(14, 2) AS outstanding_balance,
  NULL::TEXT AS invoice_terms_code,
  NULL::TEXT AS invoice_terms_custom,
  NULL::BOOLEAN AS invoice_orders_allowed,
  NULL::TEXT AS net_terms_internal_notes,
  NULL::TIMESTAMPTZ AS net_terms_reviewed_at,
  NULL::BIGINT AS net_terms_reviewed_by_user_id,
  p.created_at AS legacy_company_created_at,
  p.updated_at AS legacy_company_updated_at
FROM gc_commerce.legacy_company_map m
INNER JOIN public.companies p ON p.id = m.legacy_company_id;

COMMENT ON VIEW gc_commerce.v_company_commercial IS
  'Legacy bridge: public.companies snapshot by gc UUID. Net-terms cols NULL until 20260703120000. Dropped at single-truth cutover.';

GRANT SELECT ON gc_commerce.v_company_commercial TO postgres, service_role;
