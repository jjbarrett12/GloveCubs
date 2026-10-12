-- After 222: approved list must keep Kodiak 20% GM (list ≥ cost / 0.56).
-- Cost updates are always accepted. If an approved list becomes unsafe, clear verification
-- (keep sell_price and catalog_variant_id). Operator approval of an unsafe list is rejected.
-- Formula matches lib/published-list-pricing.ts (ceil in cents, epsilon 1e-9).

CREATE OR REPLACE FUNCTION catalogos.minimum_safe_published_list(p_cost numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_cost IS NULL OR p_cost <= 0 THEN NULL
    ELSE (
      CEIL(ROUND(p_cost * 100) / 0.56::numeric - 0.000000001) / 100.0
    )
  END;
$$;

COMMENT ON FUNCTION catalogos.minimum_safe_published_list(numeric) IS
  'Smallest USD-major list that keeps Kodiak GM ≥ 20% vs landed cost (list ≥ cost / 0.56, ceiled to cents). Matches TypeScript minimumSafePublishedList.';

CREATE OR REPLACE FUNCTION catalogos.published_list_meets_kodiak_floor(p_cost numeric, p_sell_price numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    p_cost IS NOT NULL AND p_cost > 0
    AND p_sell_price IS NOT NULL AND p_sell_price > 0
    AND ROUND(p_sell_price * 100) >= CEIL(ROUND(p_cost * 100) / 0.56::numeric - 0.000000001);
$$;

COMMENT ON FUNCTION catalogos.published_list_meets_kodiak_floor(numeric, numeric) IS
  'True when sell_price meets catalogos.minimum_safe_published_list(cost). Cent comparison matches TypeScript validatePublishedListApproval.';

CREATE OR REPLACE FUNCTION catalogos.enforce_published_list_kodiak_floor()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_claimed boolean;
  v_safe boolean;
BEGIN
  v_claimed := NEW.sell_price_verified_at IS NOT NULL;
  IF NOT v_claimed THEN
    RETURN NEW;
  END IF;

  v_safe := catalogos.published_list_meets_kodiak_floor(NEW.cost, NEW.sell_price);
  IF v_safe THEN
    RETURN NEW;
  END IF;

  -- Supplier/admin cost change: accept the cost, unpublish the list. Do not raise.
  IF TG_OP = 'UPDATE' AND OLD.cost IS DISTINCT FROM NEW.cost THEN
    NEW.sell_price_verified_at := NULL;
    NEW.sell_price_verified_by := NULL;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'below_minimum_margin'
    USING ERRCODE = '23514',
          DETAIL = format(
            'sell_price %s is below Kodiak 20%% floor for cost %s (min %s)',
            NEW.sell_price,
            NEW.cost,
            catalogos.minimum_safe_published_list(NEW.cost)
          );
END;
$fn$;

COMMENT ON FUNCTION catalogos.enforce_published_list_kodiak_floor() IS
  'BEFORE INSERT/UPDATE: reject operator approval of an unsafe list; on cost change, clear sell_price_verified_at/by and keep sell_price + catalog_variant_id.';

DROP TRIGGER IF EXISTS trg_supplier_offers_kodiak_floor ON catalogos.supplier_offers;
CREATE TRIGGER trg_supplier_offers_kodiak_floor
  BEFORE INSERT OR UPDATE OF cost, sell_price, sell_price_verified_at, sell_price_verified_by
  ON catalogos.supplier_offers
  FOR EACH ROW
  EXECUTE FUNCTION catalogos.enforce_published_list_kodiak_floor();

REVOKE ALL ON FUNCTION catalogos.minimum_safe_published_list(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION catalogos.published_list_meets_kodiak_floor(numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalogos.minimum_safe_published_list(numeric) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION catalogos.published_list_meets_kodiak_floor(numeric, numeric) TO postgres, service_role;
