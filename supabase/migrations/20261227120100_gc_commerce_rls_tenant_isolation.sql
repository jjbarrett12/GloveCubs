-- =============================================================================
-- Phase 1 tenant security: RLS on gc_commerce customer/commerce tables + quotes.
-- Deny-by-default. Authenticated members get SELECT (and limited writes).
-- service_role bypasses RLS (server APIs). anon gets no policies.
-- Rollback: DROP POLICY IF EXISTS ...; ALTER TABLE ... DISABLE ROW LEVEL SECURITY
--   (prefer leave RLS enabled and drop only new policies if needed).
-- Orphan note: rows with NULL company_id remain inaccessible to customers
--   (not auto-assigned). See scripts/sql/tenant-orphan-report.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- companies: SELECT member; UPDATE owner/admin only; no INSERT/DELETE for clients
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_companies_select_member ON gc_commerce.companies;
CREATE POLICY gc_companies_select_member
  ON gc_commerce.companies
  FOR SELECT
  TO authenticated
  USING (gc_commerce.is_company_member(id) OR public.is_active_admin());

DROP POLICY IF EXISTS gc_companies_update_owner_admin ON gc_commerce.companies;
CREATE POLICY gc_companies_update_owner_admin
  ON gc_commerce.companies
  FOR UPDATE
  TO authenticated
  USING (gc_commerce.has_company_role(id, ARRAY['owner', 'admin']) OR public.is_active_admin())
  WITH CHECK (gc_commerce.has_company_role(id, ARRAY['owner', 'admin']) OR public.is_active_admin());

GRANT SELECT ON TABLE gc_commerce.companies TO authenticated;
-- No INSERT/DELETE grants for authenticated (service_role only).

-- -----------------------------------------------------------------------------
-- company_members: SELECT same-company; INSERT/UPDATE/DELETE owner/admin only
-- Prevent self-elevation: WITH CHECK role cannot be granted unless actor is owner/admin
-- and target company matches; cannot set company_id to foreign company.
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.company_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_company_members_select ON gc_commerce.company_members;
CREATE POLICY gc_company_members_select
  ON gc_commerce.company_members
  FOR SELECT
  TO authenticated
  USING (gc_commerce.is_company_member(company_id) OR public.is_active_admin());

DROP POLICY IF EXISTS gc_company_members_insert_owner_admin ON gc_commerce.company_members;
CREATE POLICY gc_company_members_insert_owner_admin
  ON gc_commerce.company_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_admin()
    OR (
      gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin'])
      AND role IN ('admin', 'member', 'viewer', 'billing')
      -- Owners may add admins; only service_role/admin_users should create owners.
      AND (role <> 'owner' OR public.is_active_admin())
    )
  );

DROP POLICY IF EXISTS gc_company_members_update_owner_admin ON gc_commerce.company_members;
CREATE POLICY gc_company_members_update_owner_admin
  ON gc_commerce.company_members
  FOR UPDATE
  TO authenticated
  USING (gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin']) OR public.is_active_admin())
  WITH CHECK (
    public.is_active_admin()
    OR (
      gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin'])
      AND role IN ('admin', 'member', 'viewer', 'billing')
      AND role <> 'owner'
    )
  );

DROP POLICY IF EXISTS gc_company_members_delete_owner_admin ON gc_commerce.company_members;
CREATE POLICY gc_company_members_delete_owner_admin
  ON gc_commerce.company_members
  FOR DELETE
  TO authenticated
  USING (gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin']) OR public.is_active_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE gc_commerce.company_members TO authenticated;

-- -----------------------------------------------------------------------------
-- user_profiles: own row only
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_user_profiles_select_self ON gc_commerce.user_profiles;
CREATE POLICY gc_user_profiles_select_self
  ON gc_commerce.user_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_active_admin());

DROP POLICY IF EXISTS gc_user_profiles_update_self ON gc_commerce.user_profiles;
CREATE POLICY gc_user_profiles_update_self
  ON gc_commerce.user_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_active_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_active_admin());

DROP POLICY IF EXISTS gc_user_profiles_insert_self ON gc_commerce.user_profiles;
CREATE POLICY gc_user_profiles_insert_self
  ON gc_commerce.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_active_admin());

GRANT SELECT, INSERT, UPDATE ON TABLE gc_commerce.user_profiles TO authenticated;

-- -----------------------------------------------------------------------------
-- ship_to_addresses
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.ship_to_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_ship_to_select ON gc_commerce.ship_to_addresses;
CREATE POLICY gc_ship_to_select
  ON gc_commerce.ship_to_addresses
  FOR SELECT
  TO authenticated
  USING (
    (company_id IS NOT NULL AND gc_commerce.is_company_member(company_id))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS gc_ship_to_insert ON gc_commerce.ship_to_addresses;
CREATE POLICY gc_ship_to_insert
  ON gc_commerce.ship_to_addresses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_admin()
    OR (
      company_id IS NOT NULL
      AND gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin', 'member'])
      AND created_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS gc_ship_to_update ON gc_commerce.ship_to_addresses;
CREATE POLICY gc_ship_to_update
  ON gc_commerce.ship_to_addresses
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_admin()
    OR (company_id IS NOT NULL AND gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin', 'member']))
  )
  WITH CHECK (
    public.is_active_admin()
    OR (company_id IS NOT NULL AND gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin', 'member']))
  );

DROP POLICY IF EXISTS gc_ship_to_delete ON gc_commerce.ship_to_addresses;
CREATE POLICY gc_ship_to_delete
  ON gc_commerce.ship_to_addresses
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_admin()
    OR (company_id IS NOT NULL AND gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin', 'member']))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE gc_commerce.ship_to_addresses TO authenticated;

-- -----------------------------------------------------------------------------
-- uploaded_invoices: members read; writers owner/admin/member; no anon
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.uploaded_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_uploaded_invoices_select ON gc_commerce.uploaded_invoices;
CREATE POLICY gc_uploaded_invoices_select
  ON gc_commerce.uploaded_invoices
  FOR SELECT
  TO authenticated
  USING (gc_commerce.is_company_member(company_id) OR public.is_active_admin());

DROP POLICY IF EXISTS gc_uploaded_invoices_insert ON gc_commerce.uploaded_invoices;
CREATE POLICY gc_uploaded_invoices_insert
  ON gc_commerce.uploaded_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_admin()
    OR (
      gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin', 'member'])
      AND created_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS gc_uploaded_invoices_delete ON gc_commerce.uploaded_invoices;
CREATE POLICY gc_uploaded_invoices_delete
  ON gc_commerce.uploaded_invoices
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_admin()
    OR gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin'])
  );

GRANT SELECT, INSERT, DELETE ON TABLE gc_commerce.uploaded_invoices TO authenticated;

-- -----------------------------------------------------------------------------
-- rfqs
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.rfqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_rfqs_select ON gc_commerce.rfqs;
CREATE POLICY gc_rfqs_select
  ON gc_commerce.rfqs
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_admin()
    OR (company_id IS NOT NULL AND gc_commerce.is_company_member(company_id))
    OR (company_id IS NULL AND created_by_user_id = auth.uid())
  );

DROP POLICY IF EXISTS gc_rfqs_insert ON gc_commerce.rfqs;
CREATE POLICY gc_rfqs_insert
  ON gc_commerce.rfqs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_admin()
    OR (
      company_id IS NOT NULL
      AND gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin', 'member', 'billing'])
      AND (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
    )
  );

GRANT SELECT, INSERT ON TABLE gc_commerce.rfqs TO authenticated;

-- -----------------------------------------------------------------------------
-- orders / order_lines
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_orders_select ON gc_commerce.orders;
CREATE POLICY gc_orders_select
  ON gc_commerce.orders
  FOR SELECT
  TO authenticated
  USING (gc_commerce.is_company_member(company_id) OR public.is_active_admin());

DROP POLICY IF EXISTS gc_orders_insert ON gc_commerce.orders;
CREATE POLICY gc_orders_insert
  ON gc_commerce.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_admin()
    OR gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin', 'member', 'billing'])
  );

-- No customer UPDATE/DELETE policies (status transitions via service_role).

GRANT SELECT, INSERT ON TABLE gc_commerce.orders TO authenticated;

ALTER TABLE gc_commerce.order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_order_lines_select ON gc_commerce.order_lines;
CREATE POLICY gc_order_lines_select
  ON gc_commerce.order_lines
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1
      FROM gc_commerce.orders o
      WHERE o.id = order_lines.order_id
        AND gc_commerce.is_company_member(o.company_id)
    )
  );

GRANT SELECT ON TABLE gc_commerce.order_lines TO authenticated;

-- -----------------------------------------------------------------------------
-- saved_lists (user-scoped legacy quicklists)
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.saved_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_saved_lists_all_own ON gc_commerce.saved_lists;
CREATE POLICY gc_saved_lists_all_own
  ON gc_commerce.saved_lists
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR public.is_active_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_active_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE gc_commerce.saved_lists TO authenticated;

-- -----------------------------------------------------------------------------
-- company_quicklist_items: keep SELECT member; ensure no write for clients
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.company_quicklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_quicklist_items_select_member ON gc_commerce.company_quicklist_items;
CREATE POLICY gc_quicklist_items_select_member
  ON gc_commerce.company_quicklist_items
  FOR SELECT
  TO authenticated
  USING (gc_commerce.is_company_member(company_id) OR public.is_active_admin());

GRANT SELECT ON TABLE gc_commerce.company_quicklist_items TO authenticated;

-- -----------------------------------------------------------------------------
-- customer_manufacturer_pricing: members may SELECT only (no cost of goods —
-- margin_percent is commercial override; treat as company-private, not public)
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.customer_manufacturer_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_cmp_select ON gc_commerce.customer_manufacturer_pricing;
CREATE POLICY gc_cmp_select
  ON gc_commerce.customer_manufacturer_pricing
  FOR SELECT
  TO authenticated
  USING (gc_commerce.is_company_member(company_id) OR public.is_active_admin());

GRANT SELECT ON TABLE gc_commerce.customer_manufacturer_pricing TO authenticated;

-- -----------------------------------------------------------------------------
-- net_terms_applications
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.net_terms_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_net_terms_select ON gc_commerce.net_terms_applications;
CREATE POLICY gc_net_terms_select
  ON gc_commerce.net_terms_applications
  FOR SELECT
  TO authenticated
  USING (gc_commerce.is_company_member(company_id) OR public.is_active_admin());

DROP POLICY IF EXISTS gc_net_terms_insert ON gc_commerce.net_terms_applications;
CREATE POLICY gc_net_terms_insert
  ON gc_commerce.net_terms_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_admin()
    OR (
      gc_commerce.has_company_role(company_id, ARRAY['owner', 'admin', 'billing'])
      AND applicant_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON TABLE gc_commerce.net_terms_applications TO authenticated;

-- -----------------------------------------------------------------------------
-- carts: if present, user/session ownership is server-managed; block client API
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('gc_commerce.carts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE gc_commerce.carts ENABLE ROW LEVEL SECURITY';
    -- No policies for authenticated/anon → deny. service_role only.
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- sellable_products: catalog sellable projection — read for authenticated ok;
-- unit_cost_minor must not be selected via a public view (column stays; revoke
-- broad grants if any). Prefer service_role for cost-aware ops.
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.sellable_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_sellable_products_select_active ON gc_commerce.sellable_products;
CREATE POLICY gc_sellable_products_select_active
  ON gc_commerce.sellable_products
  FOR SELECT
  TO authenticated
  USING (is_active IS TRUE OR public.is_active_admin());

GRANT SELECT ON TABLE gc_commerce.sellable_products TO authenticated;

-- -----------------------------------------------------------------------------
-- catalogos quote_requests / quote_line_items — expand SELECT + block mutations
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.quote_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogos_quote_requests_select_company_member ON catalogos.quote_requests;
CREATE POLICY catalogos_quote_requests_select_company_member
  ON catalogos.quote_requests
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_admin()
    OR (
      gc_company_id IS NOT NULL
      AND gc_commerce.is_company_member(gc_company_id)
    )
  );

DROP POLICY IF EXISTS catalogos_quote_line_items_select_company_member ON catalogos.quote_line_items;
CREATE POLICY catalogos_quote_line_items_select_company_member
  ON catalogos.quote_line_items
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1
      FROM catalogos.quote_requests qr
      WHERE qr.id = quote_line_items.quote_request_id
        AND qr.gc_company_id IS NOT NULL
        AND gc_commerce.is_company_member(qr.gc_company_id)
    )
  );

GRANT SELECT ON TABLE catalogos.quote_requests TO authenticated;
GRANT SELECT ON TABLE catalogos.quote_line_items TO authenticated;

-- Schema usage (idempotent)
GRANT USAGE ON SCHEMA gc_commerce TO authenticated;
GRANT USAGE ON SCHEMA catalogos TO authenticated;
