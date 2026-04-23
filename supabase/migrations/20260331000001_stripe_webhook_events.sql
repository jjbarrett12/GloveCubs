-- Stripe Webhook Events table for idempotency tracking
-- Prevents duplicate processing of webhook events

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'processed',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by event_id
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON stripe_webhook_events(event_id);

-- Index for cleanup of old events
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at ON stripe_webhook_events(processed_at);

-- Add stripe_payment_intent_id to orders if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'stripe_payment_intent_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN stripe_payment_intent_id TEXT;
    END IF;
END $$;

-- Index for finding orders by payment intent
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id 
ON orders(stripe_payment_intent_id) 
WHERE stripe_payment_intent_id IS NOT NULL;

-- Add payment_confirmed_at timestamp
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'payment_confirmed_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN payment_confirmed_at TIMESTAMPTZ;
    END IF;
END $$;

COMMENT ON TABLE stripe_webhook_events IS 'Tracks processed Stripe webhook events for idempotency';
COMMENT ON COLUMN stripe_webhook_events.event_id IS 'Stripe event ID (evt_...)';
COMMENT ON COLUMN stripe_webhook_events.event_type IS 'Event type (payment_intent.succeeded, etc)';
COMMENT ON COLUMN stripe_webhook_events.status IS 'Processing status (processed, skipped, error)';
