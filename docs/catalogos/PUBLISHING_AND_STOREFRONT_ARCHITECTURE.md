# CatalogOS — Publishing + Live Product Attributes + Storefront Filtering

## 1. Architecture overview

When a staged product is **approved** (match to existing master, or create new master, or merge), the system can **publish** it into the live catalog:

1. **Master product** — Create or update `catalogos.products` (sku, name, category_id, brand_id, description, slug, is_active, published_at).
2. **Product attributes** — Persist filter attributes into `catalogos.product_attributes` (one row per product per attribute_definition; single-select overwrites; multi-select stored as comma-separated in value_text).
3. **Supplier offer** — Upsert `catalogos.supplier_offers` (supplier_id, product_id, supplier_sku, cost, raw_id, normalized_id); unique on (supplier_id, product_id, supplier_sku).
4. **Traceability** — `supplier_products_normalized.master_product_id`, `supplier_offers.normalized_id` / `raw_id`, and `catalogos.publish_events` (normalized_id, product_id, published_at, published_by).
5. **Idempotency** — Re-approve / re-publish updates the same product and offer; no duplicate attribute rows (upsert by product_id + attribute_definition_id); no duplicate offers (upsert by supplier_id, product_id, supplier_sku).

**Storefront** consumes the live catalog:

- **Query layer** — List products with filters (attributes, price range, brand, category), pagination, sort (relevance, price asc/desc, newest).
- **Facet aggregation** — For the current result set, count products per filter value (material, size, color, thickness_mil, etc.) for the sidebar.
- **API** — GET products (with query params), GET facet counts, GET product by slug, GET product offers summary.

**Tech:** Next.js 14 App Router, TypeScript, Supabase Postgres (catalogos schema), Tailwind/shadcn, Zod. No separate storefront DB; catalogos.products + product_attributes + supplier_offers are the source of truth for the storefront.

---

## 2. File structure

```
catalogos/
├── src/
│   ├── app/
│   │   ├── actions/
│   │   │   └── review.ts              # extend: approveMatch, createNewMasterProduct, mergeWithStaged → optional publish
│   │   ├── api/
│   │   │   └── catalog/
│   │   │       ├── products/
│   │   │       │   └── route.ts       # GET list + filters + pagination + sort
│   │   │       ├── facets/
│   │   │       │   └── route.ts       # GET facet counts for current filter state
│   │   │       ├── product/
│   │   │       │   └── [slug]/
│   │   │       │       └── route.ts   # GET product by slug
│   │   │       └── product/
│   │   │           └── [slug]/
│   │   │               └── offers/
│   │   │                   └── route.ts # GET offers summary for product
│   │   └── (dashboard)/...
│   └── lib/
│       ├── publish/
│       │   ├── types.ts               # PublishInput, PublishResult, etc.
│       │   ├── publish-service.ts    # runPublish: create/update product, sync attributes, upsert offer, publish_event
│       │   ├── product-attribute-sync.ts # syncProductAttributesFromStaged
│       │   └── index.ts
│       ├── catalog/
│       │   ├── types.ts               # StorefrontFilterParams, ProductListPayload, FacetCounts, etc.
│       │   ├── query.ts               # listLiveProducts, buildFilterConditions
│       │   ├── facets.ts              # getFacetCounts
│       │   └── index.ts
│       └── db/
│           └── client.ts              # existing getSupabaseCatalogos
supabase/migrations/
└── 20260318000001_products_slug.sql   # add slug to catalogos.products
```

---

## 3. DB changes

- **catalogos.products**: add `slug TEXT UNIQUE` (nullable until backfilled; then NOT NULL). Used for storefront URLs and product detail.
- **catalogos.product_attributes**: existing; single row per (product_id, attribute_definition_id). Multi-select stored as comma-separated `value_text`.
- **catalogos.publish_events**: existing; no change.
- **Indexes**: index on `catalogos.products(slug)` for lookups; existing GIN on products.attributes can remain for legacy; primary filter path uses product_attributes.

---

## 4–11. Implementation summary

- **Types**: `lib/catalog/types.ts`, `lib/publish/types.ts`, `lib/catalog/filter-ui-contract.ts`.
- **Publish service**: `lib/publish/publish-service.ts` (runPublish, buildPublishInputFromStaged); idempotent product upsert, attribute sync, supplier_offers upsert, publish_events insert.
- **Product attribute sync**: `lib/publish/product-attribute-sync.ts` (syncProductAttributesFromStaged, getAttributeDefinitionIdsByKey); single-select overwrite, multi-select comma-separated in value_text.
- **Catalog query**: `lib/catalog/query.ts` (listLiveProducts, getProductBySlug, getFilteredProductIds); filter by product_attributes, price_min/max, category; sort newest/price_asc/price_desc.
- **Facet aggregation**: `lib/catalog/facets.ts` (getFacetCounts, getPriceBounds); counts per attribute value for current result set.
- **API routes**: GET `/api/catalog/products`, GET `/api/catalog/facets`, GET `/api/catalog/product/[slug]`, GET `/api/catalog/product/[slug]/offers`.
- **Review integration**: `app/actions/review.ts` — approveMatch, createNewMasterProduct, mergeWithStaged accept optional `ReviewOptions { publishToLive?, publishedBy? }`; when publishToLive, load staged row and run runPublish.

## Performance and indexing

- **products**: index on (is_active), (slug), (category_id), (brand_id). GIN on attributes if querying JSONB.
- **product_attributes**: unique (product_id, attribute_definition_id); index on (attribute_definition_id, value_text) for filter lookups.
- **supplier_offers**: index on (product_id), (supplier_id), (is_active). Unique (supplier_id, product_id, supplier_sku) for upsert.
- **publish_events**: index on (product_id), (normalized_id), (published_at DESC).
- For large catalogs, consider a materialized view or RPC that returns product IDs matching filters in one query, then paginate products. Current implementation fetches filtered IDs then products; for very large attribute sets, an RPC `catalogos.list_live_product_ids(filters jsonb)` could reduce round-trips.
