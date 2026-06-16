import {
  detectSkuCollisionIssues,
  isGlvParentSkuFormat,
  isGlvVariantSkuFormat,
  isSafeGloveCubsSkuProposal,
  deriveSkuProposalsFromInput,
  SKU_PROPOSAL_SAFE_CONFIDENCE,
  type SkuCollisionIssue,
} from "@glove-sku-intelligence";
import { normalizeGloveSizeCode } from "@glove-sku-intelligence";
import { getCatalogOsSkuProposals } from "./types";
import { buildGloveSkuInputFromStagingRows, type StagingSkuContextRow } from "./staging-sku-proposals";
import { resolvePublishSkusFromStaging } from "./publish-sku-apply";

export type SkuReadinessItem = {
  code: string;
  label: string;
  severity: "blocker" | "warning";
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function evaluateSkuReadinessFromStaging(input: {
  normalizedData: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  inferredSize?: string | null;
  siblingRows?: StagingSkuContextRow[];
  existingParentSkus?: Set<string>;
  existingVariantSkus?: Set<string>;
  excludeMasterProductId?: string | null;
  requireVariantSku?: boolean;
}): SkuReadinessItem[] {
  const items: SkuReadinessItem[] = [];
  const nd = input.normalizedData;
  const attrs = input.attributes ?? (nd.filter_attributes as Record<string, unknown>) ?? {};
  const sizeRaw = str(input.inferredSize ?? attrs.size ?? nd.size);
  const sizeCode = sizeRaw ? normalizeGloveSizeCode(sizeRaw) ?? sizeRaw.toUpperCase() : null;

  const siblings = input.siblingRows?.length
    ? input.siblingRows
    : [{ normalized_data: nd, attributes: attrs, inferred_size: input.inferredSize ?? null }];

  const proposals = getCatalogOsSkuProposals(nd);
  const result = deriveSkuProposalsFromInput(buildGloveSkuInputFromStagingRows(siblings));

  const resolved = resolvePublishSkusFromStaging({
    normalizedData: nd,
    sizeCode,
    fallbackParentSku: str(nd.supplier_sku),
    fallbackVariantSku: str(nd.supplier_sku ?? nd.sku),
    applyProposals: true,
    existingParentSku: null,
    existingVariantSku: null,
  });

  const parentSku = resolved.parentSku;
  const variantSku = resolved.variantSku;
  const manufacturerSku = resolved.manufacturerSku;

  if (input.requireVariantSku !== false && sizeCode && !variantSku) {
    items.push({
      code: "missing_variant_sku",
      label: `Variant SKU missing for size ${sizeCode}`,
      severity: "blocker",
    });
  }

  if (variantSku && manufacturerSku && variantSku.toUpperCase() === manufacturerSku.toUpperCase()) {
    items.push({
      code: "manufacturer_sku_used_as_variant_sku",
      label: "Manufacturer SKU must not be used as GloveCubs variant SKU",
      severity: "blocker",
    });
  }

  const collisionIssues = detectSkuCollisionIssues({
    parentSku,
    variantSkus: variantSku ? [variantSku] : [],
    existingParentSkus: input.existingParentSkus,
    existingVariantSkus: input.existingVariantSkus,
    manufacturerSkusByVariant: manufacturerSku ? [manufacturerSku] : [],
  });
  for (const issue of collisionIssues) {
    items.push({ code: issue.code, label: issue.label, severity: issue.severity });
  }

  const parentProposal = proposals?.proposed_parent_sku ? proposals : null;
  const parentConf = parentProposal?.parent_confidence ?? result.parent_sku.confidence;
  if (parentProposal?.proposed_parent_sku && parentConf < SKU_PROPOSAL_SAFE_CONFIDENCE) {
    items.push({
      code: "low_confidence_parent_sku_proposal",
      label: `Low-confidence parent SKU proposal (${Math.round(parentConf * 100)}%)`,
      severity: "warning",
    });
  }

  if (parentSku && !isGlvParentSkuFormat(parentSku)) {
    items.push({
      code: "parent_sku_not_glv_format",
      label: `Parent SKU is not GLV format: ${parentSku}`,
      severity: "warning",
    });
  }

  if (variantSku && parentSku && !isGlvVariantSkuFormat(variantSku, parentSku)) {
    items.push({
      code: "variant_sku_not_glv_format",
      label: `Variant SKU is not GLV parent+size format: ${variantSku}`,
      severity: "warning",
    });
  }

  const variantRow = result.variants.find(
    (v) => (v.size_code ? normalizeGloveSizeCode(v.size_code) : null) === sizeCode
  );
  if (variantRow && variantRow.confidence < SKU_PROPOSAL_SAFE_CONFIDENCE && variantRow.proposed_glovecubs_sku) {
    items.push({
      code: "low_confidence_variant_sku_proposal",
      label: `Low-confidence variant SKU proposal for ${sizeCode} (${Math.round(variantRow.confidence * 100)}%)`,
      severity: "warning",
    });
  }

  if (proposals && !isSafeGloveCubsSkuProposal(result) && result.parent_sku.value) {
    items.push({
      code: "sku_proposal_needs_review",
      label: "SKU proposals present but not all safe-confidence — review before overwrite",
      severity: "warning",
    });
  }

  return items;
}

export function skuReadinessBlockers(items: SkuReadinessItem[]): string[] {
  return items.filter((i) => i.severity === "blocker").map((i) => i.label);
}

export function skuReadinessWarnings(items: SkuReadinessItem[]): string[] {
  return items.filter((i) => i.severity === "warning").map((i) => i.label);
}

export type { SkuCollisionIssue };
