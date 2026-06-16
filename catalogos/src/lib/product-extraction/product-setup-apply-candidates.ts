/**
 * ProductSetupApplyCandidateV1 — derived apply targets from wizard readiness + contract summary.
 * Guards are re-checked server-side before any write.
 */

import {
  COLOR_VALUES,
  CUFF_STYLE_VALUES,
  GRADE_VALUES,
  HAND_ORIENTATION_VALUES,
  MATERIAL_VALUES,
  PACKAGING_VALUES,
  STERILITY_VALUES,
  TEXTURE_VALUES,
  THICKNESS_MIL_VALUES,
} from "@/lib/catalogos/attribute-dictionary-types";
import { isGlvLookingSku } from "./product-setup-contract";
import type { ProductSetupContractSummaryV1 } from "./product-setup-contract";
import type {
  ProductSetupWizardField,
  ProductSetupWizardReadinessV1,
  ProductSetupWizardSection,
} from "./product-setup-wizard-readiness";

export const PRODUCT_SETUP_APPLY_CANDIDATE_SCHEMA_VERSION =
  "glovecubs.product_setup_apply_candidate.v1" as const;

export type ProductSetupApplyStatus =
  | "safe_to_apply"
  | "needs_review"
  | "blocked"
  | "already_applied";

export type ProductSetupApplyMutationKind =
  | "identity"
  | "attribute"
  | "commerce_packaging"
  | "image"
  | "sku_proposal";

export type ProductSetupApplyCandidateV1 = {
  schemaVersion: typeof PRODUCT_SETUP_APPLY_CANDIDATE_SCHEMA_VERSION;
  fieldKey: string;
  sectionKey: string;
  targetPath: string;
  extractedValue?: string;
  normalizedValue?: string;
  displayValue: string;
  confidence?: number;
  evidenceText?: string;
  applyStatus: ProductSetupApplyStatus;
  blockReason?: string;
  mutationKind: ProductSetupApplyMutationKind;
};

const CONFIDENCE_APPLY_MIN = 0.75;
const IMAGE_SCORE_MIN = 0.45;

const HIGH_RISK_FIELD_KEYS = new Set([
  "foodSafe",
  "food_safe",
  "medicalGrade",
  "medical_grade",
  "examGrade",
  "exam_grade",
  "sterile",
  "chemo_rated",
  "chemoRated",
  "chemical_resistant",
  "rawLabels",
  "canonicalSlugs",
  "needsReview",
  "casePrice",
  "palletPrice",
  "pricingReadiness",
  "canPublish",
  "missingAttributes",
  "casePricing",
  "skuBlockers",
  "proposedParentGlvSku",
  "proposedVariantGlvSkus",
  "proposedGlvVariantSkus",
]);

const SKU_FLOW_KEYS = new Set([
  "proposedParentGlvSku",
  "proposedVariantGlvSkus",
  "proposedGlvVariantSkus",
  "collisionWarnings",
]);

const REVIEW_ONLY_SECTIONS = new Set(["certifications", "publishReadiness", "pricing", "variants"]);

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function valuesMatch(current: unknown, proposed: unknown): boolean {
  return str(current).toLowerCase() === str(proposed).toLowerCase();
}

export function isHighRiskComplianceField(fieldKey: string): boolean {
  return HIGH_RISK_FIELD_KEYS.has(fieldKey);
}

export function isSafeIdentityField(
  fieldKey: string,
  value: string | undefined,
  confidence: number | undefined
): boolean {
  if (!value) return false;
  if (fieldKey === "manufacturerSku" && isGlvLookingSku(value)) return false;
  if (confidence != null && confidence < CONFIDENCE_APPLY_MIN) return false;
  return ["title", "brand", "manufacturer", "manufacturerSku", "description"].includes(fieldKey);
}

export function isSafeAttributeField(
  fieldKey: string,
  normalizedValue: string | undefined,
  confidence: number | undefined,
  hasEvidence: boolean
): boolean {
  if (isHighRiskComplianceField(fieldKey)) return false;
  if (!normalizedValue) return false;
  if (confidence != null && confidence < CONFIDENCE_APPLY_MIN) return false;

  const allowed: Record<string, readonly string[]> = {
    material: MATERIAL_VALUES as unknown as string[],
    color: COLOR_VALUES as unknown as string[],
    thicknessMil: THICKNESS_MIL_VALUES as unknown as string[],
    texture: TEXTURE_VALUES as unknown as string[],
    cuffType: CUFF_STYLE_VALUES as unknown as string[],
    grade: GRADE_VALUES as unknown as string[],
    packaging: PACKAGING_VALUES as unknown as string[],
    handOrientation: HAND_ORIENTATION_VALUES as unknown as string[],
    sterility: STERILITY_VALUES as unknown as string[],
  };

  if (fieldKey === "powderFree" || fieldKey === "latexFree") {
    return hasEvidence && confidence != null && confidence >= CONFIDENCE_APPLY_MIN;
  }

  if (fieldKey === "sterility") {
    return (
      normalizedValue === "non_sterile" &&
      hasEvidence &&
      confidence != null &&
      confidence >= CONFIDENCE_APPLY_MIN
    );
  }

  const allowedList = allowed[fieldKey];
  if (!allowedList) return false;
  return allowedList.includes(normalizedValue);
}

export function isSafeCommercePackagingField(
  fieldKey: string,
  value: unknown,
  confidence: number | undefined
): boolean {
  if (fieldKey === "casesPerPallet") {
    return confidence != null && confidence >= CONFIDENCE_APPLY_MIN && value != null;
  }
  if (["boxesPerCase", "unitsPerBox", "unitsPerCase", "sellUnit"].includes(fieldKey)) {
    if (value == null || value === "") return false;
    if (fieldKey !== "sellUnit") {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return false;
    }
    return confidence == null || confidence >= CONFIDENCE_APPLY_MIN;
  }
  return false;
}

export function isSafeImageField(
  contractSummary: ProductSetupContractSummaryV1,
  kind: "primary" | "gallery"
): boolean {
  const img = contractSummary.images;
  if (kind === "primary") {
    const primary = img.candidates.find((c) => c.recommendedPrimary);
    if (!primary) return false;
    if (primary.rejectionReason) return false;
    if (primary.score < IMAGE_SCORE_MIN) return false;
    return primary.role === "primary_product" || primary.role === "alternate_product";
  }
  return img.selectedGalleryUrls.length > 0 && img.candidates.some((c) => c.recommendedGallery);
}

export function getProductSetupApplyBlockReason(
  candidate: Pick<
    ProductSetupApplyCandidateV1,
    "fieldKey" | "sectionKey" | "mutationKind" | "confidence" | "extractedValue" | "normalizedValue"
  >,
  ctx?: { hasEvidence?: boolean }
): string | undefined {
  if (REVIEW_ONLY_SECTIONS.has(candidate.sectionKey)) {
    return "Section is review-only in this phase";
  }
  if (candidate.mutationKind === "sku_proposal" || SKU_FLOW_KEYS.has(candidate.fieldKey)) {
    return "Use SKU proposal flow in the SKU panel";
  }
  if (isHighRiskComplianceField(candidate.fieldKey)) {
    return "High-risk compliance field — manual review required";
  }
  if (candidate.fieldKey === "manufacturerSku" && candidate.extractedValue && isGlvLookingSku(candidate.extractedValue)) {
    return "GLV-looking SKU cannot be used as manufacturer SKU";
  }
  if (candidate.confidence != null && candidate.confidence < CONFIDENCE_APPLY_MIN) {
    return `Confidence ${(candidate.confidence * 100).toFixed(0)}% below apply threshold`;
  }
  if (candidate.mutationKind === "attribute" && !candidate.normalizedValue) {
    return "Value is not an allowed canonical dictionary value";
  }
  if ((candidate.fieldKey === "powderFree" || candidate.fieldKey === "latexFree") && !ctx?.hasEvidence) {
    return "Explicit source evidence required";
  }
  if (["casePrice", "palletPrice"].includes(candidate.fieldKey)) {
    return "Pricing must be entered manually or from trusted pricing input";
  }
  return undefined;
}

export function isSafeProductSetupApplyCandidate(
  candidate: ProductSetupApplyCandidateV1,
  ctx?: { hasEvidence?: boolean }
): boolean {
  if (candidate.applyStatus === "already_applied") return false;
  if (candidate.applyStatus === "blocked") return false;
  const block = getProductSetupApplyBlockReason(candidate, ctx);
  return !block && candidate.applyStatus === "safe_to_apply";
}

function attributeNormalizedValue(
  fieldKey: string,
  contract: ProductSetupContractSummaryV1,
  nd: Record<string, unknown>
): string | undefined {
  const fa = (nd.filter_attributes ?? nd.attributes) as Record<string, unknown> | undefined;
  const attrs = contract.attributes;

  switch (fieldKey) {
    case "material": {
      const fromFa = str(fa?.material);
      if (fromFa && (MATERIAL_VALUES as readonly string[]).includes(fromFa)) return fromFa;
      const raw = str(attrs.material).toLowerCase();
      if (raw === "polyethylene" || raw === "pe") return "polyethylene_pe";
      if ((MATERIAL_VALUES as readonly string[]).includes(raw)) return raw;
      return undefined;
    }
    case "color": {
      const fromFa = str(fa?.color);
      if (fromFa && (COLOR_VALUES as readonly string[]).includes(fromFa)) return fromFa;
      const raw = str(attrs.color).toLowerCase();
      return (COLOR_VALUES as readonly string[]).includes(raw) ? raw : undefined;
    }
    case "thicknessMil": {
      const fromFa = str(fa?.thickness_mil);
      if (fromFa && (THICKNESS_MIL_VALUES as readonly string[]).includes(fromFa)) return fromFa;
      if (attrs.thicknessMil != null) {
        const s = String(attrs.thicknessMil);
        return (THICKNESS_MIL_VALUES as readonly string[]).includes(s) ? s : undefined;
      }
      return undefined;
    }
    case "powderFree":
      if (fa?.powder === "powder_free") return "powder_free";
      if (fa?.powder === "powdered") return "powdered";
      return attrs.powderFree === true ? "powder_free" : attrs.powderFree === false ? "powdered" : undefined;
    case "latexFree": {
      const certs = fa?.certifications;
      if (Array.isArray(certs) && certs.includes("latex_free")) return "latex_free";
      return attrs.latexFree === true ? "latex_free" : undefined;
    }
    case "grade": {
      const fromFa = str(fa?.grade);
      if (fromFa && (GRADE_VALUES as readonly string[]).includes(fromFa)) return fromFa;
      if (attrs.examGrade === true || attrs.medicalGrade === true) return "medical_exam_grade";
      return undefined;
    }
    case "packaging": {
      const fromFa = str(fa?.packaging);
      if (fromFa && (PACKAGING_VALUES as readonly string[]).includes(fromFa)) return fromFa;
      const unitsPerCase = contract.commercePackaging.unitsPerCase;
      if (unitsPerCase != null && unitsPerCase >= 2000) return "case_2000_plus_ct";
      if (unitsPerCase != null && unitsPerCase >= 1000) return "case_1000_ct";
      if (unitsPerCase != null && unitsPerCase >= 200) return "box_200_250_ct";
      if (unitsPerCase != null && unitsPerCase >= 100) return "box_100_ct";
      return undefined;
    }
    case "handOrientation": {
      const fromFa = str(fa?.hand_orientation);
      if ((HAND_ORIENTATION_VALUES as readonly string[]).includes(fromFa)) return fromFa;
      return "ambidextrous";
    }
    case "sterility": {
      const fromFa = str(fa?.sterility);
      if ((STERILITY_VALUES as readonly string[]).includes(fromFa)) return fromFa;
      if (attrs.sterile === false) return "non_sterile";
      return undefined;
    }
    case "texture": {
      const raw = str(attrs.texture).toLowerCase();
      if (raw.includes("textured")) return "fully_textured";
      if ((TEXTURE_VALUES as readonly string[]).includes(raw)) return raw;
      return undefined;
    }
    case "cuffType": {
      const raw = str(attrs.cuffType).toLowerCase().replace(/\s+/g, "_");
      return (CUFF_STYLE_VALUES as readonly string[]).includes(raw) ? raw : undefined;
    }
    default:
      return undefined;
  }
}

function currentIdentityValue(nd: Record<string, unknown>, fieldKey: string): string {
  switch (fieldKey) {
    case "title":
      return str(nd.canonical_title ?? nd.name ?? nd.title);
    case "brand":
      return str(nd.brand);
    case "manufacturer":
      return str(nd.manufacturer);
    case "manufacturerSku":
      return str(nd.manufacturer_sku ?? nd.manufacturer_part_number);
    case "description":
      return str(nd.long_description ?? nd.description);
    default:
      return "";
  }
}

function fieldToCandidate(
  section: ProductSetupWizardSection,
  field: ProductSetupWizardField,
  contract: ProductSetupContractSummaryV1,
  nd: Record<string, unknown>
): ProductSetupApplyCandidateV1 | null {
  const sectionKey = section.key;
  const fieldKey = field.key;

  if (REVIEW_ONLY_SECTIONS.has(sectionKey)) return null;

  let mutationKind: ProductSetupApplyMutationKind = "identity";
  let targetPath = `normalized_data.${fieldKey}`;
  let normalizedValue: string | undefined;
  let extractedValue = field.extractedValue ?? (field.displayValue !== "—" ? field.displayValue : undefined);
  const hasEvidence = Boolean(field.evidenceText?.trim() || contract.source.extractionMode === "v2");

  if (sectionKey === "attributes") {
    mutationKind = "attribute";
    normalizedValue = attributeNormalizedValue(fieldKey, contract, nd);
    const attrPathMap: Record<string, string> = {
      thicknessMil: "thickness_mil",
      cuffType: "cuff_style",
      powderFree: "powder",
      handOrientation: "hand_orientation",
      grade: "grade",
      packaging: "packaging",
      sterility: "sterility",
      latexFree: "certifications",
    };
    targetPath = `filter_attributes.${attrPathMap[fieldKey] ?? fieldKey}`;
  } else if (sectionKey === "commercePackaging") {
    mutationKind = "commerce_packaging";
    if (fieldKey === "packaging") {
      mutationKind = "attribute";
      normalizedValue = attributeNormalizedValue("packaging", contract, nd);
      targetPath = "filter_attributes.packaging";
    } else {
      targetPath = `commerce_packaging.${fieldKey}`;
    }
    const cp = contract.commercePackaging;
    if (fieldKey === "boxesPerCase") extractedValue = cp.boxesPerCase != null ? String(cp.boxesPerCase) : undefined;
    if (fieldKey === "unitsPerBox") extractedValue = cp.unitsPerBox != null ? String(cp.unitsPerBox) : undefined;
    if (fieldKey === "unitsPerCase") extractedValue = cp.unitsPerCase != null ? String(cp.unitsPerCase) : undefined;
    if (fieldKey === "sellUnit") extractedValue = cp.sellUnit;
    if (fieldKey === "casesPerPallet") extractedValue = cp.casesPerPallet != null ? String(cp.casesPerPallet) : undefined;
    if (fieldKey === "packaging") {
      extractedValue = attributeNormalizedValue("packaging", contract, nd);
    }
  } else if (sectionKey === "images") {
    mutationKind = "image";
    if (fieldKey === "selectedPrimary") {
      targetPath = "normalized_data.images[0]";
      extractedValue = contract.images.selectedPrimaryUrl;
    } else {
      return null;
    }
  } else if (sectionKey === "sku") {
    mutationKind = "sku_proposal";
  } else if (sectionKey === "identity") {
    mutationKind = "identity";
    const paths: Record<string, string> = {
      title: "normalized_data.canonical_title",
      brand: "normalized_data.brand",
      manufacturer: "normalized_data.manufacturer",
      manufacturerSku: "normalized_data.manufacturer_sku",
      description: "normalized_data.long_description",
    };
    targetPath = paths[fieldKey] ?? targetPath;
    if (fieldKey === "manufacturerSku") {
      extractedValue = contract.identity.manufacturerSku ?? contract.sku.manufacturerSku;
    }
  } else {
    return null;
  }

  if (mutationKind === "sku_proposal") {
    return {
      schemaVersion: PRODUCT_SETUP_APPLY_CANDIDATE_SCHEMA_VERSION,
      fieldKey,
      sectionKey,
      targetPath,
      extractedValue,
      displayValue: field.displayValue,
      confidence: field.confidence,
      evidenceText: field.evidenceText,
      applyStatus: "blocked",
      blockReason: "Use SKU proposal flow in the SKU panel",
      mutationKind,
    };
  }

  let applyStatus: ProductSetupApplyStatus = "needs_review";
  const blockReason = getProductSetupApplyBlockReason(
    { fieldKey, sectionKey, mutationKind, confidence: field.confidence, extractedValue, normalizedValue },
    { hasEvidence }
  );

  if (blockReason) {
    applyStatus =
      isHighRiskComplianceField(fieldKey) ||
      (fieldKey === "manufacturerSku" && extractedValue && isGlvLookingSku(extractedValue))
        ? "blocked"
        : "needs_review";
  } else if (mutationKind === "identity" && isSafeIdentityField(fieldKey, extractedValue, field.confidence)) {
    applyStatus = "safe_to_apply";
  } else if (
    mutationKind === "attribute" &&
    isSafeAttributeField(fieldKey, normalizedValue, field.confidence, hasEvidence)
  ) {
    applyStatus = "safe_to_apply";
  } else if (
    mutationKind === "commerce_packaging" &&
    isSafeCommercePackagingField(fieldKey, extractedValue, field.confidence ?? contract.commercePackaging.confidence)
  ) {
    applyStatus = "safe_to_apply";
  } else if (mutationKind === "image" && fieldKey === "selectedPrimary" && isSafeImageField(contract, "primary")) {
    applyStatus = "safe_to_apply";
  }

  if (applyStatus === "safe_to_apply") {
    if (mutationKind === "identity" && valuesMatch(currentIdentityValue(nd, fieldKey), extractedValue)) {
      applyStatus = "already_applied";
    }
    if (mutationKind === "attribute" && normalizedValue) {
      const fa = (nd.filter_attributes ?? nd.attributes) as Record<string, unknown>;
      const attrKeyMap: Record<string, string> = {
        thicknessMil: "thickness_mil",
        cuffType: "cuff_style",
        powderFree: "powder",
        handOrientation: "hand_orientation",
        grade: "grade",
        packaging: "packaging",
        sterility: "sterility",
      };
      const attrKey = attrKeyMap[fieldKey] ?? fieldKey;
      if (fieldKey === "latexFree") {
        const certs = fa?.certifications;
        if (Array.isArray(certs) && certs.includes("latex_free")) applyStatus = "already_applied";
      } else if (valuesMatch(fa?.[attrKey], normalizedValue)) {
        applyStatus = "already_applied";
      }
    }
    if (mutationKind === "image") {
      const imgs = nd.images as string[] | undefined;
      if (imgs?.[0] && valuesMatch(imgs[0], extractedValue)) applyStatus = "already_applied";
    }
  }

  return {
    schemaVersion: PRODUCT_SETUP_APPLY_CANDIDATE_SCHEMA_VERSION,
    fieldKey,
    sectionKey,
    targetPath,
    extractedValue,
    normalizedValue,
    displayValue: field.displayValue,
    confidence: field.confidence,
    evidenceText: field.evidenceText,
    applyStatus,
    blockReason,
    mutationKind,
  };
}

/** Build apply candidates from wizard readiness + contract (derived, not canonical). */
export function buildProductSetupApplyCandidates(
  readiness: ProductSetupWizardReadinessV1,
  contractSummary: ProductSetupContractSummaryV1,
  normalizedData: Record<string, unknown>
): ProductSetupApplyCandidateV1[] {
  const candidates: ProductSetupApplyCandidateV1[] = [];

  for (const section of Object.values(readiness.sections)) {
    for (const field of section.fields) {
      const c = fieldToCandidate(section, field, contractSummary, normalizedData);
      if (c) candidates.push(c);
    }
  }

  if (isSafeImageField(contractSummary, "gallery")) {
    const galleryUrls = contractSummary.images.selectedGalleryUrls;
    const imgs = normalizedData.images as string[] | undefined;
    const already =
      Array.isArray(imgs) &&
      galleryUrls.length > 0 &&
      galleryUrls.every((u, i) => valuesMatch(imgs[i], u));
    candidates.push({
      schemaVersion: PRODUCT_SETUP_APPLY_CANDIDATE_SCHEMA_VERSION,
      fieldKey: "galleryImages",
      sectionKey: "images",
      targetPath: "normalized_data.images",
      extractedValue: galleryUrls.join(", "),
      displayValue: `${galleryUrls.length} gallery image(s)`,
      confidence: readiness.sections.images.confidence,
      applyStatus: already ? "already_applied" : "safe_to_apply",
      mutationKind: "image",
    });
  }

  return candidates;
}

export function filterApplyCandidates(
  candidates: ProductSetupApplyCandidateV1[],
  opts: { fieldKeys?: string[]; sectionKey?: string; safeOnly?: boolean }
): ProductSetupApplyCandidateV1[] {
  return candidates.filter((c) => {
    if (opts.fieldKeys?.length && !opts.fieldKeys.includes(c.fieldKey)) return false;
    if (opts.sectionKey && c.sectionKey !== opts.sectionKey) return false;
    if (opts.safeOnly && c.applyStatus !== "safe_to_apply") return false;
    return true;
  });
}
