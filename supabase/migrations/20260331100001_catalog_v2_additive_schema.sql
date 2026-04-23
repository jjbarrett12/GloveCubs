-- =============================================================================
-- Catalog schema v2 (ADDITIVE) — long-term product / variant / supplier model
-- =============================================================================
-- Purpose:
--   Introduces UUID-first tables for canonical catalog, sellable variants,
--   supplier identity & commercial terms, staging, matching review, publish
--   state, and audit/events. Does NOT drop or alter legacy public.products.
--
-- Schema: catalog_v2 (keeps boundaries clear vs public.* and catalogos.*)
-- Prerequisites: extensions pgcrypto; catalogos.suppliers (UUID) if using
--   supplier FKs; public.products (BIGINT) optional for legacy bridge column.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS catalog_v2;

COMMENT ON SCHEMA catalog_v2 IS 'Long-term catalog model (products → variants → offers → inventory). Additive alongside legacy public.products.';

-- -----------------------------------------------------------------------------
-- catalog_product_types
-- -----------------------------------------------------------------------------
-- What it is: Taxonomy of sellable product families (e.g. disposable_nitrile,
--   reusable_work_glove). Drives which attribute_definitions apply and how
--   new product lines extend the catalog without schema churn.
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_product_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_type_id UUID REFERENCES catalog_v2.catalog_product_types(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalog_product_types_code UNIQUE (code)
);

CREATE INDEX idx_catalog_product_types_parent ON catalog_v2.catalog_product_types (parent_type_id) WHERE parent_type_id IS NOT NULL;
CREATE INDEX idx_catalog_product_types_active ON catalog_v2.catalog_product_types (is_active) WHERE is_active = true;

COMMENT ON TABLE catalog_v2.catalog_product_types IS 'Product-line / family types; parent_type_id supports hierarchy (e.g. gloves → disposable → nitrile).';

-- -----------------------------------------------------------------------------
-- catalog_products
-- -----------------------------------------------------------------------------
-- What it is: Canonical parent product (marketing identity, one PDP parent).
--   Variants (size, color, pack, …) hang under this row. Not the legacy
--   public.products row — link optionally via legacy_public_product_id.
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id UUID NOT NULL REFERENCES catalog_v2.catalog_product_types(id) ON DELETE RESTRICT,
  brand_id UUID REFERENCES catalogos.brands(id) ON DELETE SET NULL,
  manufacturer_id BIGINT REFERENCES public.manufacturers(id) ON DELETE SET NULL,
  slug TEXT NOT NULL,
  internal_sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  legacy_public_product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalog_products_slug UNIQUE (slug)
);

CREATE INDEX idx_catalog_products_type ON catalog_v2.catalog_products (product_type_id);
CREATE INDEX idx_catalog_products_brand ON catalog_v2.catalog_products (brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX idx_catalog_products_manufacturer ON catalog_v2.catalog_products (manufacturer_id) WHERE manufacturer_id IS NOT NULL;
CREATE INDEX idx_catalog_products_status ON catalog_v2.catalog_products (status);
CREATE INDEX idx_catalog_products_legacy ON catalog_v2.catalog_products (legacy_public_product_id) WHERE legacy_public_product_id IS NOT NULL;
CREATE INDEX idx_catalog_products_name_search ON catalog_v2.catalog_products USING gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '')));

COMMENT ON TABLE catalog_v2.catalog_products IS 'Canonical catalog parent (one merchandising product); variants are sellable SKUs underneath.';
COMMENT ON COLUMN catalog_v2.catalog_products.legacy_public_product_id IS 'Optional bridge to legacy public.products during migration; not required for new rows.';

-- -----------------------------------------------------------------------------
-- catalog_variants
-- -----------------------------------------------------------------------------
-- What it is: Sellable SKU / variant (size, color, thickness, pack, etc.).
--   Inventory, supplier maps, and publish flags attach here.
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_product_id UUID NOT NULL REFERENCES catalog_v2.catalog_products(id) ON DELETE CASCADE,
  variant_sku TEXT NOT NULL,
  gtin TEXT,
  mpn TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  attribute_signature TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalog_variants_sku UNIQUE (variant_sku)
);

CREATE INDEX idx_catalog_variants_product ON catalog_v2.catalog_variants (catalog_product_id);
CREATE INDEX idx_catalog_variants_active ON catalog_v2.catalog_variants (catalog_product_id, is_active) WHERE is_active = true;
CREATE INDEX idx_catalog_variants_gtin ON catalog_v2.catalog_variants (gtin) WHERE gtin IS NOT NULL;

COMMENT ON TABLE catalog_v2.catalog_variants IS 'Sellable variant / SKU under a catalog_product; primary target for supplier map, inventory, and pricing rows.';
COMMENT ON COLUMN catalog_v2.catalog_variants.attribute_signature IS 'Optional hash or normalized key of defining attributes for deduplication / matching.';

-- -----------------------------------------------------------------------------
-- catalog_attribute_definitions
-- -----------------------------------------------------------------------------
-- What it is: Attribute schema per product type (size, color, mil, powder-free).
--   Separates “what we index/filter on” from free-form JSON on ingest.
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_attribute_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id UUID NOT NULL REFERENCES catalog_v2.catalog_product_types(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'enum', 'string_array')),
  unit TEXT,
  allowed_values JSONB,
  is_variant_axis BOOLEAN NOT NULL DEFAULT false,
  is_filterable BOOLEAN NOT NULL DEFAULT true,
  is_searchable BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalog_attr_def_type_key UNIQUE (product_type_id, attribute_key)
);

CREATE INDEX idx_catalog_attr_def_type ON catalog_v2.catalog_attribute_definitions (product_type_id);
CREATE INDEX idx_catalog_attr_def_filter ON catalog_v2.catalog_attribute_definitions (product_type_id, is_filterable) WHERE is_filterable = true;

COMMENT ON TABLE catalog_v2.catalog_attribute_definitions IS 'Per–product-type attribute schema; powers variant values and storefront filters.';

-- -----------------------------------------------------------------------------
-- catalog_variant_attribute_values
-- -----------------------------------------------------------------------------
-- What it is: EAV values for a variant. Prefer value_text for enums/strings;
--   value_number / value_boolean when typed; value_jsonb for arrays or complex.
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_variant_attribute_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_variant_id UUID NOT NULL REFERENCES catalog_v2.catalog_variants(id) ON DELETE CASCADE,
  attribute_definition_id UUID NOT NULL REFERENCES catalog_v2.catalog_attribute_definitions(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number NUMERIC,
  value_boolean BOOLEAN,
  value_jsonb JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_variant_attr_one_per_def UNIQUE (catalog_variant_id, attribute_definition_id)
);

CREATE INDEX idx_variant_attr_variant ON catalog_v2.catalog_variant_attribute_values (catalog_variant_id);
CREATE INDEX idx_variant_attr_def ON catalog_v2.catalog_variant_attribute_values (attribute_definition_id);
CREATE INDEX idx_variant_attr_filter_text ON catalog_v2.catalog_variant_attribute_values (attribute_definition_id, value_text);
CREATE INDEX idx_variant_attr_filter_num ON catalog_v2.catalog_variant_attribute_values (attribute_definition_id, value_number);

COMMENT ON TABLE catalog_v2.catalog_variant_attribute_values IS 'Typed attribute values per variant; supports faceted search when combined with definitions.';

-- -----------------------------------------------------------------------------
-- supplier_products
-- -----------------------------------------------------------------------------
-- What it is: Supplier’s own catalog identity (their SKU / row), before or
--   alongside mapping to our catalog_variant.
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  external_id TEXT,
  supplier_sku TEXT,
  name TEXT,
  brand_text TEXT,
  raw_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_batch_id UUID REFERENCES catalogos.import_batches(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_products_supplier ON catalog_v2.supplier_products (supplier_id);
CREATE INDEX idx_supplier_products_sku ON catalog_v2.supplier_products (supplier_id, supplier_sku);
CREATE INDEX idx_supplier_products_raw_gin ON catalog_v2.supplier_products USING gin (raw_attributes);
-- One row per supplier stable external id (NULL external_id allowed for legacy rows without dedupe key)
CREATE UNIQUE INDEX uq_supplier_products_supplier_external_id ON catalog_v2.supplier_products (supplier_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX uq_supplier_products_supplier_sku_nn ON catalog_v2.supplier_products (supplier_id, supplier_sku) WHERE supplier_sku IS NOT NULL;

COMMENT ON TABLE catalog_v2.supplier_products IS 'Supplier-native product row; external_id + supplier_id should be stable across feed versions.';
COMMENT ON COLUMN catalog_v2.supplier_products.source_batch_id IS 'Optional link to catalogos.import_batches for provenance.';

-- -----------------------------------------------------------------------------
-- supplier_offers
-- -----------------------------------------------------------------------------
-- What it is: Commercial terms for a supplier_product (cost, MOQ, lead time).
--   Multiple rows over time = price history via effective_from / effective_to.
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.supplier_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id UUID NOT NULL REFERENCES catalog_v2.supplier_products(id) ON DELETE CASCADE,
  unit_cost NUMERIC(14, 4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  moq INT,
  lead_time_days INT,
  supplier_sku TEXT,
  pack_size INT,
  unit_of_measure TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_offers_product ON catalog_v2.supplier_offers (supplier_product_id);
CREATE INDEX idx_supplier_offers_effective ON catalog_v2.supplier_offers (supplier_product_id, effective_from, effective_to);
CREATE INDEX idx_supplier_offers_active ON catalog_v2.supplier_offers (supplier_product_id) WHERE is_active = true;

COMMENT ON TABLE catalog_v2.supplier_offers IS 'Supplier commercial offer lines; tie to supplier_product, not directly to public.products.';

-- -----------------------------------------------------------------------------
-- catalog_supplier_product_map
-- -----------------------------------------------------------------------------
-- What it is: Many supplier rows can map to one canonical variant; enforces
--   at most one variant target per supplier_product for the primary link.
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_supplier_product_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id UUID NOT NULL REFERENCES catalog_v2.supplier_products(id) ON DELETE CASCADE,
  catalog_variant_id UUID NOT NULL REFERENCES catalog_v2.catalog_variants(id) ON DELETE CASCADE,
  match_confidence NUMERIC(5, 4),
  match_method TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_map_supplier_product UNIQUE (supplier_product_id)
);

CREATE INDEX idx_catalog_map_variant ON catalog_v2.catalog_supplier_product_map (catalog_variant_id);

COMMENT ON TABLE catalog_v2.catalog_supplier_product_map IS 'Links supplier_product → catalog_variant (sellable identity); one primary variant per supplier row.';

-- -----------------------------------------------------------------------------
-- variant_inventory
-- -----------------------------------------------------------------------------
-- What it is: Stock buckets per variant and location (warehouse, channel pool).
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.variant_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_variant_id UUID NOT NULL REFERENCES catalog_v2.catalog_variants(id) ON DELETE CASCADE,
  location_code TEXT NOT NULL DEFAULT 'default',
  quantity_on_hand INT NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved INT NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_variant_inventory_location UNIQUE (catalog_variant_id, location_code)
);

CREATE INDEX idx_variant_inventory_variant ON catalog_v2.variant_inventory (catalog_variant_id);

COMMENT ON TABLE catalog_v2.variant_inventory IS 'Inventory is variant-scoped (not legacy product-wide); supports multi-location via location_code.';

-- -----------------------------------------------------------------------------
-- catalog_product_images
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_product_id UUID NOT NULL REFERENCES catalog_v2.catalog_products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalog_product_images_product ON catalog_v2.catalog_product_images (catalog_product_id, sort_order);

COMMENT ON TABLE catalog_v2.catalog_product_images IS 'Gallery images at parent product level (shared PDP hero / lifestyle).';

-- -----------------------------------------------------------------------------
-- catalog_variant_images
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_variant_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_variant_id UUID NOT NULL REFERENCES catalog_v2.catalog_variants(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalog_variant_images_variant ON catalog_v2.catalog_variant_images (catalog_variant_id, sort_order);

COMMENT ON TABLE catalog_v2.catalog_variant_images IS 'Variant-specific imagery (e.g. color swatch, carton shot per SKU).';

-- -----------------------------------------------------------------------------
-- catalog_publish_state
-- -----------------------------------------------------------------------------
-- What it is: Which variants are live to which channels; separate from is_active
--   (draft quality) vs published (customer-visible).
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_publish_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_variant_id UUID NOT NULL REFERENCES catalog_v2.catalog_variants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'storefront',
  is_published BOOLEAN NOT NULL DEFAULT false,
  first_published_at TIMESTAMPTZ,
  last_published_at TIMESTAMPTZ,
  publish_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalog_publish_variant_channel UNIQUE (catalog_variant_id, channel)
);

CREATE INDEX idx_catalog_publish_published ON catalog_v2.catalog_publish_state (channel, is_published) WHERE is_published = true;

COMMENT ON TABLE catalog_v2.catalog_publish_state IS 'Per-variant, per-channel publish flags and timestamps for storefront / marketplaces.';

-- -----------------------------------------------------------------------------
-- catalog_staging_products
-- -----------------------------------------------------------------------------
-- What it is: Raw or normalized ingest before promotion to catalog_products.
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_staging_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES catalogos.suppliers(id) ON DELETE SET NULL,
  source_batch_id UUID REFERENCES catalogos.import_batches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'normalizing', 'ready', 'rejected', 'promoted')),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_name TEXT,
  normalized_brand TEXT,
  checksum TEXT,
  promoted_catalog_product_id UUID REFERENCES catalog_v2.catalog_products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalog_staging_products_supplier ON catalog_v2.catalog_staging_products (supplier_id);
CREATE INDEX idx_catalog_staging_products_status ON catalog_v2.catalog_staging_products (status);
CREATE INDEX idx_catalog_staging_products_batch ON catalog_v2.catalog_staging_products (source_batch_id);
CREATE INDEX idx_catalog_staging_products_checksum ON catalog_v2.catalog_staging_products (checksum) WHERE checksum IS NOT NULL;

COMMENT ON TABLE catalog_v2.catalog_staging_products IS 'Inbound catalog parent rows prior to canonical catalog_products creation.';

-- -----------------------------------------------------------------------------
-- catalog_staging_variants
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_staging_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_product_id UUID NOT NULL REFERENCES catalog_v2.catalog_staging_products(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'rejected', 'promoted')),
  proposed_variant_sku TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  promoted_catalog_variant_id UUID REFERENCES catalog_v2.catalog_variants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalog_staging_variants_product ON catalog_v2.catalog_staging_variants (staging_product_id);
CREATE INDEX idx_catalog_staging_variants_status ON catalog_v2.catalog_staging_variants (status);

COMMENT ON TABLE catalog_v2.catalog_staging_variants IS 'Inbound variant rows under a staging product; feeds match_reviews and promotion.';

-- -----------------------------------------------------------------------------
-- catalog_match_reviews
-- -----------------------------------------------------------------------------
-- What it is: Human or workflow queue for uncertain supplier→variant matches.
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_match_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id UUID REFERENCES catalog_v2.supplier_products(id) ON DELETE SET NULL,
  staging_variant_id UUID REFERENCES catalog_v2.catalog_staging_variants(id) ON DELETE SET NULL,
  proposed_catalog_variant_id UUID REFERENCES catalog_v2.catalog_variants(id) ON DELETE SET NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'merged', 'deferred')),
  resolution_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_catalog_match_reviews_subject CHECK (
    supplier_product_id IS NOT NULL OR staging_variant_id IS NOT NULL
  )
);

CREATE INDEX idx_catalog_match_reviews_status ON catalog_v2.catalog_match_reviews (review_status);
CREATE INDEX idx_catalog_match_reviews_pending ON catalog_v2.catalog_match_reviews (created_at) WHERE review_status = 'pending';
CREATE INDEX idx_catalog_match_reviews_supplier_product ON catalog_v2.catalog_match_reviews (supplier_product_id);
CREATE INDEX idx_catalog_match_reviews_staging_var ON catalog_v2.catalog_match_reviews (staging_variant_id);

COMMENT ON TABLE catalog_v2.catalog_match_reviews IS 'Operator review queue for staging/supplier rows proposed to map to catalog_variants.';

-- -----------------------------------------------------------------------------
-- catalog_events (outbox / integration stream)
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX idx_catalog_events_unprocessed ON catalog_v2.catalog_events (created_at) WHERE processed_at IS NULL;
CREATE INDEX idx_catalog_events_aggregate ON catalog_v2.catalog_events (aggregate_type, aggregate_id);

COMMENT ON TABLE catalog_v2.catalog_events IS 'Append-only domain events for async consumers (search index, webhooks, analytics).';

-- -----------------------------------------------------------------------------
-- catalog_audit_log
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.catalog_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type TEXT,
  actor_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  correlation_id UUID,
  request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_catalog_audit_entity ON catalog_v2.catalog_audit_log (entity_type, entity_id);
CREATE INDEX idx_catalog_audit_occurred ON catalog_v2.catalog_audit_log (occurred_at DESC);
CREATE INDEX idx_catalog_audit_correlation ON catalog_v2.catalog_audit_log (correlation_id) WHERE correlation_id IS NOT NULL;

COMMENT ON TABLE catalog_v2.catalog_audit_log IS 'Compliance / debugging audit trail for catalog mutations (who changed what, when).';
