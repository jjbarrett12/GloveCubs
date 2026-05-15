-- Phase 1C: optional ship-to selection on quote requests with immutable snapshot at submit time.
-- Not checkout, shipping-rate, tax, payment, or order economics truth.

ALTER TABLE catalogos.quote_requests
  ADD COLUMN IF NOT EXISTS ship_to_address_id UUID REFERENCES gc_commerce.ship_to_addresses (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ship_to_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS ship_to_label TEXT;

CREATE INDEX IF NOT EXISTS idx_quote_requests_ship_to_address_id
  ON catalogos.quote_requests (ship_to_address_id)
  WHERE ship_to_address_id IS NOT NULL;

COMMENT ON COLUMN catalogos.quote_requests.ship_to_address_id IS
  'UUID of gc_commerce.ship_to_addresses row at submit time; traceability only. Not a live join for historical display.';

COMMENT ON COLUMN catalogos.quote_requests.ship_to_snapshot IS
  'Immutable quote-time delivery address JSON (_v:1). Edits to the company address book do not update this column.';

COMMENT ON COLUMN catalogos.quote_requests.ship_to_label IS
  'Copy of ship-to label at submit time for list views; convenience only — snapshot JSON is canonical for address fields.';
