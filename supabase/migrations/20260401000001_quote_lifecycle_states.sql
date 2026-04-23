-- =============================================================================
-- Quote Lifecycle States: Add won, lost, expired statuses.
-- Add notification hooks and timestamps.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Update catalogos.quote_requests to add new statuses
-- -----------------------------------------------------------------------------
-- Drop and recreate the status check constraint to include new statuses
ALTER TABLE catalogos.quote_requests
  DROP CONSTRAINT IF EXISTS quote_requests_status_check;

ALTER TABLE catalogos.quote_requests
  ADD CONSTRAINT quote_requests_status_check
    CHECK (status IN (
      'new',
      'reviewing',
      'contacted',
      'quoted',
      'won',
      'lost',
      'expired',
      'closed'
    ));

-- Add new timestamp columns for lifecycle tracking
ALTER TABLE catalogos.quote_requests
  ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS won_order_id UUID;

COMMENT ON COLUMN catalogos.quote_requests.won_at IS 'When the quote was won (customer accepted).';
COMMENT ON COLUMN catalogos.quote_requests.lost_at IS 'When the quote was lost (customer declined).';
COMMENT ON COLUMN catalogos.quote_requests.expired_at IS 'When the quote expired.';
COMMENT ON COLUMN catalogos.quote_requests.expires_at IS 'Quote expiration date.';
COMMENT ON COLUMN catalogos.quote_requests.lost_reason IS 'Reason for losing the quote.';
COMMENT ON COLUMN catalogos.quote_requests.won_order_id IS 'Associated order ID if quote was won.';

-- Create index for status lookups
CREATE INDEX IF NOT EXISTS idx_quote_requests_status_lifecycle 
  ON catalogos.quote_requests (status) 
  WHERE status IN ('won', 'lost', 'expired');

-- -----------------------------------------------------------------------------
-- 2. Create quote_status_history table for audit trail
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.quote_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES catalogos.quote_requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_status_history_quote ON catalogos.quote_status_history (quote_request_id);

COMMENT ON TABLE catalogos.quote_status_history IS 'Audit trail for quote status changes.';

-- -----------------------------------------------------------------------------
-- 3. Create quote_notifications table for notification hooks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.quote_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES catalogos.quote_requests(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'received',
    'updated',
    'quoted',
    'won',
    'lost',
    'expired',
    'reminder'
  )),
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'webhook', 'internal')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  payload JSONB,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_notifications_quote ON catalogos.quote_notifications (quote_request_id);
CREATE INDEX idx_quote_notifications_status ON catalogos.quote_notifications (status) WHERE status = 'pending';

COMMENT ON TABLE catalogos.quote_notifications IS 'Notification queue for quote lifecycle events.';

-- -----------------------------------------------------------------------------
-- 4. Function to record status change with history
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION catalogos.transition_quote_status(
  p_quote_id UUID,
  p_new_status TEXT,
  p_changed_by TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
) RETURNS catalogos.quote_requests AS $$
DECLARE
  v_quote catalogos.quote_requests;
  v_old_status TEXT;
BEGIN
  -- Get current quote
  SELECT * INTO v_quote FROM catalogos.quote_requests WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id;
  END IF;
  
  v_old_status := v_quote.status;
  
  -- Update quote status and timestamps
  UPDATE catalogos.quote_requests SET
    status = p_new_status,
    updated_at = NOW(),
    won_at = CASE WHEN p_new_status = 'won' THEN NOW() ELSE won_at END,
    lost_at = CASE WHEN p_new_status = 'lost' THEN NOW() ELSE lost_at END,
    expired_at = CASE WHEN p_new_status = 'expired' THEN NOW() ELSE expired_at END,
    closed_at = CASE WHEN p_new_status IN ('won', 'lost', 'expired', 'closed') THEN NOW() ELSE closed_at END,
    lost_reason = CASE WHEN p_new_status = 'lost' THEN p_reason ELSE lost_reason END
  WHERE id = p_quote_id
  RETURNING * INTO v_quote;
  
  -- Record in history
  INSERT INTO catalogos.quote_status_history (
    quote_request_id,
    from_status,
    to_status,
    changed_by,
    reason
  ) VALUES (
    p_quote_id,
    v_old_status,
    p_new_status,
    p_changed_by,
    p_reason
  );
  
  -- Queue notification
  INSERT INTO catalogos.quote_notifications (
    quote_request_id,
    notification_type,
    recipient,
    payload
  ) VALUES (
    p_quote_id,
    CASE 
      WHEN p_new_status = 'won' THEN 'won'
      WHEN p_new_status = 'lost' THEN 'lost'
      WHEN p_new_status = 'expired' THEN 'expired'
      WHEN p_new_status = 'quoted' THEN 'quoted'
      ELSE 'updated'
    END,
    v_quote.email,
    jsonb_build_object(
      'quote_id', p_quote_id,
      'from_status', v_old_status,
      'to_status', p_new_status,
      'reason', p_reason
    )
  );
  
  RETURN v_quote;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 5. Function to expire quotes past their expiration date
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION catalogos.expire_quotes() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE catalogos.quote_requests
    SET status = 'expired', expired_at = NOW(), closed_at = NOW(), updated_at = NOW()
    WHERE status IN ('quoted', 'reviewing', 'contacted')
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM expired;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 6. RLS Policies
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.quote_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.quote_notifications ENABLE ROW LEVEL SECURITY;

-- Admin can see all
CREATE POLICY admin_all_quote_status_history ON catalogos.quote_status_history
  FOR ALL USING (true);

CREATE POLICY admin_all_quote_notifications ON catalogos.quote_notifications
  FOR ALL USING (true);

-- -----------------------------------------------------------------------------
-- 7. Summary view for dashboard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW catalogos.quote_lifecycle_stats AS
SELECT
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days,
  AVG(EXTRACT(EPOCH FROM (
    CASE 
      WHEN status = 'won' THEN won_at 
      WHEN status = 'lost' THEN lost_at
      WHEN status = 'expired' THEN expired_at
      ELSE closed_at
    END - created_at
  )) / 3600)::NUMERIC(10,2) as avg_hours_to_close
FROM catalogos.quote_requests
GROUP BY status;

COMMENT ON VIEW catalogos.quote_lifecycle_stats IS 'Summary statistics for quote lifecycle by status.';
