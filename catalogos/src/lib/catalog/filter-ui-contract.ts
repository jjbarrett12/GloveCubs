/**
 * Storefront filter UI support contract.
 * Exact TypeScript contract the frontend filter sidebar should consume.
 */

import type { StorefrontFilterParams } from "./types";
import type { ProductListPayload, FacetCounts, FacetDefinitionSummary } from "./types";

/** Available facets: attribute key → list of { value, count, optional label }. */
export type AvailableFacets = FacetCounts;

/** Selected filters from the user (query params or state). */
export type SelectedFilters = StorefrontFilterParams;

/** Product list response with pagination. */
export type ProductListPayloadContract = ProductListPayload;

/** Pagination metadata. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

/** Price range bounds for the current result set (for range slider). */
export interface PriceRangeBounds {
  min: number;
  max: number;
}

/**
 * Full contract for the filter sidebar + product list.
 * GET /api/catalog/products returns ProductListPayload.
 * GET /api/catalog/facets returns { facets, price_bounds, facet_definitions }.
 * Frontend uses facet_definitions for display_group and sort_order when rendering filters.
 */
export interface StorefrontFilterUIContract {
  /** Product list with pagination. */
  products: ProductListPayload;
  /** Current selected filters (from URL or state). */
  selected_filters: SelectedFilters;
  /** Facet counts for current filter state (from GET /api/catalog/facets). */
  available_facets: AvailableFacets;
  /** Facet metadata from dictionary: order and display_group for sidebar rendering. */
  facet_definitions?: FacetDefinitionSummary[];
  /** Min/max price for current result set. */
  price_bounds: PriceRangeBounds;
  /** Pagination metadata (also in products.page/limit/total_pages). */
  pagination: PaginationMeta;
}
