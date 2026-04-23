-- Schema hardening migration: Fix missing constraints and add safety indexes
-- This migration addresses issues found in production-readiness audit

-- ============================================================================
-- 1–3. supplier_offers retail columns + checks (not in base catalogos schema)
-- ============================================================================
ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS is_best_price BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS units_per_case INTEGER,
  ADD COLUMN IF NOT EXISTS price_rank INTEGER;

ALTER TABLE catalogos.supplier_offers
  ALTER COLUMN is_best_price SET DEFAULT false;
UPDATE catalogos.supplier_offers SET is_best_price = false WHERE is_best_price IS NULL;
ALTER TABLE catalogos.supplier_offers
  ALTER COLUMN is_best_price SET NOT NULL;

DO $c$
BEGIN
  ALTER TABLE catalogos.supplier_offers
    ADD CONSTRAINT chk_units_per_case_non_negative
    CHECK (units_per_case IS NULL OR units_per_case >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $c$;

DO $c$
BEGIN
  ALTER TABLE catalogos.supplier_offers
    ADD CONSTRAINT chk_price_rank_positive
    CHECK (price_rank IS NULL OR price_rank >= 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $c$;

-- ============================================================================
-- 4. FIX: catalogos.products.live_product_id missing FK to public.products
-- Note: Using SET NULL on delete to avoid cascade issues
-- ============================================================================
-- First ensure any orphaned references are cleaned up
UPDATE catalogos.products cp
SET live_product_id = NULL
WHERE cp.live_product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.products pp WHERE pp.id = cp.live_product_id
  );

-- Then add the FK constraint
DO $c$
BEGIN
  ALTER TABLE catalogos.products
    ADD CONSTRAINT fk_products_live_product
    FOREIGN KEY (live_product_id)
    REFERENCES public.products(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $c$;

-- ============================================================================
-- 5. ADD INDEX: supplier_products_normalized.supplier_id for supplier lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_spn_supplier_id 
  ON catalogos.supplier_products_normalized(supplier_id);

-- ============================================================================
-- 6. ADD INDEX: catalogos.products.live_product_id for reverse lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_products_live_product_id 
  ON catalogos.products(live_product_id) 
  WHERE live_product_id IS NOT NULL;

-- ============================================================================
-- 7. ADD INDEX: supplier_offers for active supplier queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_supplier_offers_supplier_active 
  ON catalogos.supplier_offers(supplier_id, is_active) 
  WHERE is_active = true;

-- ============================================================================
-- 8. ADD INDEX: review_flags composite for review queue joins
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_review_flags_normalized_severity 
  ON catalogos.review_flags(normalized_id, severity);

-- ============================================================================
-- 9. ADD CONSTRAINT: supplier_offers.cost must be positive for active offers
-- ============================================================================
DO $c$
BEGIN
  ALTER TABLE catalogos.supplier_offers
    ADD CONSTRAINT chk_active_offer_positive_cost
    CHECK (is_active = false OR cost > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $c$;

-- ============================================================================
-- 10. ADD updated_at trigger for supplier_offers race condition protection
-- ============================================================================
ALTER TABLE catalogos.supplier_offers 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION catalogos.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_offers_updated_at ON catalogos.supplier_offers;
CREATE TRIGGER trg_supplier_offers_updated_at
  BEFORE UPDATE ON catalogos.supplier_offers
  FOR EACH ROW
  EXECUTE FUNCTION catalogos.set_updated_at();

-- ============================================================================
-- 11. ADD CONSTRAINT: Ensure normalized_id references are valid for offers
-- ============================================================================
-- Note: This is already enforced by FK, but let's ensure index exists for perf
CREATE INDEX IF NOT EXISTS idx_supplier_offers_normalized_id 
  ON catalogos.supplier_offers(normalized_id) 
  WHERE normalized_id IS NOT NULL;

-- ============================================================================
-- 12. AUDIT LOG: Track schema changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS catalogos.schema_versions (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT
);

INSERT INTO catalogos.schema_versions (version, applied_at, description)
VALUES (
  '20260331000002',
  now(),
  'Schema hardening: Add NOT NULL to is_best_price, CHECK constraints, FK for live_product_id, indexes'
)
ON CONFLICT (version) DO NOTHING;
