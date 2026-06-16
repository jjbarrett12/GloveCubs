# Product Setup SKU QA — Phase 3C

Manual checklist for clipboard URL import, GLV SKU proposals, and collision readiness.

## A. Stage Hospeco URL

Paste a Hospeco-style disposable glove URL (or use staged fixture) into admin URL clipboard staging.

**Important:** Dismiss or ignore legacy staging rows with `productExtraction.v1`. Re-stage after parser upgrades.

Audit stale rows:

```bash
node scripts/audit-stale-product-import-staging.mjs --url hospeco
```

Recommended: dismiss old rows, then stage fresh:

`https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl`

Confirm new draft uses `productExtraction.v2` and `size_source: main_product_id` on variants.

## B. Confirm sizes

Import intelligence / variant evidence should show: **XS, S, M, L, XL**

## C. Confirm manufacturer SKUs separately

Variant matrix / SKU proposal table should show manufacturer SKUs such as:

- GL-N125F-XS … GL-N125F-XL

These must not appear in the GloveCubs variant SKU column.

## D. Confirm parent proposal

**GLV-GL-N125** with high confidence when multi-size manufacturer SKUs agree.

## E. Confirm variant proposals

| Size | GloveCubs SKU |
|------|---------------|
| XS | GLV-GL-N125XS |
| S | GLV-GL-N125S |
| M | GLV-GL-N125M |
| L | GLV-GL-N125L |
| XL | GLV-GL-N125XL |

## F. Apply proposals

Use **Apply SKU proposals** (fills empty fields only).

If fields already have values, confirm skipped message appears.

Use **Replace existing SKU values** only after confirm dialog.

## G. Save / promote

Promote from staging or save in product editor.

Promote applies safe GLV proposals by default when `apply_sku_proposals` is not disabled.

## H. Reopen product

Verify persisted values in editor and read-only detail.

## I. Confirm persistence

- `catalog_products.internal_sku` = applied GLV parent
- `catalog_variants.variant_sku` = applied GLV variant SKUs
- `catalog_variants.metadata.manufacturer_sku` = GL-N125F-* values

## J. Duplicate SKU scenario

Try assigning a parent or variant SKU that already exists on another product.

Readiness should show **duplicate_parent_sku** or **duplicate_variant_sku** blocker.

Editing the same product with its own SKUs should not block.

## K. Case/pallet unchanged

Case & Pallet Setup panel and storefront case/pallet behavior should be unchanged.

## Automated smoke

```bash
cd storefront
npx vitest run src/lib/admin/import-draft-sku-smoke.test.ts
npx vitest run src/lib/admin/productExtraction.test.ts
npx vitest run src/lib/admin/import-draft-mapper.test.ts
npx vitest run src/lib/admin/variant-sku-intelligence.test.ts
node ../scripts/audit-stale-product-import-staging.mjs --url hospeco
```
