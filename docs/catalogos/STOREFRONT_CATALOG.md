# Customer-Facing Catalog Storefront

## Architecture

- **Routes**: `/catalog/[category]` (category listing with filters), `/product/[slug]` (product detail). SEO-friendly slugs.
- **Data**: Server components call `listLiveProducts`, `getFacetCounts`, `getPriceBounds`, `getProductDetailBySlug` (and optionally `getFirstImageByProductIds`) directly — no client-side API calls for initial load. Filter state lives in the URL (searchParams).
- **Filtering**: Facets and price bounds from `GET /api/catalog/facets` contract; same params as products. Sidebar and chips drive navigation (links with updated searchParams). Counts are for the current result set.
- **Performance**: Server components, 24-item default page size, shared param parser, optional caching (e.g. unstable_cache) for facets/product list.

## Routes and page structure

- `app/(storefront)/layout.tsx` — Storefront layout (header, nav to categories).
- `app/(storefront)/catalog/[category]/page.tsx` — Server; reads `category` and `searchParams`, fetches products + facets + price bounds + facet definitions; renders FilterSidebar (client), FilterChips (client), ProductGrid, Sort/Pagination (links).
- `app/(storefront)/product/[slug]/page.tsx` — Server; fetches product detail (with images) and offers; renders product PDP.

## Filter state management

- State is the URL. `parseCatalogSearchParams(searchParams)` → `StorefrontFilterParams`. Adding/removing a filter = navigate to same path with `buildCatalogSearchString({ ...params, material: [...(params.material ?? []), 'nitrile'] })` or remove key.
- Sort and page are also in searchParams (`sort=price_asc`, `page=2`). No client state for filters; server re-renders with new data.

## UI components

- **FilterSidebar** — Client. Receives `facets`, `facetDefinitions`, `selectedFilters`, `category`, `searchString`. Renders groups by `display_group`/`sort_order`; each value is a link that toggles that value in the URL.
- **FilterChips** — Client. Selected filters as chips with "remove" link (build searchString without that value).
- **ProductGrid** — Server or client. Receives `items`, `imageByProductId`. Renders ProductCard per item.
- **ProductCard** — Name, brand, key attributes, starting price, image, link to `/product/[slug]`.
- **SortSelect** / **Pagination** — Links with updated `sort` / `page`.

## Performance

- **Payload size**: Default `limit=24`, max 50. Pagination keeps response small.
- **Server components**: Catalog and product pages are server components; only FilterSidebar, FilterChips, ProductGrid, SortSelect, Pagination are client (for links/select).
- **Parallel fetch**: Category page fetches products, facets, price bounds, facet definitions, and first-image map in parallel (`Promise.all`).
- **Images**: First image per product for grid is one bulk query `getFirstImageByProductIds`. Product detail loads images inside `getProductDetailBySlug`.
- **Caching**: Consider `unstable_cache` for facet definitions or category id by slug (TTL 60s) if traffic grows.
- **SEO**: `generateMetadata` on catalog and product pages for title and description.
