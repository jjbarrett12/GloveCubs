-- Phase 3: defense-in-depth RLS on competitor crosswalk tables (service_role bypasses RLS).
-- No policies for anon/authenticated. Additive. No data rewrite.

ALTER TABLE gc_commerce.competitor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE gc_commerce.competitor_product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE gc_commerce.competitor_equivalencies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON gc_commerce.competitor_products FROM anon, authenticated;
REVOKE ALL ON gc_commerce.competitor_product_aliases FROM anon, authenticated;
REVOKE ALL ON gc_commerce.competitor_equivalencies FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.competitor_products TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.competitor_product_aliases TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.competitor_equivalencies TO postgres, service_role;
