import { normalizeGloveSizeCode } from "@glove-sku-intelligence";
import { getCatalogOsSkuProposals, type CatalogOsSkuProposalsV1 } from "./types";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export type ResolvedPublishSkus = {
  parentSku: string | null;
  variantSku: string | null;
  manufacturerSku: string | null;
  usedProposal: boolean;
};

function proposalVariantForSize(
  proposals: CatalogOsSkuProposalsV1,
  sizeCode: string
): CatalogOsSkuProposalsV1["variants"][number] | null {
  const norm = normalizeGloveSizeCode(sizeCode) ?? sizeCode.toUpperCase();
  return (
    proposals.variants.find((v) => {
      const vc = v.size_code ? normalizeGloveSizeCode(v.size_code) ?? v.size_code.toUpperCase() : "";
      return vc === norm;
    }) ?? null
  );
}

/** Resolve parent + variant SKUs for publish from staged normalized_data. */
export function resolvePublishSkusFromStaging(input: {
  normalizedData: Record<string, unknown>;
  sizeCode: string | null;
  fallbackParentSku?: string | null;
  fallbackVariantSku?: string | null;
  applyProposals?: boolean;
  overwriteExisting?: boolean;
  existingParentSku?: string | null;
  existingVariantSku?: string | null;
}): ResolvedPublishSkus {
  const apply = input.applyProposals !== false;
  const proposals = getCatalogOsSkuProposals(input.normalizedData);
  const size = input.sizeCode ? normalizeGloveSizeCode(input.sizeCode) ?? input.sizeCode.toUpperCase() : null;

  let parentSku = str(input.existingParentSku) || str(input.fallbackParentSku) || null;
  let variantSku = str(input.existingVariantSku) || str(input.fallbackVariantSku) || null;
  let manufacturerSku: string | null = null;
  let usedProposal = false;

  if (proposals && apply) {
    const appliedParent = str(proposals.applied_parent_sku);
    const proposedParent = str(proposals.proposed_parent_sku);
    if (appliedParent) {
      parentSku = appliedParent;
      usedProposal = true;
    } else if (proposedParent && (input.overwriteExisting || !parentSku || parentSku === str(input.fallbackVariantSku))) {
      parentSku = proposedParent;
      usedProposal = true;
    }

    if (size) {
      const appliedVariant = proposals.applied_variant_skus?.[size];
      const row = proposalVariantForSize(proposals, size);
      manufacturerSku = row?.manufacturer_sku ?? null;

      if (appliedVariant) {
        variantSku = appliedVariant;
        usedProposal = true;
      } else if (
        row?.proposed_glovecubs_sku &&
        (input.overwriteExisting || !variantSku || variantSku === str(input.fallbackVariantSku))
      ) {
        variantSku = row.proposed_glovecubs_sku;
        usedProposal = true;
      }
    }
  }

  if (!manufacturerSku && size && proposals) {
    manufacturerSku = proposalVariantForSize(proposals, size)?.manufacturer_sku ?? null;
  }
  if (!manufacturerSku) {
    manufacturerSku =
      str(input.normalizedData.manufacturer_sku) ||
      str(input.normalizedData.manufacturer_part_number) ||
      str(input.normalizedData.supplier_sku) ||
      null;
  }

  return { parentSku: parentSku || null, variantSku: variantSku || null, manufacturerSku, usedProposal };
}

export function effectiveMasterCreateSku(normalizedData: Record<string, unknown>): string {
  const proposals = getCatalogOsSkuProposals(normalizedData);
  const applied = str(proposals?.applied_parent_sku);
  if (applied) return applied;
  const proposed = str(proposals?.proposed_parent_sku);
  if (proposed) return proposed;
  return str(normalizedData.supplier_sku ?? normalizedData.sku);
}
