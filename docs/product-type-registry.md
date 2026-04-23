# Product type registry

GloveCubs uses a **product type registry** so new lines (categories) can be added primarily through configuration instead of scattering `if (category === "disposable_gloves")` logic across the codebase.

The **first implemented family is gloves**, with two product types:

| Key | Display name |
|-----|----------------|
| `disposable_gloves` | Disposable gloves |
| `reusable_work_gloves` | Reusable work gloves |

---

## Code location

| Path | Role |
|------|------|
| [`catalogos/src/lib/product-types/types.ts`](../catalogos/src/lib/product-types/types.ts) | TypeScript shapes: `ProductTypeDefinition`, sort options, admin layout, normalization wiring. |
| [`catalogos/src/lib/product-types/registry.ts`](../catalogos/src/lib/product-types/registry.ts) | `PRODUCT_TYPE_DEFINITIONS`, helpers (`getProductTypeDefinition`, `getFilterableFacets`, `getIngestionExtractorId`, …). |
| [`catalogos/src/lib/product-types/index.ts`](../catalogos/src/lib/product-types/index.ts) | Public exports for app code. |

---

## What each product type defines

For every `ProductTypeKey`, the registry holds:

1. **Product type key** — Stable slug; matches `catalogos.categories.slug` for live data.
2. **Display name** — Human-readable title (metadata, UI).
3. **Family** — Merchandising group (e.g. `gloves`) for future nav and disambiguation.
4. **Variant dimensions** — Attribute keys that describe SKU / variant grain (`material`, `size`, `color`, …).
5. **Required / strongly preferred attributes** — Drives `validateAttributesByCategory` via `getAttributeRequirementsLists` (same rules as former `DISPOSABLE_REQUIRED` / `WORK_GLOVE_*` constants).
6. **Optional attribute keys** — Documented extensions not required for publish.
7. **Filterable facets** — Keys counted in `/api/catalog/facets` and scanned for low-confidence review flags.
8. **Sort options** — Allowed `sort` query values per type (e.g. disposable includes `price_per_glove_asc`; work gloves omit it).
9. **Normalization rules** — `ruleSetId`, `extractorId` (`disposable_glove_dictionary` \| `work_glove_dictionary`), and **inference signals** (strong/weak keywords) for category disambiguation within `disambiguationGroupId` (e.g. `gloves`).
10. **Validation rules** — `dictionaryValidatedKeys` documents which keys are enum-checked in `parse_safe` (allowed sets still live in `attribute-dictionary-types` today).
11. **Admin form layout** — Sections and fields (`widget`, `colSpan`) for building review / admin UIs from config.

Global multi-select keys (e.g. `industries`, `compliance_certifications`) are defined once as `GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS` in the registry and re-used by `attribute-validation`.

---

## How the app uses the registry

| Area | Integration |
|------|-------------|
| **Category inference** | [`category-inference.ts`](../catalogos/src/lib/normalization/category-inference.ts) scores members of `getDisambiguationGroupMembers("gloves")` using registry keyword lists. |
| **Normalization** | [`normalization-engine.ts`](../catalogos/src/lib/normalization/normalization-engine.ts) selects `extractDisposableGloveAttributes` vs `extractWorkGloveAttributes` via `getIngestionExtractorId`. |
| **Stage / publish validation** | [`attribute-validation.ts`](../catalogos/src/lib/catalogos/attribute-validation.ts) + [`validation-modes.ts`](../catalogos/src/lib/catalogos/validation-modes.ts) use registry-backed requirements and `isImplementedProductTypeKey` / `IMPLEMENTED_PRODUCT_TYPE_KEYS`. |
| **Review flags** | [`review-flags.ts`](../catalogos/src/lib/catalogos/review-flags.ts) uses `reviewRequiredFilterKeys` and `getFilterableFacets`. |
| **Facet aggregation** | [`facets.ts`](../catalogos/src/lib/catalog/facets.ts) uses `getAllFilterableFacetKeys()`. |
| **Filter attribute keys** | [`filter-attributes.ts`](../catalogos/src/lib/catalogos/filter-attributes.ts) derives disposable/work facet key lists from the registry; `StorefrontCategoryParam` includes `all_categories` for URL semantics only. |
| **Persisted category type** | [`attribute-dictionary-types.ts`](../catalogos/src/lib/catalogos/attribute-dictionary-types.ts) aliases `CategorySlug` to `ProductTypeKey` (registry keys only). |
| **Zod** | [`normalized-product-schema.ts`](../catalogos/src/lib/catalogos/normalized-product-schema.ts), [`attribute-dictionary-schema.ts`](../catalogos/src/lib/catalogos/attribute-dictionary-schema.ts) use `IMPLEMENTED_PRODUCT_TYPE_KEYS` for product category enums. |
| **Storefront** | Nav in [`layout.tsx`](../catalogos/src/app/(storefront)/layout.tsx) uses `getStorefrontNavCategories()`. Catalog [`page.tsx`](../catalogos/src/app/(storefront)/catalog/[category]/page.tsx) uses `isImplementedProductTypeKey`, `getDisplayNameForProductType`, `getSortValuesForProductType`. |
| **API defaults** | [`api/catalog/route.ts`](../catalogos/src/app/api/catalog/route.ts), [`api/catalog/facets/route.ts`](../catalogos/src/app/api/catalog/facets/route.ts) default category to `DEFAULT_PRODUCT_TYPE_KEY`. |
| **Publish** | [`publish-service.ts`](../catalogos/src/lib/publish/publish-service.ts) defaults missing category to `DEFAULT_PRODUCT_TYPE_KEY`. |
| **Constants / roadmap** | [`constants/categories.ts`](../catalogos/src/lib/constants/categories.ts) lists `IMPLEMENTED_CATEGORIES` from the registry plus `ROADMAP_CATEGORIES` for slugs not yet implemented. |

---

## Adding a new product type (checklist)

1. **Database** — Insert `catalogos.categories` row (slug, labels) and seed attribute definitions / facet metadata (see existing migrations under `supabase/migrations/`).
2. **Registry** — Extend `ProductTypeKey` in `types.ts`, add a full entry to `PRODUCT_TYPE_DEFINITIONS` in `registry.ts`, and append the key to `IMPLEMENTED_PRODUCT_TYPE_KEYS`.
3. **Ingestion** — Add an `IngestionExtractorId` and extractor module (or reuse a generic one), wire `getIngestionExtractorId` in `normalization-engine.ts`.
4. **Disambiguation** — If the new type competes with others on the same feed, assign a `disambiguationGroupId` and `inferenceSignals`, or add a new group and teach `inferCategoryWithResult` which group to use for that channel.
5. **Enums** — Extend `filter-attributes` / `attribute-dictionary-types` allowed values as needed for `parse_safe`.
6. **Tests** — Add Vitest cases for normalization, validation, and any new inference behavior.

---

## Relationship to other “registry” concepts

- **Storefront `product-line-registry.ts`** (legacy app) is a separate merchandising/search construct; over time, product-line behavior can delegate to this registry where overlaps exist.
- **Node `lib/ingestion/schema.js`** (main server) still defines its own `CATEGORIES` array; keeping it aligned with `IMPLEMENTED_PRODUCT_TYPE_KEYS` avoids drift when both stacks ingest similar feeds.

---

## Testing

Run targeted CatalogOS tests after registry changes:

```bash
cd catalogos
npx vitest run src/lib/normalization/normalization-engine.test.ts src/lib/catalogos/validation-modes.test.ts
```
