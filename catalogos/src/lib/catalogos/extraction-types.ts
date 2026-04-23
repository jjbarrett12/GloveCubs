/**
 * Shared types for extraction pipeline (raw input, normalized output).
 */

export type RawRow = Record<string, unknown>;

export interface ExtractionResult {
  core: {
    canonical_title: string;
    short_description?: string;
    long_description?: string;
    product_details?: string;
    specifications?: Record<string, string>;
    bullets?: string[];
    brand?: string;
    manufacturer_part_number?: string;
    supplier_sku: string;
    upc?: string;
    supplier_cost: number;
    images: string[];
    stock_status?: string;
    case_qty?: number;
    box_qty?: number;
    lead_time_days?: number;
  };
  category_slug: string;
  filter_attributes: Record<string, unknown>;
  confidenceByKey: Record<string, number>;
}
