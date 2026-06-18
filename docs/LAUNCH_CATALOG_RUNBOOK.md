# GloveCubs launch catalog runbook (quote-first B2B)

Operator-assisted catalog go-live for the Next storefront. **Canonical publish is CatalogOS `runPublish` only.**

## What not to use

- Storefront product editor **Publish** / `status=active` (blocked unless `GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH=1`)
- Legacy `public.products` writes
- Express catalog import/publish routes
- Staging promote routes that only create drafts (they never replace CatalogOS publish)

## Canonical path

1. **Import** — `/admin/products/import/url` or CatalogOS URL import job
2. **Review staged data** — CatalogOS `/dashboard/review` (storefront `/admin/products/review` is visibility only)
3. **Fix manufacturer SKU, variants, case/pallet packaging, attributes, image**
4. **Publish** — CatalogOS `/dashboard/publish` → `runPublish`
5. **Verify storefront** — `/store`, PDP `/store/p/[slug]`, quote cart add

Storefront reads **`catalog_v2.catalog_products`**, **`catalog_v2.catalog_variants`**, and offer/list price views — not legacy `public.products`.

## Publish one product (URL import)

1. Paste supplier URL at `/admin/products/import/url` (or run CatalogOS URL import).
2. Open CatalogOS review for the batch/job; confirm title, brand, slug, variants, manufacturer SKUs, case sell unit, units per case, primary image.
3. Confirm size order: XS, S, M, L, XL, 2XL, 3XL — manufacturer SKU is distinct per size; internal GLV/GC SKU is not the manufacturer SKU.
4. Publish from CatalogOS review/publish when readiness passes.
5. Smoke:
   - Product appears on `/store`
   - PDP loads with case/pallet quote context
   - Quote cart accepts the product (no checkout)

## Publish 10+ products for launch

Repeat the single-product flow. Track progress with:

```bash
cd storefront
node scripts/launch-catalog-readiness.mjs --min=10
```

Read-only report: active product count, missing slug/image/variant/price signals. Does **not** publish or mutate data.

Target: **≥10 active** `catalog_v2.catalog_products` with at least one active variant and storefront-visible offer/list price.

### Operator seed script (CatalogOS runPublish)

After URL imports are staged, or to publish draft masters created from prior imports:

```bash
cd catalogos
GLOVECUBS_LAUNCH_CATALOG_SEED=1 GLOVECUBS_URL_EXTRACTION_V2=true \
  npx tsx --tsconfig tsconfig.json scripts/launch-catalog-seed-publish.mjs
```

Re-publish draft masters only (no re-crawl):

```bash
GLOVECUBS_LAUNCH_CATALOG_SEED=1 npx tsx --tsconfig tsconfig.json scripts/launch-catalog-seed-publish.mjs --publish-drafts-only
```

Readiness report:

```bash
cd storefront
node scripts/launch-catalog-readiness.mjs --min=10
```

## Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CATALOGOS_URL` | Operator deep links from storefront admin |
| `CATALOGOS_INTERNAL_URL` / `INTERNAL_API_KEY` | Storefront → CatalogOS internal import/review |
| `GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID` | Only if emergency manual active side effects needed |
| `GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH=1` | **Non-production only** — re-enables storefront active flip |

Production should leave emergency flag **unset**.

## Production smoke after deploy

1. `/admin/products/review` — canonical publish banner, no HTTP 500
2. CatalogOS publish one staged SKU → verify `/store` + PDP + quote cart
3. Confirm storefront editor **Publish** is disabled with CatalogOS link
4. `node scripts/launch-catalog-readiness.mjs --min=10` → meets launch threshold

## Launch readiness fields (minimum)

- Name/title, slug, brand (when available)
- ≥1 variant with size + manufacturer SKU rules satisfied
- Case sell unit + units per case (disposable gloves)
- List/best offer price (quote-first; quote-only OK)
- Primary image when available
- `catalog_v2` status active after CatalogOS publish
