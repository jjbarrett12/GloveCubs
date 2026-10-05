import { parseCostSourceType } from "@/lib/pricing/landed-cost-provenance";
import type { FamilySizeSlug, NewProductFamilyDraft } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SizeCaseCost = {
  quotedCaseCost: number;
  landedCaseCost: number;
};

export type FamilyCostEvaluation = {
  complete: boolean;
  trusted: boolean;
  blockReason: string | null;
  bySize: Partial<Record<FamilySizeSlug, SizeCaseCost>>;
};

/** Positive currency rounded to cents. Zero and blanks are missing, not a price. */
export function positiveCaseCost(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export function costForSize(
  draft: NewProductFamilyDraft,
  size: FamilySizeSlug
): { quotedCaseCost: number | null; landedCaseCost: number | null } {
  if (draft.sameCostForAllSizes) {
    return {
      quotedCaseCost: positiveCaseCost(draft.quotedCaseCost),
      landedCaseCost: positiveCaseCost(draft.landedCaseCost),
    };
  }
  const row = draft.costBySize[size];
  return {
    quotedCaseCost: positiveCaseCost(row?.quotedCaseCost),
    landedCaseCost: positiveCaseCost(row?.landedCaseCost),
  };
}

/**
 * Supplier quoted case cost and landed case cost stay separate.
 * Trusted means every selected size has a confirmed landed case cost and provenance.
 */
export function evaluateFamilyCost(draft: NewProductFamilyDraft): FamilyCostEvaluation {
  const empty: FamilyCostEvaluation = { complete: false, trusted: false, blockReason: null, bySize: {} };
  if (!draft.supplierId || !UUID_RE.test(draft.supplierId)) {
    return { ...empty, blockReason: "Select a supplier to continue." };
  }
  if (!parseCostSourceType(draft.costSourceType)) {
    return { ...empty, blockReason: "Select how the landed case cost was obtained." };
  }
  if (!draft.costSourceReference.trim()) {
    return { ...empty, blockReason: "Enter a quote, invoice, or price-sheet reference." };
  }
  if (draft.sizes.length === 0) {
    return { ...empty, blockReason: "Select at least one size before entering cost." };
  }

  const bySize: Partial<Record<FamilySizeSlug, SizeCaseCost>> = {};
  for (const size of draft.sizes) {
    const row = costForSize(draft, size);
    if (row.quotedCaseCost == null) {
      return { ...empty, blockReason: "Enter the supplier quoted case cost. This is not the customer price." };
    }
    if (row.landedCaseCost == null) {
      return {
        ...empty,
        blockReason: "Enter landed case cost. Supplier quoted cost is not landed cost and is not the customer price.",
      };
    }
    bySize[size] = { quotedCaseCost: row.quotedCaseCost, landedCaseCost: row.landedCaseCost };
  }

  if (!draft.landedCostConfirmed) {
    return {
      complete: false,
      trusted: false,
      blockReason: "Confirm the landed case cost. It will not be published as a customer price.",
      bySize,
    };
  }

  return { complete: true, trusted: true, blockReason: null, bySize };
}
