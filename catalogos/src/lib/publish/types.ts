/**
 * Publish pipeline types: approval → live catalog.
 */

/** Storefront search (public.canonical_products) sync relative to live catalogos.products publish. */
export type SearchPublishStatus =
  | "staged"
  | "approved"
  | "published_pending_sync"
  | "published_synced"
  | "sync_failed";

export interface PublishInput {
  normalizedId: string;
  /** When approving to existing master. */
  masterProductId?: string;
  /** When creating new master: sku, name, category_id, brand_id?, description? */
  newProductPayload?: {
    sku: string;
    name: string;
    category_id: string;
    brand_id?: string | null;
    description?: string | null;
  };
  /** Staged content + filter_attributes from supplier_products_normalized. */
  stagedContent: {
    canonical_title?: string;
    supplier_sku: string;
    supplier_cost: number;
    brand?: string;
    description?: string;
    images?: string[];
  };
  stagedFilterAttributes: Record<string, unknown>;
  categorySlug: string;
  supplierId: string;
  rawId: string;
  /** Override sell price if set in staging. */
  overrideSellPrice?: number | null;
  /** When true, sell unit is case but normalized_case_cost could not be computed; publish must block. */
  pricingCaseCostUnavailable?: boolean;
  publishedBy?: string;
}

export interface PublishResult {
  success: boolean;
  productId?: string;
  slug?: string;
  offerCreated?: boolean;
  error?: string;
  /** When required attributes are missing we still may create product but set warnings. */
  warnings?: string[];
  /**
   * False when live product/offer writes may have succeeded but public.canonical_products sync did not complete.
   * Treat as incomplete publish for storefront search.
   */
  publishComplete?: boolean;
  searchPublishStatus?: SearchPublishStatus;
}
