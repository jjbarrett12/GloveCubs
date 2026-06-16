/**
 * Normalized import contract for clipboard/quick URL staging (V1).
 * Plain JSON-serializable; deterministic field shapes.
 */

import type { CommercePackagingV1 } from "@commerce-packaging/types";

export const IMPORT_DRAFT_SCHEMA_VERSION = 1 as const;
export const IMPORT_DRAFT_PARSER_VERSION = "productExtraction.v2" as const;

export type ImportFieldProvenanceV1 = {
  value: unknown;
  confidence: number;
  source: string;
  method: "deterministic" | "ai_fallback";
};

export type ImportDraftVariantV1 = {
  size_label: string | null;
  normalized_size_code: string;
  sku: string | null;
  /** Source/manufacturer item number for this exact size (not GloveCubs GLV SKU). */
  manufacturer_sku?: string | null;
  /** Alias for manufacturer/source SKU when distinct from sku field. */
  source_sku?: string | null;
  /** Extraction source: json_ld, select_option, variant_tile, spec_table, text_fallback, url_pattern */
  size_source?: string | null;
  /** 0–1 confidence for size + SKU association. */
  size_confidence?: number | null;
  /** Proposed GloveCubs variant SKU (GLV-...); not manufacturer SKU. */
  proposed_glovecubs_sku?: string | null;
  sku_proposal_confidence?: number | null;
  sku_proposal_source?: string | null;
  sku_proposal_warnings?: string[];
  mpn: string | null;
  gtin: string | null;
  list_price: string | null;
  provenance?: Record<string, ImportFieldProvenanceV1>;
};

export type ImportDraftProductV1 = {
  schema_version: typeof IMPORT_DRAFT_SCHEMA_VERSION;
  parser_version: typeof IMPORT_DRAFT_PARSER_VERSION;
  source_url: string;
  product_name: string | null;
  brand: string | null;
  category_hint: string | null;
  description: string | null;
  image_url: string | null;
  /** All product gallery images detected on source page (primary = image_url). */
  image_urls?: string[];
  sku: string | null;
  mpn: string | null;
  gtin: string | null;
  material: string | null;
  color: string | null;
  thickness_mil: number | null;
  case_pack: string | null;
  units_per_case: number | null;
  /** Attribute slug values e.g. "200", "2000" for box_quantity / case_quantity. */
  box_quantity?: string | null;
  case_quantity?: string | null;
  /** Canonical certification slugs detected on source page. */
  certification_slugs?: string[];
  food_safe?: boolean | null;
  powder_free: boolean | null;
  latex_free: boolean | null;
  exam_grade: boolean | null;
  glove_grade: string | null;
  size: string | null;
  variants: ImportDraftVariantV1[];
  confidence: { overall: number; fields: Record<string, number> };
  field_provenance: Record<string, ImportFieldProvenanceV1>;
  parse_warnings: string[];
  /** Case/pallet commerce packaging (Phase 2A). */
  commerce_packaging?: CommercePackagingV1 | null;
  /** Proposed GloveCubs parent SKU (GLV-...). */
  proposed_parent_sku?: string | null;
  sku_proposal_confidence?: number | null;
  sku_proposal_source?: string | null;
  sku_proposal_warnings?: string[];
  raw_evidence: {
    spec_table?: Record<string, string>;
    meta_tags?: Record<string, string>;
    json_ld_summary?: Record<string, unknown> | null;
  };
};

/** Staging `extracted` payload written by createClipboardStaging. */
export type StagingExtractedPayloadV1 = {
  schema_version: typeof IMPORT_DRAFT_SCHEMA_VERSION;
  draft: ImportDraftProductV1;
  source_product_page_url: string;
  source_image_url: string | null;
  html_truncated?: boolean;
  fetch_error?: string;
  /** Legacy mirrors for transition UI */
  suggested_name?: string | null;
  suggested_brand?: string | null;
  suggested_sku?: string | null;
  suggested_mpn?: string | null;
  suggested_gtin?: string | null;
  suggested_description?: string | null;
  suggested_image_from_page?: string | null;
  extraction_confidence?: number;
};
