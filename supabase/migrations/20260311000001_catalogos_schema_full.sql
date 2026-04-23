-- =============================================================================
-- CatalogOS — Full production schema (Supabase Postgres)
-- UUID PKs, enums, FKs with sensible ON DELETE, indexes, check constraints.
-- Schema: catalogos (internal admin; live storefront stays in public).
-- =============================================================================

-- Enable UUID extension if not already
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS catalogos;

-- -----------------------------------------------------------------------------
-- Enums (reusable, clear constraints)
-- -----------------------------------------------------------------------------
CREATE TYPE catalogos.feed_type AS ENUM ('url', 'csv', 'api');
CREATE TYPE catalogos.batch_status AS ENUM ('running', 'completed', 'failed', 'cancelled');
CREATE TYPE catalogos.staging_status AS ENUM ('pending', 'approved', 'rejected', 'merged');
CREATE TYPE catalogos.value_type AS ENUM ('string', 'number', 'boolean', 'string_array');
CREATE TYPE catalogos.review_decision_type AS ENUM ('approved', 'rejected', 'merged');
CREATE TYPE catalogos.log_event_status AS ENUM ('started', 'success', 'failed');
CREATE TYPE catalogos.trigger_type AS ENUM ('manual', 'scheduled', 'api');
CREATE TYPE catalogos.pricing_rule_type AS ENUM ('default_margin', 'category_margin', 'supplier_margin', 'product_fixed');

-- -----------------------------------------------------------------------------
-- 1) suppliers
-- Core entity: who we ingest from. Slug for stable URLs; is_active for soft off.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_suppliers_slug UNIQUE (slug)
);

CREATE INDEX idx_suppliers_slug ON catalogos.suppliers (slug);
CREATE INDEX idx_suppliers_is_active ON catalogos.suppliers (is_active) WHERE is_active = true;

COMMENT ON TABLE catalogos.suppliers IS 'Supplier master; one row per vendor we ingest from.';

-- -----------------------------------------------------------------------------
-- 2) supplier_contacts
-- Optional contacts for POs/comms; is_primary for default.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.supplier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  role TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_contacts_supplier ON catalogos.supplier_contacts (supplier_id);

COMMENT ON TABLE catalogos.supplier_contacts IS 'Optional contacts per supplier for POs and communication.';

-- -----------------------------------------------------------------------------
-- 3) supplier_feeds
-- Per-supplier feed config (URL, CSV, API); schedule for future cron.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.supplier_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  feed_type catalogos.feed_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule_cron TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_feeds_supplier ON catalogos.supplier_feeds (supplier_id);
CREATE INDEX idx_supplier_feeds_is_active ON catalogos.supplier_feeds (is_active) WHERE is_active = true;

COMMENT ON TABLE catalogos.supplier_feeds IS 'Feed config per supplier (URL/CSV/API); schedule for automated runs.';

-- -----------------------------------------------------------------------------
-- 4) categories
-- Product categories; drive attribute_definitions and filtering.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_categories_slug UNIQUE (slug)
);

CREATE INDEX idx_categories_slug ON catalogos.categories (slug);

COMMENT ON TABLE catalogos.categories IS 'Product categories (e.g. disposable_gloves); drive attribute definitions.';

-- -----------------------------------------------------------------------------
-- 5) brands
-- Normalized brand names; master products reference brand.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_brands_slug UNIQUE (slug)
);

CREATE UNIQUE INDEX idx_brands_name_lower ON catalogos.brands (LOWER(name));

COMMENT ON TABLE catalogos.brands IS 'Normalized brands; products reference by id.';

-- -----------------------------------------------------------------------------
-- 6) attribute_definitions
-- Per-category attribute schema: key, type, required, filterable.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.attribute_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES catalogos.categories(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_type catalogos.value_type NOT NULL DEFAULT 'string',
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_filterable BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attribute_definitions_category_key UNIQUE (category_id, attribute_key)
);

CREATE INDEX idx_attribute_definitions_category ON catalogos.attribute_definitions (category_id);

COMMENT ON TABLE catalogos.attribute_definitions IS 'Attribute schema per category; required/filterable drive validation and UI.';

-- -----------------------------------------------------------------------------
-- 7) attribute_allowed_values
-- Allowed values for filterable enum-like attributes (e.g. color, size).
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.attribute_allowed_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_definition_id UUID NOT NULL REFERENCES catalogos.attribute_definitions(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number NUMERIC(20,6),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_value_present CHECK (
    (value_text IS NOT NULL AND value_number IS NULL) OR
    (value_text IS NULL AND value_number IS NOT NULL)
  ),
  CONSTRAINT uq_attribute_allowed_values_attr_text UNIQUE (attribute_definition_id, value_text)
);

CREATE INDEX idx_attribute_allowed_values_attr ON catalogos.attribute_allowed_values (attribute_definition_id);

COMMENT ON TABLE catalogos.attribute_allowed_values IS 'Allowed values per attribute (e.g. color=blue, black); one of value_text or value_number.';

-- -----------------------------------------------------------------------------
-- 8) products (master catalog)
-- Canonical products; published to public.products; soft deactivation via is_active.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES catalogos.categories(id) ON DELETE RESTRICT,
  brand_id UUID REFERENCES catalogos.brands(id) ON DELETE SET NULL,
  description TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ,
  live_product_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_products_sku UNIQUE (sku)
);

CREATE INDEX idx_products_sku ON catalogos.products (sku);
CREATE INDEX idx_products_category ON catalogos.products (category_id);
CREATE INDEX idx_products_brand ON catalogos.products (brand_id);
CREATE INDEX idx_products_is_active ON catalogos.products (is_active) WHERE is_active = true;
CREATE INDEX idx_products_attributes_gin ON catalogos.products USING GIN (attributes);

COMMENT ON TABLE catalogos.products IS 'Master product catalog; published to storefront; live_product_id links to public.products.';

-- -----------------------------------------------------------------------------
-- 9) product_attributes
-- Normalized attribute values per product for indexing/filtering.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.product_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalogos.products(id) ON DELETE CASCADE,
  attribute_definition_id UUID NOT NULL REFERENCES catalogos.attribute_definitions(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number NUMERIC(20,6),
  value_boolean BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_attributes_product_attr UNIQUE (product_id, attribute_definition_id),
  CONSTRAINT chk_product_attr_value CHECK (
    value_text IS NOT NULL OR value_number IS NOT NULL OR value_boolean IS NOT NULL
  )
);

CREATE INDEX idx_product_attributes_product ON catalogos.product_attributes (product_id);
CREATE INDEX idx_product_attributes_definition ON catalogos.product_attributes (attribute_definition_id);
CREATE INDEX idx_product_attributes_value_text ON catalogos.product_attributes (attribute_definition_id, value_text) WHERE value_text IS NOT NULL;
CREATE INDEX idx_product_attributes_value_number ON catalogos.product_attributes (attribute_definition_id, value_number) WHERE value_number IS NOT NULL;

COMMENT ON TABLE catalogos.product_attributes IS 'Normalized attribute values per product for filtering and matching.';

-- -----------------------------------------------------------------------------
-- 10) product_images
-- Multiple images per master product; sort_order for display.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalogos.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_images_product ON catalogos.product_images (product_id);

COMMENT ON TABLE catalogos.product_images IS 'Image URLs per master product; sort_order for gallery order.';

-- -----------------------------------------------------------------------------
-- 11) ingestion_jobs
-- Top-level job (e.g. nightly run) that can spawn multiple batches.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type catalogos.trigger_type NOT NULL DEFAULT 'manual',
  status catalogos.batch_status NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingestion_jobs_status ON catalogos.ingestion_jobs (status);
CREATE INDEX idx_ingestion_jobs_started ON catalogos.ingestion_jobs (started_at DESC);

COMMENT ON TABLE catalogos.ingestion_jobs IS 'Top-level ingestion run; can contain multiple import_batches.';

-- -----------------------------------------------------------------------------
-- 12) import_batches
-- One per feed/run; links to optional ingestion_job; traceability root.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_job_id UUID REFERENCES catalogos.ingestion_jobs(id) ON DELETE SET NULL,
  feed_id UUID REFERENCES catalogos.supplier_feeds(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  status catalogos.batch_status NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_batches_supplier ON catalogos.import_batches (supplier_id);
CREATE INDEX idx_import_batches_status ON catalogos.import_batches (status);
CREATE INDEX idx_import_batches_started ON catalogos.import_batches (started_at DESC);
CREATE INDEX idx_import_batches_job ON catalogos.import_batches (ingestion_job_id) WHERE ingestion_job_id IS NOT NULL;

COMMENT ON TABLE catalogos.import_batches IS 'One per ingestion run; stats hold raw_count, staged_count, error_count.';

-- -----------------------------------------------------------------------------
-- 13) import_batch_logs (batch-level events)
-- Step-level audit for each batch.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.import_batch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES catalogos.import_batches(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status catalogos.log_event_status NOT NULL,
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_batch_logs_batch ON catalogos.import_batch_logs (batch_id);
CREATE INDEX idx_import_batch_logs_created ON catalogos.import_batch_logs (batch_id, created_at);

COMMENT ON TABLE catalogos.import_batch_logs IS 'Per-batch step logs (ingest, normalize, match, etc.).';

-- -----------------------------------------------------------------------------
-- 14) ingestion_job_logs
-- Job-level or batch-level logs when job spans multiple batches.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.ingestion_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES catalogos.ingestion_jobs(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES catalogos.import_batches(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status catalogos.log_event_status NOT NULL,
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ingestion_job_log_ref CHECK (job_id IS NOT NULL OR batch_id IS NOT NULL)
);

CREATE INDEX idx_ingestion_job_logs_job ON catalogos.ingestion_job_logs (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_ingestion_job_logs_batch ON catalogos.ingestion_job_logs (batch_id) WHERE batch_id IS NOT NULL;

COMMENT ON TABLE catalogos.ingestion_job_logs IS 'Job- or batch-level step logs for audit.';

-- -----------------------------------------------------------------------------
-- 15) supplier_products_raw
-- Immutable raw rows; never overwrite; preserve full payload.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.supplier_products_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES catalogos.import_batches(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_supplier_products_raw_batch_supplier_external UNIQUE (batch_id, supplier_id, external_id)
);

CREATE INDEX idx_supplier_products_raw_batch ON catalogos.supplier_products_raw (batch_id);
CREATE INDEX idx_supplier_products_raw_supplier ON catalogos.supplier_products_raw (supplier_id);

COMMENT ON TABLE catalogos.supplier_products_raw IS 'Immutable raw supplier rows; full payload preserved; source for traceability.';

-- -----------------------------------------------------------------------------
-- 16) supplier_products_normalized (staging)
-- Normalized + extracted attributes; match to master; staging workflow.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.supplier_products_normalized (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES catalogos.import_batches(id) ON DELETE CASCADE,
  raw_id UUID NOT NULL REFERENCES catalogos.supplier_products_raw(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  normalized_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_confidence NUMERIC(5,4) CHECK (match_confidence >= 0 AND match_confidence <= 1),
  master_product_id UUID REFERENCES catalogos.products(id) ON DELETE SET NULL,
  status catalogos.staging_status NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_products_norm_batch ON catalogos.supplier_products_normalized (batch_id);
CREATE INDEX idx_supplier_products_norm_status ON catalogos.supplier_products_normalized (status);
CREATE INDEX idx_supplier_products_norm_master ON catalogos.supplier_products_normalized (master_product_id) WHERE master_product_id IS NOT NULL;
CREATE INDEX idx_supplier_products_norm_review_queue ON catalogos.supplier_products_normalized (status, created_at) WHERE status = 'pending';

COMMENT ON TABLE catalogos.supplier_products_normalized IS 'Staging: normalized + attributes; link to master; pending/approved/rejected/merged.';

-- -----------------------------------------------------------------------------
-- 17) supplier_offers
-- Many offers per master product; soft deactivation via is_active.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.supplier_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES catalogos.products(id) ON DELETE CASCADE,
  supplier_sku TEXT NOT NULL,
  cost NUMERIC(12,4) NOT NULL CHECK (cost >= 0),
  lead_time_days INT CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  raw_id UUID REFERENCES catalogos.supplier_products_raw(id) ON DELETE SET NULL,
  normalized_id UUID REFERENCES catalogos.supplier_products_normalized(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_supplier_offers_supplier_product_sku UNIQUE (supplier_id, product_id, supplier_sku)
);

CREATE INDEX idx_supplier_offers_supplier ON catalogos.supplier_offers (supplier_id);
CREATE INDEX idx_supplier_offers_product ON catalogos.supplier_offers (product_id);
CREATE INDEX idx_supplier_offers_is_active ON catalogos.supplier_offers (is_active) WHERE is_active = true;

COMMENT ON TABLE catalogos.supplier_offers IS 'Supplier-specific offer for a master product; cost and lead time; trace to raw/normalized.';

-- -----------------------------------------------------------------------------
-- 18) pricing_rules
-- Margin or fixed price by default/category/supplier/product.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type catalogos.pricing_rule_type NOT NULL,
  scope_category_id UUID REFERENCES catalogos.categories(id) ON DELETE CASCADE,
  scope_supplier_id UUID REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  scope_product_id UUID REFERENCES catalogos.products(id) ON DELETE CASCADE,
  margin_percent NUMERIC(8,4) CHECK (margin_percent IS NULL OR (margin_percent >= 0 AND margin_percent <= 999.9999)),
  fixed_price NUMERIC(12,4) CHECK (fixed_price IS NULL OR fixed_price >= 0),
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pricing_rule_value CHECK (
    (margin_percent IS NOT NULL AND fixed_price IS NULL) OR
    (margin_percent IS NULL AND fixed_price IS NOT NULL)
  )
);

CREATE INDEX idx_pricing_rules_type ON catalogos.pricing_rules (rule_type);
CREATE INDEX idx_pricing_rules_priority ON catalogos.pricing_rules (priority DESC);

COMMENT ON TABLE catalogos.pricing_rules IS 'Pricing: default_margin, category_margin, supplier_margin, or product_fixed; priority for precedence.';

-- -----------------------------------------------------------------------------
-- 19) publish_events
-- Audit: what was published when and by whom; link to live product.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.publish_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_id UUID NOT NULL REFERENCES catalogos.supplier_products_normalized(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES catalogos.products(id) ON DELETE CASCADE,
  live_product_id BIGINT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by TEXT
);

CREATE INDEX idx_publish_events_product ON catalogos.publish_events (product_id);
CREATE INDEX idx_publish_events_normalized ON catalogos.publish_events (normalized_id);
CREATE INDEX idx_publish_events_published_at ON catalogos.publish_events (published_at DESC);

COMMENT ON TABLE catalogos.publish_events IS 'Audit of staging → master publish; live_product_id = public.products.id for traceability.';

-- -----------------------------------------------------------------------------
-- 20) review_decisions
-- Audit of approve/reject/merge per normalized row.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.review_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_id UUID NOT NULL REFERENCES catalogos.supplier_products_normalized(id) ON DELETE CASCADE,
  decision catalogos.review_decision_type NOT NULL,
  master_product_id UUID REFERENCES catalogos.products(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_decisions_normalized ON catalogos.review_decisions (normalized_id);
CREATE INDEX idx_review_decisions_decided_at ON catalogos.review_decisions (decided_at DESC);

COMMENT ON TABLE catalogos.review_decisions IS 'Audit of review actions: approved, rejected, or merged into master_product_id.';

-- -----------------------------------------------------------------------------
-- updated_at triggers (shared)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION catalogos.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'suppliers', 'supplier_contacts', 'supplier_feeds', 'categories', 'brands',
      'attribute_definitions', 'products', 'supplier_products_normalized',
      'supplier_offers'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS tr_%I_updated_at ON catalogos.%I',
      t, t
    );
    EXECUTE format(
      'CREATE TRIGGER tr_%I_updated_at BEFORE UPDATE ON catalogos.%I FOR EACH ROW EXECUTE PROCEDURE catalogos.set_updated_at()',
      t, t
    );
  END LOOP;
END $$;
