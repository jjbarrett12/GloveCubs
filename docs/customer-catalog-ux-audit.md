# Customer catalog UX audit — GloveCubs

**Role:** Product and UX architecture review of the customer-facing catalog.  
**Goal:** Confirm whether the storefront experience is driven by **normalized catalog + variant-oriented data** (published products, attribute dictionary, aggregated commercial signals) versus **raw supplier artifacts** (supplier SKUs, per-supplier rows as the primary merchandising model).  
**Primary codebase:** Next.js app under `catalogos/` (routes in `src/app/(storefront)/`).  
**Secondary surface:** Legacy SPA in `public/js/app.js` (separate navigation, URL patterns such as `/gloves/.../size/...`). This audit focuses on **CatalogOS**; legacy is noted where it diverges.

---

## Executive summary

| Area | Normalized catalog alignment | Main gaps |
|------|------------------------------|-----------|
| Category routing | Strong — only **implemented** product types resolve; labels from registry | Unimplemented slugs 404; no mixed “all gloves” mega-list in this stack |
| Listing / grid | Strong — `products` + `product_best_offer_price` for list price and supplier count | List rows still expose `products.sku` (canonical product SKU, not necessarily “supplier raw”) |
| Facets | Strong — `product_attributes` + dictionary-driven definitions | Facet **keys** are unioned from product-type registry + query; must stay in sync with publishing |
| Search (`q`) | **Weak** — param parsed and forwarded to APIs but **not applied** in `listLiveProducts` | No server-side text match; analytics may fire without result change |
| Sort | Mostly strong — price via view; price-per-glove via enrichment pass | Price-per-glove sort fetches a larger window then slices (performance/UX tradeoff) |
| PDP | Mixed — normalized name, images, `attributes` JSON | **Supplier offers** table shows `supplier_sku`; hero pricing uses **best** offer, not a chosen variant |
| Variant selection | **Absent** in storefront — one PDP per catalog product | Registry defines `variantDimensions` for ingestion; no customer-facing dimension picker |
| Pricing | Hybrid — display uses **aggregated** best price; detail exposes line-level offers | Risk of showing multiple supplier prices without a single “selected offer” model |
| Availability | **Not surfaced** in storefront TSX (no stock/ATP copy found) | Buyers cannot see normalized availability without new UI + data contract |
| Compare | Partial — prices and names; **attributes not populated on add** | Compare table expects attribute keys but `add()` sends `attributes: {}` |
| Quote entry | Uses catalog `productId` + snapshot `unitPrice` | No `offer_id`, no structured variant id; quantity only |

**Bottom line:** Browse, filter, and sort are largely aligned with the normalized catalog pipeline. The PDP and quote/compare flows still **blend** normalized merchandising with **supplier-offer transparency** in ways that are appropriate for procurement but **not** a pure “customer catalog only” presentation. Search and variant selection are the largest functional holes relative to a complete normalized experience.

---

## 1. Category pages

**Implementation:** `catalogos/src/app/(storefront)/catalog/[category]/page.tsx`

- **Routing gate:** `isImplementedProductTypeKey(categorySlug)` returns 404 for unknown categories — the storefront does not expose arbitrary category slugs outside the registry.
- **Display name:** `getDisplayNameForProductType` — human labels come from `catalogos/src/lib/product-types/` (registry + types), not from ad hoc strings in the page.
- **Data load:** Category ID from `getCategoryIdBySlug`, then parallel fetch of products, facet counts, price bounds, and facet definitions from the dictionary service.

**Normalized vs raw:** Category UX is **registry- and DB-driven** (implemented types + `categories` slug). This is appropriate for a controlled catalog.

**Risks / notes:**

- Adding a DB category without updating `IMPLEMENTED_PRODUCT_TYPE_KEYS` leaves a dead slug.
- Industry quick filters map to normalized attribute values (`industries`) via `INDUSTRY_MAP` — good alignment with facet data.

---

## 2. Product listing (grid)

**Implementation:** `listLiveProducts` in `catalogos/src/lib/catalog/query.ts`, rendering via `CatalogPageClient` → `ProductGrid`.

- **Source of truth:** Active rows in `products` (published catalog), joined with category/brand maps and **`product_best_offer_price`** for `best_price` and `supplier_count` (offer count).
- **Filtering:** `getFilteredProductIds` intersects sets from **`product_attributes`** using `attribute_definition_id` + `value_text` — this is the normalized attribute pipeline, not free-text supplier fields.

**Normalized vs raw:** The grid is **catalog-first**. Price is **aggregated** per product via the view, not “pick a random supplier row” in the list query.

**Gaps:**

- Card-level **SKU** comes from `products.sku`. That is the canonical product identifier in your model; if operational teams treat it as “our SKU” it is fine — if it mirrors a single supplier’s code, that can feel like supplier leakage on the card (policy decision).

---

## 3. Filters and facets

**Implementation:** `catalogos/src/lib/catalog/facets.ts` (`getFacetCounts`, `getPriceBounds`), `FilterSidebar` / `FilterChips`, URL serialization in `catalogos/src/lib/catalog/params.ts`.

- **Counts:** For each facet key in `getAllFilterableFacetKeys()`, counts are computed from **`product_attributes`** restricted to the current candidate product set (`getFilteredProductIds`).
- **Definitions:** `loadFacetDefinitionsForCategory` drives labels, groups, and cardinality in the UI.

**Normalized vs raw:** Facets are **dictionary-normalized** — exactly the model described in internal docs (`ATTRIBUTE_MODEL_ARCHITECTURE`, dictionary wiring).

**Gaps / coupling:**

- `getFilteredProductIds` in `query.ts` enumerates a **fixed list** of filter keys. New facet keys must be added there (and in params/types) or they will not constrain listings — registry and query layer must stay aligned.
- **Price bounds** (`getPriceBounds`) compute min/max by scanning **`supplier_offers`** (active) and taking the best price per product. List pricing uses **`product_best_offer_price`**. Semantically aligned (best offer) but **two implementations** — any drift in “what counts as best price” would confuse the slider vs grid.

---

## 4. Search

**Implementation:** `q` on `StorefrontFilterParams` (`catalogos/src/lib/catalog/types.ts`), parsed in `parseCatalogSearchParams` (`catalogos/src/lib/catalog/params.ts`), passed through `/api/catalog` and server pages.

**Finding:** `listLiveProducts` **does not reference `params.q`**. There is no `ilike` on name/description/SKU in the Supabase query path reviewed.

**UX impact:** A user or integrator can append `?q=nitrile` and see **no change** in results (while `CatalogPageClient` may still emit a `search_used` analytics event when `selectedParams.q` is set).

**Recommendation:** Implement search against **normalized** fields first (e.g. `products.name`, `products.description`, brand name, and optionally facet text via `product_attributes` / search index). Avoid searching raw `supplier_sku` in the default customer experience unless explicitly desired.

---

## 5. Sorting

**Implementation:** `SORT_OPTIONS` in `query.ts` includes `relevance`, `price_asc`, `price_desc`, `newest`, `price_per_glove_asc`. Category page uses `getSortValuesForProductType` for per-line options.

- **Price sorts:** Ordered using **`product_best_offer_price`** (consistent with grid pricing).
- **Price per glove:** When selected, the category page fetches a larger page (`MAX_FOR_PRICE_PER_GLOVE_SORT`) and uses `enrichCatalogItems` / `sortEnrichedByPricePerGloveAndSlice` from `@/lib/conversion` — derived from normalized pack-size / conversion logic, not supplier-specific strings.

**Normalized vs raw:** Sorting is **catalog + aggregated commercial data**, not per-supplier row ordering in the default path.

---

## 6. Product detail page (PDP)

**Implementation:** `catalogos/src/app/(storefront)/product/[slug]/page.tsx`

- **Core product:** `getProductDetailBySlug` — normalized catalog record (name, slug, images, `attributes` JSON, brand, category).
- **Merchandising signals:** `computePricePerGlove`, `computeSignalsForProduct`, `computeAuthorityBadge` — presentation layer on top of catalog fields.
- **Commercial block:** `getOffersSummaryByProductId` reads **`supplier_offers`**; UI shows offer count, **best** price for quote CTA, and a **Supplier offers** table with **Supplier SKU**, price, lead time.

**Normalized vs raw:**

- **Attributes** card renders `product.attributes` — should be populated from your normalization/publish pipeline (still JSON on the product; ensure publishing writes dictionary-aligned keys).
- **Supplier offers** block is **explicitly supplier-grain** — appropriate for B2B transparency but **not** “customer-only normalized view.”

**Image gallery:** Secondary thumbnails are buttons without wired `onClick` in the snippet reviewed — possible UX bug (no swap of main image).

---

## 7. Variant selection

**Registry intent:** `ProductTypeDefinition.variantDimensions` in `catalogos/src/lib/product-types/types.ts` describes which attributes define SKU/variant grain for a line.

**Storefront reality:** No dimension picker (size/color/pack) on the PDP that maps to a **variant record** or **offer line**. One URL = one `products` row.

**Legacy contrast:** `public/js/app.js` supports **product-size URLs** (`/gloves/.../size/...`), suggesting an older model where size was part of navigation. CatalogOS does not mirror that pattern in `(storefront)/product/[slug]`.

**Recommendation:** If the data model has variant groups / multiple SKUs per family, the customer UX should select a **normalized variant** (or pack configuration) and then resolve **which offer(s)** back that variant — without exposing supplier SKUs as the primary selector unless required.

---

## 8. Pricing display

| Surface | Mechanism | Normalized? |
|---------|-----------|-------------|
| Listing | `product_best_offer_price.best_price` + `offerPrice` semantics (sell vs cost) | Yes — aggregated |
| PDP hero | `offersSummary.best_price` + `computePricePerGlove` | Yes — aggregated best |
| PDP table | Per-row `supplier_offers` sell_price or cost | No — supplier line level |

**Policy question:** Decide whether customers should see **one** commercial story (best normalized price + optional “from X suppliers”) vs **full offer breakout**. The current PDP does both.

---

## 9. Availability display

**Finding:** Grep over `catalogos/src/app/(storefront)` found **no** matches for typical stock/availability strings (`stock`, `availability`, `in_stock`, `ATP`).

**Gap:** Even if inventory exists in the backend, the customer catalog does not communicate **fulfillment posture** (in stock, lead time band, backorder) in a normalized way on listing or PDP.

**Recommendation:** Add a **catalog-level** availability signal (e.g. enum + copy) sourced from normalized procurement/inventory rules, not raw supplier free text, unless vetted.

---

## 10. Comparison

**Implementation:** `ProductPageActions` adds items via `CompareContext`; `ComparisonTable` renders rows for material, thickness, color, powder, texture, grade, pack size, price per glove/case.

**Critical gap:** On compare add, attributes are passed as **empty**:

```34:46:catalogos/src/app/(storefront)/product/[slug]/ProductPageActions.tsx
    add({
      id: productId,
      slug,
      name,
      attributes: {},
      best_price: bestPrice,
      pricePerGlove: {
        display_per_glove: pricePerGlove.display_per_glove,
        display_case: pricePerGlove.display_case,
        price_per_glove: pricePerGlove.price_per_glove,
        gloves_per_box: pricePerGlove.gloves_per_box,
      },
    });
```

So the compare experience is **not** driven by normalized facet attributes in practice — only name and price columns are meaningful until this is fixed.

**Fix direction:** Hydrate `attributes` from the same source as the PDP attribute card (prefer **`product_attributes`**-aligned map or a stable subset of `product.attributes` keyed to compare row keys).

---

## 11. Quote and order entry points

**Add to quote:** `catalogos/src/components/storefront/AddToQuoteButton.tsx` calls `addItem({ productId, slug, name, unitPrice, sku, quantity: 1 })`.

- **Strengths:** Anchors to **catalog `productId`** — correct for a normalized quote line.
- **Gaps:** No **`supplier_offer_id`** or **variant id**; `unitPrice` is whatever the parent passed (PDP uses **best** offer price). Changing suppliers or offers after add does not automatically rebind the line.

**Other entry points:** `ProductPageActions` includes **Request bulk pricing** (`BulkQuoteModal`) — validate that submissions also reference catalog ids and normalized context, not only free text.

**Order entry:** This audit did not trace checkout capture end-to-end; quote flow is the primary B2B path visible in these components.

---

## 12. Cross-cutting: normalized catalog vs supplier data

**Aligned with “normalized catalog + variants” (current strengths):**

- Published `products` as the browse unit.
- Faceted navigation via `product_attributes` + dictionary definitions.
- List and sort pricing via **`product_best_offer_price`** (aggregated).

**Still supplier-forward or incomplete:**

- PDP **Supplier offers** table (`supplier_sku`, per-offer price).
- **Search** not wired.
- **Compare** missing attribute payload.
- **No variant picker** tied to normalized dimensions.
- **Availability** not shown.

---

## 13. Recommended priorities (product + UX)

1. **Wire `q` to a proper catalog search** (normalized fields + clear empty states). Remove or gate analytics that imply search executed when results are unchanged.
2. **Populate compare `attributes`** from the same normalized attribute source as the PDP (and keep keys aligned with `ComparisonTable` rows).
3. **Variant strategy:** Either document “one SKU per PDP” as intentional for v1, or add a variant selector that updates price/availability/quote payload from **variant → best offer** resolution.
4. **Commercial narrative:** Choose **one** primary price story on the PDP; demote or gate the supplier SKU table behind “View sourcing options” if the goal is a cleaner customer catalog.
5. **Availability:** Introduce a small set of buyer-facing states backed by normalized rules.
6. **Consistency:** Prefer **`product_best_offer_price`** (or a single shared helper) for price bounds as well as list/sort, to avoid divergent “best price” definitions.

---

## 14. Reference map (key files)

| Concern | File(s) |
|---------|---------|
| Category page | `catalogos/src/app/(storefront)/catalog/[category]/page.tsx` |
| Catalog client UI | `catalogos/src/app/(storefront)/catalog/[category]/CatalogPageClient.tsx` |
| List + filters query | `catalogos/src/lib/catalog/query.ts` |
| Facets + price bounds | `catalogos/src/lib/catalog/facets.ts` |
| URL params | `catalogos/src/lib/catalog/params.ts` |
| Product types / facets registry | `catalogos/src/lib/product-types/registry.ts`, `index.ts` |
| PDP | `catalogos/src/app/(storefront)/product/[slug]/page.tsx` |
| Compare + bulk quote CTA | `catalogos/src/app/(storefront)/product/[slug]/ProductPageActions.tsx` |
| Add to quote | `catalogos/src/components/storefront/AddToQuoteButton.tsx` |
| Compare table | `catalogos/src/components/storefront/ComparisonTable.tsx` |
| Catalog API (includes `q`) | `catalogos/src/app/api/catalog/route.ts` |

---

*Document generated from a static read of the CatalogOS storefront and catalog query layer. Behavior should be re-verified after major schema or publishing changes.*
