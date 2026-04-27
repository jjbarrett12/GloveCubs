-- Feed offer commits are handled in TypeScript (normalizeSupplierOfferPricing + explicit upserts).
-- Fail fast if any legacy client still calls the old RPC.

CREATE OR REPLACE FUNCTION catalogos.commit_feed_upload(
  p_upload_id UUID,
  p_supplier_id UUID,
  p_user_id UUID,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos
AS $$
BEGIN
  RAISE EXCEPTION 'commit_feed_upload is deprecated: use storefront commitFeedUpload (TypeScript) with explicit supplier_offers normalization';
END;
$$;

COMMENT ON FUNCTION catalogos.commit_feed_upload IS 'Deprecated: supplier_offers writes moved to TS with normalizeSupplierOfferPricing.';
