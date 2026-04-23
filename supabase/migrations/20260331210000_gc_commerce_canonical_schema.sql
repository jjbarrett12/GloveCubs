-- =============================================================================
-- GloveCubs canonical commerce schema (parallel track).
-- Schema: gc_commerce — does NOT ALTER any existing public.* or legacy tables.
--
-- Tables (qualified names):
--   gc_commerce.user_profiles
--   gc_commerce.companies
--   gc_commerce.company_members
--   gc_commerce.sellable_products
--   gc_commerce.orders
--   gc_commerce.order_lines
--
-- Rules:
--   - All surrogate and FK identifiers: UUID
--   - All money stored as *_minor BIGINT (minor currency units, e.g. USD cents)
--   - currency_code: ISO 4217 alpha-3 (A–Z)
--
-- catalog_product_id: UUID logical link to catalog master (FK to catalogos in a
-- separate migration if desired). RLS: add in a follow-up migration.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gc_commerce;

COMMENT ON SCHEMA gc_commerce IS
  'Canonical B2B commerce (UUID keys, money in minor units). Parallel to legacy public.orders until cutover.';

-- -----------------------------------------------------------------------------
-- companies
-- -----------------------------------------------------------------------------
CREATE TABLE gc_commerce.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_name TEXT NOT NULL,
  legal_name TEXT,
  slug TEXT NOT NULL,
  country_code CHAR(2),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_gc_companies_trade_name_nonempty CHECK (char_length(trim(trade_name)) > 0),
  CONSTRAINT ck_gc_companies_slug_format CHECK (
    slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' AND char_length(slug) >= 2 AND char_length(slug) <= 64
  ),
  CONSTRAINT ck_gc_companies_country_code CHECK (
    country_code IS NULL OR (country_code ~ '^[A-Z]{2}$')
  ),
  CONSTRAINT ck_gc_companies_status CHECK (status IN ('active', 'suspended', 'archived'))
);

COMMENT ON TABLE gc_commerce.companies IS 'Tenant / account (canonical UUID model).';

CREATE UNIQUE INDEX uq_gc_companies_slug_ci ON gc_commerce.companies (lower(slug));

CREATE INDEX idx_gc_companies_status ON gc_commerce.companies (status)
  WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- user_profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE gc_commerce.user_profiles (
  user_id UUID NOT NULL,
  default_company_id UUID,
  full_name TEXT,
  phone_e164 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_gc_user_profiles PRIMARY KEY (user_id),
  CONSTRAINT fk_gc_user_profiles_user FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT fk_gc_user_profiles_default_company FOREIGN KEY (default_company_id) REFERENCES gc_commerce.companies (id) ON DELETE SET NULL,
  CONSTRAINT ck_gc_user_profiles_phone_e164 CHECK (
    phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9]\d{6,14}$'
  )
);

COMMENT ON TABLE gc_commerce.user_profiles IS 'App profile for Supabase Auth users; optional default company.';

CREATE INDEX idx_gc_user_profiles_default_company ON gc_commerce.user_profiles (default_company_id)
  WHERE default_company_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- company_members
-- -----------------------------------------------------------------------------
CREATE TABLE gc_commerce.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  invited_by_user_id UUID,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_gc_company_members_company FOREIGN KEY (company_id) REFERENCES gc_commerce.companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_gc_company_members_user FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT fk_gc_company_members_invited_by FOREIGN KEY (invited_by_user_id) REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT uq_gc_company_members_company_user UNIQUE (company_id, user_id),
  CONSTRAINT ck_gc_company_members_role CHECK (
    role IN ('owner', 'admin', 'member', 'viewer', 'billing')
  )
);

COMMENT ON TABLE gc_commerce.company_members IS 'Membership: auth user to company with role.';

CREATE INDEX idx_gc_company_members_company_id ON gc_commerce.company_members (company_id);

CREATE INDEX idx_gc_company_members_user_id ON gc_commerce.company_members (user_id);

CREATE INDEX idx_gc_company_members_user_company ON gc_commerce.company_members (user_id, company_id);

-- -----------------------------------------------------------------------------
-- sellable_products
-- -----------------------------------------------------------------------------
CREATE TABLE gc_commerce.sellable_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_product_id UUID NOT NULL,
  sku TEXT NOT NULL,
  display_name TEXT NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  list_price_minor BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_gc_sellable_products_sku_nonempty CHECK (char_length(trim(sku)) > 0),
  CONSTRAINT ck_gc_sellable_products_display_name_nonempty CHECK (char_length(trim(display_name)) > 0),
  CONSTRAINT ck_gc_sellable_products_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_gc_sellable_products_list_price_minor CHECK (
    list_price_minor IS NULL OR list_price_minor >= 0
  ),
  CONSTRAINT uq_gc_sellable_products_sku UNIQUE (sku)
);

COMMENT ON TABLE gc_commerce.sellable_products IS
  'Sellable SKU; catalog_product_id is the master catalog UUID (wire FK in a later migration).';
COMMENT ON COLUMN gc_commerce.sellable_products.catalog_product_id IS
  'catalogos.products.id / canonical product UUID when catalog is coupled.';

CREATE UNIQUE INDEX uq_gc_sellable_products_one_active_per_catalog
  ON gc_commerce.sellable_products (catalog_product_id)
  WHERE is_active = TRUE;

CREATE INDEX idx_gc_sellable_products_catalog_product_id ON gc_commerce.sellable_products (catalog_product_id);

CREATE INDEX idx_gc_sellable_products_active ON gc_commerce.sellable_products (is_active)
  WHERE is_active = TRUE;

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
CREATE TABLE gc_commerce.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  created_by_user_id UUID,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  subtotal_minor BIGINT NOT NULL DEFAULT 0,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  shipping_minor BIGINT NOT NULL DEFAULT 0,
  tax_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL DEFAULT 0,
  shipping_address JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  idempotency_key TEXT,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_gc_orders_company FOREIGN KEY (company_id) REFERENCES gc_commerce.companies (id) ON DELETE RESTRICT,
  CONSTRAINT fk_gc_orders_created_by FOREIGN KEY (created_by_user_id) REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT uq_gc_orders_order_number UNIQUE (order_number),
  CONSTRAINT uq_gc_orders_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT ck_gc_orders_idempotency_key_nonempty CHECK (idempotency_key IS NULL OR char_length(trim(idempotency_key)) > 0),
  CONSTRAINT ck_gc_orders_status CHECK (
    status IN ('draft', 'pending', 'confirmed', 'paid', 'fulfilled', 'cancelled', 'refunded')
  ),
  CONSTRAINT ck_gc_orders_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_gc_orders_subtotal_minor CHECK (subtotal_minor >= 0),
  CONSTRAINT ck_gc_orders_discount_minor CHECK (discount_minor >= 0),
  CONSTRAINT ck_gc_orders_shipping_minor CHECK (shipping_minor >= 0),
  CONSTRAINT ck_gc_orders_tax_minor CHECK (tax_minor >= 0),
  CONSTRAINT ck_gc_orders_total_minor CHECK (total_minor >= 0),
  CONSTRAINT ck_gc_orders_discount_lte_subtotal CHECK (discount_minor <= subtotal_minor),
  CONSTRAINT ck_gc_orders_total_matches_components CHECK (
    total_minor = subtotal_minor - discount_minor + shipping_minor + tax_minor
  )
);

COMMENT ON TABLE gc_commerce.orders IS 'Canonical order header; all amounts in minor units.';

CREATE INDEX idx_gc_orders_company_id ON gc_commerce.orders (company_id);

CREATE INDEX idx_gc_orders_company_placed_at ON gc_commerce.orders (company_id, placed_at DESC);

CREATE INDEX idx_gc_orders_created_by_user_id ON gc_commerce.orders (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX idx_gc_orders_placed_at ON gc_commerce.orders (placed_at DESC);

CREATE INDEX idx_gc_orders_status ON gc_commerce.orders (status);

-- -----------------------------------------------------------------------------
-- order_lines
-- -----------------------------------------------------------------------------
CREATE TABLE gc_commerce.order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  sellable_product_id UUID NOT NULL,
  line_number INT NOT NULL,
  quantity INT NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  line_subtotal_minor BIGINT NOT NULL,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  tax_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL,
  product_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_gc_order_lines_order FOREIGN KEY (order_id) REFERENCES gc_commerce.orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_gc_order_lines_sellable_product FOREIGN KEY (sellable_product_id) REFERENCES gc_commerce.sellable_products (id) ON DELETE RESTRICT,
  CONSTRAINT uq_gc_order_lines_order_line_number UNIQUE (order_id, line_number),
  CONSTRAINT ck_gc_order_lines_line_number_positive CHECK (line_number > 0),
  CONSTRAINT ck_gc_order_lines_quantity_positive CHECK (quantity > 0),
  CONSTRAINT ck_gc_order_lines_unit_price_minor CHECK (unit_price_minor >= 0),
  CONSTRAINT ck_gc_order_lines_line_subtotal_minor CHECK (line_subtotal_minor >= 0),
  CONSTRAINT ck_gc_order_lines_discount_minor CHECK (discount_minor >= 0),
  CONSTRAINT ck_gc_order_lines_tax_minor CHECK (tax_minor >= 0),
  CONSTRAINT ck_gc_order_lines_total_minor CHECK (total_minor >= 0),
  CONSTRAINT ck_gc_order_lines_discount_lte_subtotal CHECK (discount_minor <= line_subtotal_minor),
  CONSTRAINT ck_gc_order_lines_total_matches_components CHECK (
    total_minor = line_subtotal_minor - discount_minor + tax_minor
  )
);

COMMENT ON TABLE gc_commerce.order_lines IS 'Order lines; immutable commercial snapshot in product_snapshot.';

CREATE INDEX idx_gc_order_lines_order_id ON gc_commerce.order_lines (order_id);

CREATE INDEX idx_gc_order_lines_order_line_number ON gc_commerce.order_lines (order_id, line_number);

CREATE INDEX idx_gc_order_lines_sellable_product_id ON gc_commerce.order_lines (sellable_product_id);

-- Grants
GRANT USAGE ON SCHEMA gc_commerce TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA gc_commerce TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA gc_commerce TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA gc_commerce
  GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA gc_commerce
  GRANT ALL ON SEQUENCES TO postgres, service_role;
