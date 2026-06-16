import type { ImportDraftProductV1, ImportDraftVariantV1 } from "@/lib/admin/import-draft-types";
import {
  deriveSkuProposalsFromInput,
  type GloveSkuProposalInput,
  type SkuProposalResult,
} from "@glove-sku-intelligence";

export {
  deriveGloveCubsParentSku,
  deriveGloveCubsVariantSku,
  deriveSkuProposalsFromInput,
  detectSkuCollisionIssues,
  isSafeGloveCubsSkuProposal,
  isGlvParentSkuFormat,
  isGlvVariantSkuFormat,
  normalizeManufacturerSkuBase,
  stripKnownManufacturerGradeSuffix,
  stripKnownSizeSuffix,
  SKU_PROPOSAL_SAFE_CONFIDENCE,
  type SkuCollisionIssue,
  type SkuProposal,
  type SkuProposalResult,
  type SkuVariantProposal,
  type GloveSkuProposalInput,
  type GloveSkuProposalVariantInput,
} from "@glove-sku-intelligence";

function importDraftToSkuInput(draft: ImportDraftProductV1): GloveSkuProposalInput {
  return {
    productName: draft.product_name,
    brand: draft.brand,
    sourceSku: draft.sku ?? draft.mpn,
    url: draft.source_url,
    variants: draft.variants.map((v) => ({
      size_code: v.normalized_size_code,
      size_label: v.size_label,
      manufacturer_sku: v.manufacturer_sku,
      source_sku: v.source_sku ?? v.sku,
    })),
  };
}

export function deriveSkuProposalsFromImportDraft(draft: ImportDraftProductV1): SkuProposalResult {
  return deriveSkuProposalsFromInput(importDraftToSkuInput(draft));
}

/** Apply SKU proposals onto draft variants (does not mutate manufacturer fields). */
export function attachSkuProposalsToDraft(draft: ImportDraftProductV1): ImportDraftProductV1 {
  const result = deriveSkuProposalsFromImportDraft(draft);
  const variantBySize = new Map(
    result.variants.map((v) => [v.size_code.toUpperCase(), v])
  );

  const variants: ImportDraftVariantV1[] = draft.variants.map((v) => {
    const proposal = variantBySize.get(v.normalized_size_code.toUpperCase());
    if (!proposal) return { ...v };
    return {
      ...v,
      proposed_glovecubs_sku: proposal.proposed_glovecubs_sku,
      sku_proposal_confidence: proposal.confidence,
      sku_proposal_source: proposal.source,
      sku_proposal_warnings: proposal.warnings.length ? proposal.warnings : undefined,
    };
  });

  return {
    ...draft,
    proposed_parent_sku: result.parent_sku.value,
    sku_proposal_confidence: result.parent_sku.confidence,
    sku_proposal_source: result.parent_sku.source,
    sku_proposal_warnings: [...(draft.sku_proposal_warnings ?? []), ...result.warnings],
    variants,
  };
}
