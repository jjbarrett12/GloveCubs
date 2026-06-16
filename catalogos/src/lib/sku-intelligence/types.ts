import type { SkuProposalResult } from "@glove-sku-intelligence";

export const CATALOGOS_SKU_PROPOSALS_SCHEMA_VERSION = 1 as const;

export type CatalogOsSkuProposalsV1 = {
  schema_version: typeof CATALOGOS_SKU_PROPOSALS_SCHEMA_VERSION;
  proposed_parent_sku: string | null;
  parent_confidence: number | null;
  parent_source: string | null;
  parent_warnings: string[];
  variants: Array<{
    size_code: string | null;
    manufacturer_sku: string | null;
    proposed_glovecubs_sku: string | null;
    confidence: number | null;
    source: string | null;
    warnings: string[];
  }>;
  warnings: string[];
  /** Operator-applied parent SKU (safe apply or confirmed overwrite). */
  applied_parent_sku?: string | null;
  /** Operator-applied variant SKUs keyed by size code. */
  applied_variant_skus?: Record<string, string> | null;
  apply_overwrite_confirmed?: boolean;
};

export function skuProposalsFromResult(result: SkuProposalResult): CatalogOsSkuProposalsV1 {
  return {
    schema_version: CATALOGOS_SKU_PROPOSALS_SCHEMA_VERSION,
    proposed_parent_sku: result.parent_sku.value,
    parent_confidence: result.parent_sku.confidence,
    parent_source: result.parent_sku.source,
    parent_warnings: result.parent_sku.warnings,
    variants: result.variants.map((v) => ({
      size_code: v.size_code,
      manufacturer_sku: v.manufacturer_sku,
      proposed_glovecubs_sku: v.proposed_glovecubs_sku,
      confidence: v.confidence,
      source: v.source,
      warnings: v.warnings,
    })),
    warnings: result.warnings,
  };
}

export function getCatalogOsSkuProposals(
  nd: Record<string, unknown> | null | undefined
): CatalogOsSkuProposalsV1 | null {
  const raw = nd?.sku_proposals;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== CATALOGOS_SKU_PROPOSALS_SCHEMA_VERSION) return null;
  return raw as CatalogOsSkuProposalsV1;
}
