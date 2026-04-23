-- =============================================================================
-- Add per-unit pricing fields to supplier_offers for apples-to-apples comparison
-- =============================================================================

-- Add per-unit cost calculation fields
ALTER TABLE catalogos.supplier_offers 
ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(12,4);

ALTER TABLE catalogos.supplier_offers 
ADD COLUMN IF NOT EXISTS units_per_case INT;

-- Add best offer tracking fields for quick lookups
ALTER TABLE catalogos.supplier_offers 
ADD COLUMN IF NOT EXISTS is_best_price BOOLEAN DEFAULT false;

ALTER TABLE catalogos.supplier_offers 
ADD COLUMN IF NOT EXISTS price_rank INT;

-- Add index for best price lookups
CREATE INDEX IF NOT EXISTS idx_supplier_offers_best_price 
ON catalogos.supplier_offers (product_id, is_best_price) 
WHERE is_best_price = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_supplier_offers_price_rank 
ON catalogos.supplier_offers (product_id, price_rank) 
WHERE is_active = true;

-- Add comment explaining per-unit pricing
COMMENT ON COLUMN catalogos.supplier_offers.cost_per_unit IS 
'Cost per individual unit = cost / units_per_case. Used for apples-to-apples price comparison across different pack sizes.';

COMMENT ON COLUMN catalogos.supplier_offers.units_per_case IS 
'Total units in the case (units_per_box * boxes_per_case). Used for per-unit cost calculation.';

COMMENT ON COLUMN catalogos.supplier_offers.is_best_price IS 
'True if this offer has the lowest per-unit cost among active offers for this product.';

COMMENT ON COLUMN catalogos.supplier_offers.price_rank IS 
'Rank of this offer by per-unit cost (1 = lowest). Null if not ranked.';

-- =============================================================================
-- Function to update offer rankings for a product
-- =============================================================================

CREATE OR REPLACE FUNCTION catalogos.update_offer_rankings(p_product_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Reset all rankings for this product
  UPDATE catalogos.supplier_offers
  SET is_best_price = false, price_rank = NULL
  WHERE product_id = p_product_id;
  
  -- Calculate and set rankings based on per-unit cost
  WITH ranked AS (
    SELECT 
      id,
      cost_per_unit,
      ROW_NUMBER() OVER (ORDER BY cost_per_unit ASC NULLS LAST) as rank
    FROM catalogos.supplier_offers
    WHERE product_id = p_product_id
      AND is_active = true
      AND cost_per_unit IS NOT NULL
      AND cost_per_unit > 0
  )
  UPDATE catalogos.supplier_offers so
  SET 
    price_rank = r.rank,
    is_best_price = (r.rank = 1)
  FROM ranked r
  WHERE so.id = r.id;
END;
$$;

-- =============================================================================
-- Trigger to auto-update rankings on offer change
-- =============================================================================

CREATE OR REPLACE FUNCTION catalogos.trigger_update_offer_rankings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update rankings for affected product
  IF TG_OP = 'DELETE' THEN
    PERFORM catalogos.update_offer_rankings(OLD.product_id);
    RETURN OLD;
  ELSE
    -- Calculate per-unit cost if not set
    IF NEW.cost_per_unit IS NULL AND NEW.cost IS NOT NULL AND NEW.units_per_case IS NOT NULL AND NEW.units_per_case > 0 THEN
      NEW.cost_per_unit := NEW.cost / NEW.units_per_case;
    END IF;
    
    PERFORM catalogos.update_offer_rankings(NEW.product_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_offer_rankings ON catalogos.supplier_offers;
CREATE TRIGGER trg_update_offer_rankings
AFTER INSERT OR UPDATE OF cost, cost_per_unit, is_active OR DELETE
ON catalogos.supplier_offers
FOR EACH ROW
EXECUTE FUNCTION catalogos.trigger_update_offer_rankings();
