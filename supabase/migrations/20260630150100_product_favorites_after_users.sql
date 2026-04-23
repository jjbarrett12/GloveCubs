-- =============================================================================
-- product_favorites: must run after public.users exists (20260330000001).
-- 20260302000010 ran lexicographically before users and would fail on REFERENCES.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_favorites_user ON public.product_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_product_favorites_product ON public.product_favorites(product_id);
