-- =============================================================================
-- Add strict total-composition CHECKs to gc_commerce orders / order_lines if
-- missing (for databases that applied an older 20260331210000 without them).
-- Safe to run once; ignores duplicate_constraint.
-- =============================================================================

DO $$
BEGIN
  ALTER TABLE gc_commerce.orders
    ADD CONSTRAINT ck_gc_orders_total_matches_components CHECK (
      total_minor = subtotal_minor - discount_minor + shipping_minor + tax_minor
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE gc_commerce.order_lines
    ADD CONSTRAINT ck_gc_order_lines_total_matches_components CHECK (
      total_minor = line_subtotal_minor - discount_minor + tax_minor
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Composite indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_gc_orders_company_placed_at
  ON gc_commerce.orders (company_id, placed_at DESC);

CREATE INDEX IF NOT EXISTS idx_gc_company_members_user_company
  ON gc_commerce.company_members (user_id, company_id);

CREATE INDEX IF NOT EXISTS idx_gc_order_lines_order_line_number
  ON gc_commerce.order_lines (order_id, line_number);
