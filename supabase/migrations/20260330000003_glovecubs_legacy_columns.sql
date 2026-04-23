-- =============================================================================
-- GloveCubs: columns needed for full migration off database.json
-- manufacturers (vendor/PO email), purchase_orders (po_number, sent_at),
-- inventory (bin_location, last_count_at), password_reset_tokens (user_id),
-- ship_to_addresses (is_default), uploaded_invoices (user_id)
-- =============================================================================

-- Manufacturers: vendor and PO email for sending POs
ALTER TABLE public.manufacturers
  ADD COLUMN IF NOT EXISTS vendor_email TEXT,
  ADD COLUMN IF NOT EXISTS po_email TEXT;

-- Purchase orders: po_number and sent_at
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS po_number TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON public.purchase_orders (po_number) WHERE po_number IS NOT NULL;

-- Inventory: bin location and last count time
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS bin_location TEXT,
  ADD COLUMN IF NOT EXISTS last_count_at TIMESTAMPTZ;

-- Password reset tokens: link to user for reset flow
ALTER TABLE public.password_reset_tokens
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE;

-- Ship-to addresses: default flag and updated_at (address JSONB already exists)
ALTER TABLE public.ship_to_addresses
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Uploaded invoices: user_id for filtering by owner
ALTER TABLE public.uploaded_invoices
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_uploaded_invoices_user ON public.uploaded_invoices (user_id);
