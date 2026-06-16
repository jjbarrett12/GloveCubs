/**
 * Apply ProductSetupApplyCandidateV1 to staged normalized_data (pure, testable).
 */

import { normalizeCommercePackaging } from "@commerce-packaging/labels";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "@commerce-packaging/types";
import type { CommercePackagingV1 } from "@commerce-packaging/types";
import { getCommercePackagingFromNormalized } from "@commerce-packaging/staging-bridge";
import { stripFacetExtractionUiState } from "@/lib/extraction/staging-facet-merge";
import type { ProductSetupApplyCandidateV1 } from "./product-setup-apply-candidates";
import { isSafeProductSetupApplyCandidate } from "./product-setup-apply-candidates";

export type ApplyProductSetupFieldsResult = {
  normalizedData: Record<string, unknown>;
  appliedFields: string[];
  skippedFields: Array<{ fieldKey: string; reason: string }>;
  errors: Array<{ fieldKey: string; error: string }>;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function applyIdentityField(
  nd: Record<string, unknown>,
  candidate: ProductSetupApplyCandidateV1
): Record<string, unknown> {
  const value = candidate.extractedValue;
  if (!value) return nd;
  switch (candidate.fieldKey) {
    case "title": {
      const title = value;
      return {
        ...nd,
        canonical_title: title,
        name: title,
        title,
        product_name: title,
      };
    }
    case "brand":
      return { ...nd, brand: value };
    case "manufacturer":
      return { ...nd, manufacturer: value };
    case "manufacturerSku":
      return {
        ...nd,
        manufacturer_sku: value,
        manufacturer_part_number: str(nd.manufacturer_part_number) || value,
      };
    case "description":
      return { ...nd, long_description: value, description: value };
    default:
      return nd;
  }
}

function applyAttributeField(
  nd: Record<string, unknown>,
  candidate: ProductSetupApplyCandidateV1
): Record<string, unknown> {
  const value = candidate.normalizedValue;
  if (!value) return nd;
  const fa = { ...((nd.filter_attributes ?? nd.attributes) as Record<string, unknown>) };

  if (candidate.fieldKey === "latexFree" && value === "latex_free") {
    const existing = Array.isArray(fa.certifications) ? [...(fa.certifications as string[])] : [];
    if (!existing.includes("latex_free")) existing.push("latex_free");
    fa.certifications = existing;
    return stripFacetExtractionUiState({
      ...nd,
      filter_attributes: fa,
      attributes: fa,
    });
  }

  const keyMap: Record<string, string> = {
    thicknessMil: "thickness_mil",
    cuffType: "cuff_style",
    powderFree: "powder",
    handOrientation: "hand_orientation",
    grade: "grade",
    packaging: "packaging",
    sterility: "sterility",
  };
  const key = keyMap[candidate.fieldKey] ?? candidate.fieldKey;
  fa[key] = value;
  if (candidate.fieldKey === "material") fa.material = value;
  return stripFacetExtractionUiState({
    ...nd,
    filter_attributes: fa,
    attributes: fa,
  });
}

function applyCommercePackagingField(
  nd: Record<string, unknown>,
  candidate: ProductSetupApplyCandidateV1
): Record<string, unknown> {
  const existing = getCommercePackagingFromNormalized(nd);
  const base: CommercePackagingV1 = existing ?? {
    schema_version: COMMERCE_PACKAGING_SCHEMA_VERSION,
    sell_by_case_enabled: true,
    sell_by_pallet_enabled: false,
    inner_unit_type: null,
    units_per_inner: null,
    inners_per_case: null,
    units_per_case: null,
    units_per_case_overridden: false,
    unit_noun: "glove",
    cases_per_pallet: null,
    units_per_pallet: null,
    units_per_pallet_overridden: false,
    case_price: null,
    pallet_price: null,
    pallet_discount_percent: null,
    field_provenance: {},
    parse_warnings: [],
  };

  const patch: Partial<CommercePackagingV1> = { ...base };
  const n = Number(candidate.extractedValue);

  switch (candidate.fieldKey) {
    case "boxesPerCase":
      patch.inners_per_case = n;
      patch.inner_unit_type = patch.inner_unit_type ?? "box";
      break;
    case "unitsPerBox":
      patch.units_per_inner = n;
      break;
    case "unitsPerCase":
      patch.units_per_case = n;
      break;
    case "casesPerPallet":
      patch.cases_per_pallet = n;
      break;
    case "sellUnit":
      patch.unit_noun = candidate.extractedValue ?? "glove";
      break;
    default:
      return nd;
  }

  const normalized = normalizeCommercePackaging(
    {
      inner_unit_type: patch.inner_unit_type,
      units_per_inner: patch.units_per_inner,
      inners_per_case: patch.inners_per_case,
      units_per_case: patch.units_per_case,
      cases_per_pallet: patch.cases_per_pallet,
      unit_noun: patch.unit_noun,
      case_price: patch.case_price,
      pallet_price: patch.pallet_price,
      field_provenance: {
        ...base.field_provenance,
        [candidate.fieldKey]: "product_setup_wizard_apply",
      },
    },
    typeof nd.category_slug === "string" ? nd.category_slug : null
  );

  const legacy: Record<string, unknown> = { ...nd };
  if (patch.inners_per_case != null) legacy.boxes_per_case = patch.inners_per_case;
  if (patch.units_per_inner != null) {
    legacy.gloves_per_box = patch.units_per_inner;
    legacy.box_qty = patch.units_per_inner;
  }
  if (patch.units_per_case != null) {
    legacy.total_gloves_per_case = patch.units_per_case;
    legacy.case_qty = patch.units_per_case;
  }

  return {
    ...legacy,
    commerce_packaging: normalized,
  };
}

function applyImageField(
  nd: Record<string, unknown>,
  candidate: ProductSetupApplyCandidateV1,
  galleryUrls?: string[]
): Record<string, unknown> {
  if (candidate.fieldKey === "galleryImages" && galleryUrls?.length) {
    return { ...nd, images: galleryUrls, image_url: galleryUrls[0] };
  }
  if (candidate.fieldKey === "selectedPrimary" && candidate.extractedValue) {
    const urls = [
      candidate.extractedValue,
      ...((nd.images as string[]) ?? []).filter((u) => u !== candidate.extractedValue),
    ];
    return { ...nd, images: urls, image_url: candidate.extractedValue };
  }
  return nd;
}

/** Apply safe candidates to normalized_data; idempotent for already-applied values. */
export function applyProductSetupCandidatesToNormalizedData(
  normalizedData: Record<string, unknown>,
  candidates: ProductSetupApplyCandidateV1[],
  options?: { galleryUrls?: string[] }
): ApplyProductSetupFieldsResult {
  let nd = { ...normalizedData };
  const appliedFields: string[] = [];
  const skippedFields: Array<{ fieldKey: string; reason: string }> = [];
  const errors: Array<{ fieldKey: string; error: string }> = [];

  const appliedMeta = (nd.product_setup_wizard_applied as { fieldKeys?: string[] } | undefined) ?? {
    fieldKeys: [],
  };
  const priorApplied = new Set(appliedMeta.fieldKeys ?? []);

  for (const candidate of candidates) {
    if (candidate.applyStatus === "already_applied") {
      skippedFields.push({ fieldKey: candidate.fieldKey, reason: "Already applied" });
      continue;
    }
    if (!isSafeProductSetupApplyCandidate(candidate, {
      hasEvidence: Boolean(candidate.evidenceText?.trim()),
    })) {
      skippedFields.push({
        fieldKey: candidate.fieldKey,
        reason: candidate.blockReason ?? "Not safe to apply",
      });
      continue;
    }

    try {
      switch (candidate.mutationKind) {
        case "identity":
          nd = applyIdentityField(nd, candidate);
          break;
        case "attribute":
          nd = applyAttributeField(nd, candidate);
          break;
        case "commerce_packaging":
          nd = applyCommercePackagingField(nd, candidate);
          break;
        case "image":
          nd = applyImageField(nd, candidate, options?.galleryUrls);
          break;
        default:
          skippedFields.push({ fieldKey: candidate.fieldKey, reason: candidate.blockReason ?? "Unsupported mutation" });
          continue;
      }
      appliedFields.push(candidate.fieldKey);
      priorApplied.add(candidate.fieldKey);
    } catch (e) {
      errors.push({
        fieldKey: candidate.fieldKey,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (appliedFields.length) {
    nd.product_setup_wizard_applied = {
      fieldKeys: [...priorApplied],
      appliedAt: new Date().toISOString(),
    };
  }

  return { normalizedData: nd, appliedFields, skippedFields, errors };
}
