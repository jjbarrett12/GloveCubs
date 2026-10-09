import { calculateUnitsPerCase, hasPackagingMathConflict, normalizeCommercePackaging } from "@commerce-packaging/labels";
import {
  BOX_QUANTITY_VALUES,
  CASE_QUANTITY_VALUES,
  PACKAGING_VALUES,
} from "@/lib/catalogos/attribute-dictionary-types";
import type { FamilyPackaging, FamilySizeSlug, NewProductFamilyDraft } from "./types";

export function derivedUnitsPerCase(pack: FamilyPackaging): number | null {
  return calculateUnitsPerCase(pack.unitsPerInner, pack.innersPerCase);
}

export function packagingForSize(draft: NewProductFamilyDraft, size: FamilySizeSlug): FamilyPackaging {
  if (draft.samePackagingForAllSizes) return draft.packaging;
  return draft.packagingBySize[size] ?? { unitsPerInner: null, innersPerCase: null };
}

export type FamilyPackagingGate = {
  complete: boolean;
  blockReason: string | null;
  unitsPerCase: number | null;
};

function gateOnePack(pack: FamilyPackaging, sizeLabel?: string): FamilyPackagingGate {
  const prefix = sizeLabel ? `${sizeLabel}: ` : "";
  const inner = pack.unitsPerInner;
  const inners = pack.innersPerCase;
  if (inner == null || !Number.isInteger(inner) || inner <= 0) {
    return { complete: false, blockReason: `${prefix}Choose gloves per box.`, unitsPerCase: null };
  }
  if (inners == null || !Number.isInteger(inners) || inners <= 0) {
    return { complete: false, blockReason: `${prefix}Choose boxes per case.`, unitsPerCase: null };
  }
  const pallet = pack.casesPerPallet;
  if (pallet != null && (!Number.isInteger(pallet) || pallet <= 0)) {
    return { complete: false, blockReason: `${prefix}Cases per pallet must be a positive whole number.`, unitsPerCase: null };
  }
  const cp = normalizeCommercePackaging(
    {
      inner_unit_type: "box",
      units_per_inner: inner,
      inners_per_case: inners,
      cases_per_pallet: pallet ?? null,
      units_per_case_overridden: false,
      sell_by_case_enabled: true,
      sell_by_pallet_enabled: false,
    },
    "disposable_gloves"
  );
  const units = derivedUnitsPerCase(pack);
  if (units == null || units <= 0 || cp.units_per_case == null || cp.units_per_case <= 0) {
    return { complete: false, blockReason: `${prefix}Units per case could not be calculated.`, unitsPerCase: null };
  }
  if (hasPackagingMathConflict(cp)) {
    return {
      complete: false,
      blockReason: `${prefix}Units per case must equal gloves per box × boxes per case.`,
      unitsPerCase: units,
    };
  }
  const facets = packagingFacetSlugs(pack);
  if (!facets.packaging) {
    return {
      complete: false,
      blockReason: `${prefix}This pack count does not map to a storefront packaging facet. Use a 100, 200, or 250 glove box, or a case total of 1000 or 2000+.`,
      unitsPerCase: units,
    };
  }
  return { complete: true, blockReason: null, unitsPerCase: units };
}

export function evaluateFamilyPackaging(draft: NewProductFamilyDraft): FamilyPackagingGate {
  if (draft.samePackagingForAllSizes) return gateOnePack(draft.packaging);
  if (draft.sizes.length === 0) {
    return { complete: false, blockReason: "Select at least one size before packaging.", unitsPerCase: null };
  }
  for (const size of draft.sizes) {
    const gate = gateOnePack(packagingForSize(draft, size), size.toUpperCase());
    if (!gate.complete) return gate;
  }
  return gateOnePack(packagingForSize(draft, draft.sizes[0]!));
}

export function packagingFacetSlugs(pack: FamilyPackaging): {
  box_quantity?: string;
  case_quantity?: string;
  packaging?: (typeof PACKAGING_VALUES)[number];
} {
  const inner = pack.unitsPerInner;
  const units = derivedUnitsPerCase(pack);
  const out: {
    box_quantity?: string;
    case_quantity?: string;
    packaging?: (typeof PACKAGING_VALUES)[number];
  } = {};
  if (inner != null && (BOX_QUANTITY_VALUES as readonly string[]).includes(String(inner))) {
    out.box_quantity = String(inner);
  }
  if (units != null && (CASE_QUANTITY_VALUES as readonly string[]).includes(String(units))) {
    out.case_quantity = String(units);
  }
  if (units === 1000) out.packaging = "case_1000_ct";
  else if (units != null && units >= 2000) out.packaging = "case_2000_plus_ct";
  else if (inner === 100) out.packaging = "box_100_ct";
  else if (inner === 200 || inner === 250) out.packaging = "box_200_250_ct";
  return out;
}
