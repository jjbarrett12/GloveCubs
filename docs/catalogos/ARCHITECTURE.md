# CatalogOS — Architecture Overview

## Purpose

Agentic catalog operating system for GloveCubs: ingest supplier feeds → normalize → extract attributes → match to master catalog → create supplier offers → review → publish to live storefront. Eliminates manual product entry where possible.

## Principles

- **Never overwrite raw supplier data** — all raw rows immutable, keyed by batch + supplier + external_id.
- **Traceability** — every ingestion run has a batch; every published product traces back to source supplier rows.
- **Deterministic first, AI second** — rules-based parsing and matching; AI for fallback extraction and ambiguity.
- **Staging gate** — all imports land in staging; publish only from approved staging records.
- **Tenant-safe** — schema and queries ready for future tenant_id if needed.

## Data Flow

```
Supplier feeds (CSV/URL/API)
    → Import batch created
    → Raw supplier products stored (immutable)
    → Normalization (rules + optional AI)
    → Staging products (normalized + attributes)
    → Matching to master_products (UPC / attributes, confidence score)
    → Supplier offers (supplier + master + cost/lead time)
    → Review queue (approve / reject / merge / create master)
    → Publish: approved staging → master_products + supplier_offers → live products table
```

## Core Domains

| Domain | Purpose |
|--------|---------|
| **suppliers** | Supplier metadata, slug, settings, active flag |
| **supplier_feeds** | Per-supplier feed config (URL, CSV, API), schedule |
| **import_batches** | One per ingestion run; status, stats, timestamps |
| **raw_supplier_products** | Immutable raw rows per batch; external_id, raw_json |
| **staging_products** | Normalized + extracted attributes; link to master; status pending/approved/rejected |
| **attribute_definitions** | Category-scoped attribute keys, labels, types, allowed values |
| **master_products** | Canonical catalog (SKU, name, category, attributes); published products derived from here |
| **master_product_variants** | Optional size/variant SKUs under a master |
| **supplier_offers** | Supplier + master_product + supplier_sku, cost, lead_time; source raw/staging |
| **pricing_rules** | Margin/fixed rules by category, supplier, or product |
| **job_logs** | Per-batch step logs (ingest, normalize, match, publish) |
| **publish_log** | Audit: staging_id → master_id, published_at, published_by |

## Tech Stack

- Next.js 14+ App Router, TypeScript, TailwindCSS, shadcn/ui
- Supabase: Postgres, Auth, Storage
- Server Actions for mutations; Route handlers for ingestion APIs and batch jobs
- Zod for server-side validation

## Phased Implementation

- **Phase 1**: DB schema, attribute definitions (disposable gloves), types/Zod, ingestion pipeline (URL/CSV → raw → normalize → staging), simple matching (UPC + attributes), pricing stub, review queue list/detail, publish workflow (staging → master + offer → products).
- **Phase 2**: Feed scheduling, AI fallback extraction, confidence tuning, pricing rules engine, anomaly detection.
- **Phase 3**: Multi-category expansion, SourceIt reuse prep, nightly sync automation.

## Live Catalog Integration

CatalogOS writes **master_products** and **supplier_offers**. On **publish**, the system:

1. Ensures a **manufacturers** row (by supplier/brand) and **master_products** row.
2. Inserts or updates the storefront **products** table from the approved staging + master + pricing.
3. Records **publish_log** and links product to source staging/batch/supplier for traceability.

Existing GloveCubs tables used: `products`, `manufacturers`.
