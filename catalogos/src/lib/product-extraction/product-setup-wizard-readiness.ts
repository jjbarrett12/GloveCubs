/**
 * ProductSetupWizardReadinessV1 — derived read-only checklist from contract summary + staging signals.
 * Not a source of truth; does not mutate staged data.
 */

import type { PublishReadiness } from "@/lib/review/publish-guards";
import {
  buildProductSetupContractSummary,
  isProductSetupContractSummaryV1,
  resolveProductSetupContractFull,
  type ProductSetupContractSummaryV1,
  PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION,
} from "./product-setup-contract";
import type { ProductUrlExtractionV2Summary } from "./types";

export const PRODUCT_SETUP_WIZARD_READINESS_SCHEMA_VERSION =
  "glovecubs.product_setup_wizard_readiness.v1" as const;

export type ProductSetupWizardOverallStatus =
  | "publish_ready"
  | "needs_pricing"
  | "needs_image_review"
  | "needs_variant_review"
  | "needs_packaging_review"
  | "needs_attribute_review"
  | "needs_certification_review"
  | "missing_required_fields";

export type ProductSetupWizardFieldStatus = "ready" | "needs_review" | "missing" | "blocked";

export type ProductSetupWizardSectionStatus = ProductSetupWizardFieldStatus;

export type ProductSetupWizardField = {
  key: string;
  label: string;
  extractedValue?: string;
  normalizedValue?: string;
  displayValue: string;
  confidence?: number;
  status: ProductSetupWizardFieldStatus;
  source?: string;
  evidenceText?: string;
  canApplyLater: boolean;
  blockReason?: string;
};

export type ProductSetupWizardSection = {
  key: string;
  label: string;
  status: ProductSetupWizardSectionStatus;
  confidence: number;
  completedCount: number;
  totalCount: number;
  fields: ProductSetupWizardField[];
  warnings: string[];
};

export type ProductSetupWizardReadinessV1 = {
  schemaVersion: typeof PRODUCT_SETUP_WIZARD_READINESS_SCHEMA_VERSION;
  overallStatus: ProductSetupWizardOverallStatus;
  sections: {
    identity: ProductSetupWizardSection;
    variants: ProductSetupWizardSection;
    images: ProductSetupWizardSection;
    commercePackaging: ProductSetupWizardSection;
    attributes: ProductSetupWizardSection;
    certifications: ProductSetupWizardSection;
    sku: ProductSetupWizardSection;
    pricing: ProductSetupWizardSection;
    publishReadiness: ProductSetupWizardSection;
  };
  requiredFields: string[];
  safeFields: string[];
  reviewFields: string[];
  missingFields: string[];
  blockedReasons: string[];
  warnings: string[];
};

const CONFIDENCE_READY = 0.75;
const CONFIDENCE_REVIEW = 0.65;

const HIGH_RISK_ATTRIBUTE_KEYS = new Set([
  "foodSafe",
  "medicalGrade",
  "examGrade",
  "sterile",
  "food_safe",
  "exam_grade",
  "medical_grade",
]);

export type BuildProductSetupWizardReadinessInput = {
  contractSummary: ProductSetupContractSummaryV1;
  normalizedData?: Record<string, unknown>;
  publishReadiness?: PublishReadiness | null;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function displayVal(v: unknown): string {
  const s = str(v);
  return s || "—";
}

function fmtBool(v: unknown): string | undefined {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return undefined;
}

function fmtPowderNormalized(fa?: Record<string, unknown>): string | undefined {
  if (fa?.powder === "powder_free") return "powder_free";
  if (fa?.powder === "powdered") return "powdered";
  return fmtBool(fa?.powder_free);
}

function fmtLatexFreeNormalized(fa?: Record<string, unknown>): string | undefined {
  const certs = fa?.certifications;
  if (Array.isArray(certs) && certs.includes("latex_free")) return "latex_free";
  return fmtBool(fa?.latex_free);
}

function joinOrUndefined(parts: string[]): string | undefined {
  const s = parts.filter(Boolean).join(", ");
  return s || undefined;
}

function fieldStatus(
  hasValue: boolean,
  confidence: number | undefined,
  opts: {
    required?: boolean;
    highRisk?: boolean;
    needsReviewFlag?: boolean;
    blocked?: boolean;
    blockReason?: string;
  } = {}
): ProductSetupWizardFieldStatus {
  if (opts.blocked) return "blocked";
  if (!hasValue) return opts.required ? "missing" : "ready";
  if (opts.needsReviewFlag) return "needs_review";
  if (opts.highRisk && (confidence == null || confidence < CONFIDENCE_READY)) return "needs_review";
  if (confidence != null && confidence < CONFIDENCE_REVIEW) return "needs_review";
  return "ready";
}

function sectionFromFields(
  key: string,
  label: string,
  fields: ProductSetupWizardField[],
  warnings: string[] = []
): ProductSetupWizardSection {
  const totalCount = fields.length;
  const completedCount = fields.filter((f) => f.status === "ready").length;
  const confidences = fields.map((f) => f.confidence).filter((c): c is number => c != null && Number.isFinite(c));
  const confidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

  let status: ProductSetupWizardSectionStatus = "ready";
  if (fields.some((f) => f.status === "blocked")) status = "blocked";
  else if (fields.some((f) => f.status === "missing")) status = "missing";
  else if (fields.some((f) => f.status === "needs_review")) status = "needs_review";

  return { key, label, status, confidence, completedCount, totalCount, fields, warnings };
}

function mkField(
  key: string,
  label: string,
  extracted: unknown,
  opts: {
    normalized?: unknown;
    confidence?: number;
    required?: boolean;
    highRisk?: boolean;
    needsReview?: boolean;
    source?: string;
    evidenceText?: string;
    blocked?: boolean;
    blockReason?: string;
    canApplyLater?: boolean;
  } = {}
): ProductSetupWizardField {
  const hasValue = extracted != null && str(extracted) !== "" && extracted !== false;
  const status = fieldStatus(hasValue, opts.confidence, {
    required: opts.required,
    highRisk: opts.highRisk,
    needsReviewFlag: opts.needsReview,
    blocked: opts.blocked,
    blockReason: opts.blockReason,
  });
  return {
    key,
    label,
    extractedValue: hasValue ? displayVal(extracted) : undefined,
    normalizedValue: opts.normalized != null ? displayVal(opts.normalized) : undefined,
    displayValue: hasValue ? displayVal(extracted) : "—",
    confidence: opts.confidence,
    status,
    source: opts.source,
    evidenceText: opts.evidenceText,
    canApplyLater: opts.canApplyLater ?? status !== "blocked",
    blockReason: opts.blockReason,
  };
}

export function buildIdentitySection(
  summary: ProductSetupContractSummaryV1,
  nd?: Record<string, unknown>
): ProductSetupWizardSection {
  const id = summary.identity;
  const tax = summary.taxonomy;
  const fields = [
    mkField("title", "Title", id.title ?? nd?.canonical_title ?? nd?.name, {
      confidence: summary.confidence.identity,
      required: true,
      source: summary.source.extractionMode,
    }),
    mkField("brand", "Brand", id.brand ?? nd?.brand, { confidence: summary.confidence.identity }),
    mkField("manufacturer", "Manufacturer", id.manufacturer, { confidence: summary.confidence.identity }),
    mkField("manufacturerSku", "Manufacturer SKU", id.manufacturerSku ?? nd?.manufacturer_sku, {
      confidence: summary.confidence.identity,
    }),
    mkField("description", "Description", id.description, { confidence: summary.confidence.identity }),
    mkField("categorySlug", "Category / product type", tax.categorySlug ?? tax.productType ?? nd?.category_slug, {
      confidence: tax.confidence,
      required: true,
    }),
  ];
  return sectionFromFields("identity", "Identity", fields, summary.review.warnings);
}

export function buildVariantSection(summary: ProductSetupContractSummaryV1): ProductSetupWizardSection {
  const v = summary.variants;
  const sizes = v.proposedVariants.map((pv) => pv.size).filter(Boolean);
  const fields = [
    mkField("hasVariants", "Has variants", v.hasVariants ? "Yes" : "No", {
      confidence: v.confidence,
    }),
    mkField("variantAxis", "Variant axis", v.variantAxis.join(", ") || "—", { confidence: v.confidence }),
    mkField("detectedSizes", "Detected sizes", sizes.join(", ") || "—", {
      confidence: v.confidence,
      needsReview: v.hasVariants && sizes.length === 0,
    }),
    mkField("manufacturerVariantSkus", "Manufacturer variant SKUs", v.manufacturerVariantSkus.join(", ") || "—", {
      confidence: v.confidence,
    }),
    mkField(
      "proposedGlvVariantSkus",
      "Proposed GLV variant SKUs",
      summary.sku.proposedVariantGlvSkus.join(", ") || "—",
      { confidence: summary.confidence.variants }
    ),
    mkField("familyConfidence", "Variant / family confidence", `${Math.round(v.confidence * 100)}%`, {
      confidence: v.confidence,
      needsReview: v.confidence < CONFIDENCE_READY && v.hasVariants,
    }),
  ];
  const warnings = [...v.unresolvedNotes];
  if (summary.review.fieldsNeedingReview.includes("variants")) {
    warnings.push("Contract flagged variants for review");
  }
  return sectionFromFields("variants", "Variants", fields, warnings);
}

export function buildImageSection(summary: ProductSetupContractSummaryV1): ProductSetupWizardSection {
  const img = summary.images;
  const rejected = img.candidates.filter((c) => !c.recommendedGallery && c.rejectionReason);
  const fields = [
    mkField("selectedPrimary", "Selected primary image", img.selectedPrimaryUrl, {
      confidence: summary.confidence.images,
      required: false,
      needsReview: !img.selectedPrimaryUrl,
    }),
    mkField("galleryCount", "Gallery image count", String(img.selectedGalleryUrls.length), {
      confidence: summary.confidence.images,
    }),
    mkField("candidateCount", "Image candidates", String(img.candidates.length), {
      confidence: summary.confidence.images,
    }),
    mkField(
      "candidateRoles",
      "Candidate roles / scores",
      img.candidates
        .slice(0, 6)
        .map((c) => `${c.role} (${(c.score * 100).toFixed(0)}%)`)
        .join("; ") || "—",
      { confidence: summary.confidence.images }
    ),
    mkField(
      "rejectedImages",
      "Rejected / low-confidence images",
      rejected.map((c) => `${c.role}${c.rejectionReason ? `: ${c.rejectionReason}` : ""}`).join("; ") || "None",
      { confidence: summary.confidence.images }
    ),
    mkField(
      "variantImageHints",
      "Variant / alt hints",
      img.candidates
        .filter((c) => c.variantHints)
        .map((c) => [c.variantHints?.size, c.variantHints?.color].filter(Boolean).join("/"))
        .filter(Boolean)
        .join(", ") || "—",
      { confidence: summary.confidence.images }
    ),
  ];
  const warnings: string[] = [];
  if (!img.selectedPrimaryUrl) warnings.push("No primary product image selected");
  if (summary.review.fieldsNeedingReview.includes("images")) warnings.push("Contract flagged images for review");
  return sectionFromFields("images", "Images", fields, warnings);
}

export function buildCommercePackagingSection(
  summary: ProductSetupContractSummaryV1,
  nd?: Record<string, unknown>
): ProductSetupWizardSection {
  const cp = summary.commercePackaging;
  const ndCp = nd?.commerce_packaging as Record<string, unknown> | undefined;
  const fa = (nd?.filter_attributes ?? nd?.attributes) as Record<string, unknown> | undefined;
  const fields = [
    mkField("sellUnit", "Sell unit", cp.sellUnit ?? "case", { confidence: cp.confidence }),
    mkField("boxesPerCase", "Boxes per case", cp.boxesPerCase ?? ndCp?.inners_per_case, {
      confidence: cp.confidence,
    }),
    mkField("unitsPerBox", "Units per box", cp.unitsPerBox ?? ndCp?.units_per_inner, {
      confidence: cp.confidence,
    }),
    mkField("unitsPerCase", "Units per case", cp.unitsPerCase ?? ndCp?.units_per_case, {
      confidence: cp.confidence,
      required: true,
    }),
    mkField("packaging", "Case packaging", fa?.packaging ?? (cp.unitsPerCase ? `case_${cp.unitsPerCase}_ct` : undefined), {
      normalized: fa?.packaging,
      confidence: cp.confidence,
    }),
    mkField("casesPerPallet", "Cases per pallet", cp.casesPerPallet ?? ndCp?.cases_per_pallet, {
      confidence: cp.confidence,
    }),
    mkField("caseLabel", "Packaging evidence", cp.caseLabel, {
      confidence: cp.confidence,
      needsReview: cp.needsReview,
    }),
  ];
  const warnings = cp.needsReview ? ["Commerce packaging flagged for review"] : [];
  return sectionFromFields("commercePackaging", "Commerce packaging", fields, warnings);
}

export function buildAttributeSection(
  summary: ProductSetupContractSummaryV1,
  nd?: Record<string, unknown>
): ProductSetupWizardSection {
  const a = summary.attributes;
  const fa = (nd?.filter_attributes ?? nd?.attributes) as Record<string, unknown> | undefined;
  const conf = (key: string) => a.confidenceByKey[key];
  const needs = (key: string) => a.needsReviewByKey.includes(key);

  const fields = [
    mkField("material", "Material", a.material, {
      normalized: fa?.material,
      confidence: conf("material"),
      required: true,
    }),
    mkField("color", "Color", a.color, { normalized: fa?.color, confidence: conf("color") }),
    mkField("thicknessMil", "Thickness (mil)", a.thicknessMil, {
      normalized: fa?.thickness_mil,
      confidence: conf("thicknessMil"),
    }),
    mkField("powderFree", "Powder free", fmtBool(a.powderFree), {
      normalized: fmtPowderNormalized(fa),
      confidence: conf("powderFree"),
    }),
    mkField("latexFree", "Latex free", fmtBool(a.latexFree), {
      normalized: fmtLatexFreeNormalized(fa),
      confidence: conf("latexFree"),
    }),
    mkField("grade", "Grade", a.grade ?? (a.examGrade ? "exam" : undefined), {
      normalized: fa?.grade,
      confidence: conf("examGrade") ?? conf("grade"),
    }),
    mkField("foodSafe", "Food safe", fmtBool(a.foodSafe), {
      normalized: fmtBool(fa?.food_safe),
      confidence: conf("foodSafe"),
      highRisk: true,
      needsReview: needs("foodSafe"),
    }),
    mkField("medicalGrade", "Medical grade", fmtBool(a.medicalGrade ?? a.examGrade), {
      confidence: conf("examGrade"),
      highRisk: true,
      needsReview: needs("examGrade") || needs("medicalGrade"),
      blocked: true,
      blockReason: "High-risk compliance field — manual review required",
      evidenceText: a.examGrade ? "Explicit exam / medical exam evidence" : undefined,
    }),
    mkField("examGrade", "Exam grade", fmtBool(a.examGrade), {
      confidence: conf("examGrade"),
      highRisk: true,
    }),
    mkField("sterile", "Sterile", fmtBool(a.sterile), {
      confidence: conf("sterile"),
      highRisk: true,
    }),
    mkField("sterility", "Sterility", fa?.sterility ?? (a.sterile === false ? "non_sterile" : a.sterile === true ? "sterile" : undefined), {
      normalized: fa?.sterility,
      confidence: conf("sterile"),
    }),
    mkField("handOrientation", "Hand orientation", fa?.hand_orientation ?? "ambidextrous", {
      normalized: fa?.hand_orientation ?? "ambidextrous",
      confidence: conf("handOrientation") ?? 0.5,
    }),
    mkField("texture", "Texture", a.texture, { confidence: conf("textured") ?? conf("grip") }),
    mkField("cuffType", "Cuff type", a.cuffType, { confidence: conf("cuffType") }),
    mkField("lengthInches", "Length (in)", a.lengthInches, { confidence: conf("lengthInches") }),
  ];
  return sectionFromFields("attributes", "Attributes", fields);
}

export function buildCertificationSection(summary: ProductSetupContractSummaryV1): ProductSetupWizardSection {
  const c = summary.certifications;
  const fields = [
    mkField("rawLabels", "Raw certification labels", joinOrUndefined(c.rawLabels), {
      confidence: c.confidence,
    }),
    mkField("canonicalSlugs", "Canonical slugs", joinOrUndefined(c.canonicalSlugs), {
      confidence: c.confidence,
      needsReview: c.rawLabels.length > 0 && c.canonicalSlugs.length === 0,
    }),
    mkField("needsReview", "Needs review", c.needsReview ? "Yes" : undefined, {
      confidence: c.confidence,
      needsReview: c.needsReview,
    }),
  ];
  return sectionFromFields("certifications", "Certifications", fields);
}

export function buildSkuSection(summary: ProductSetupContractSummaryV1): ProductSetupWizardSection {
  const s = summary.sku;
  const fields = [
    mkField("manufacturerSku", "Manufacturer SKU", s.manufacturerSku, {
      confidence: summary.confidence.identity,
    }),
    mkField("manufacturerPartNumber", "Manufacturer part number", s.manufacturerPartNumber, {
      confidence: summary.confidence.identity,
    }),
    mkField("proposedParentGlvSku", "Proposed parent GLV SKU", s.proposedParentGlvSku ?? "—", {
      confidence: summary.confidence.identity,
    }),
    mkField("proposedVariantGlvSkus", "Proposed variant GLV SKUs", s.proposedVariantGlvSkus.join(", ") || "—", {
      confidence: summary.confidence.variants,
    }),
    mkField(
      "collisionWarnings",
      "SKU collision warnings",
      s.collisionWarnings.join("; ") || "None",
      { confidence: summary.confidence.identity }
    ),
  ];
  return sectionFromFields("sku", "SKU", fields, s.collisionWarnings);
}

export function buildPricingSection(nd?: Record<string, unknown>): ProductSetupWizardSection {
  const cp = nd?.commerce_packaging as Record<string, unknown> | undefined;
  const caseCost = nd?.normalized_case_cost ?? nd?.supplier_cost ?? nd?.cost;
  const fields = [
    mkField("casePrice", "Case price", cp?.case_price ?? caseCost, { required: false }),
    mkField("palletPrice", "Pallet price", cp?.pallet_price, { required: false }),
    mkField("casesPerPallet", "Pallet quantity (cases)", cp?.cases_per_pallet, { required: false }),
    mkField(
      "pricingReadiness",
      "Pricing readiness",
      caseCost != null && Number(caseCost) > 0 ? "Case cost present" : "Missing case cost",
      { required: false, needsReview: caseCost == null || Number(caseCost) <= 0 }
    ),
  ];
  const warnings =
    caseCost == null || Number(caseCost) <= 0 ? ["Case/pallet pricing not set — URL extraction may not include cost"] : [];
  return sectionFromFields("pricing", "Pricing", fields, warnings);
}

export function buildPublishReadinessSection(pr?: PublishReadiness | null): ProductSetupWizardSection {
  const fields: ProductSetupWizardField[] = [];
  if (!pr) {
    fields.push(
      mkField("publishPreflight", "Publish preflight", "Not loaded", {
        canApplyLater: false,
      })
    );
    return sectionFromFields("publishReadiness", "Publish readiness", fields, ["Publish readiness not available"]);
  }

  const blockerSections = pr.blockerSections ?? {
    workflow: [],
    staging_validation: [],
    missing_required_attributes: [],
    case_pricing: [],
    sku: [],
  };

  const joinBlockers = (items?: string[]) => (items ?? []).join("; ") || "None";
  const hasBlockers = (items?: string[]) => (items ?? []).length > 0;

  fields.push(
    mkField("canPublish", "Tier 1 publish allowed", pr.canPublish ? "Yes" : "No", {
      blocked: !pr.canPublish,
      blockReason: pr.canPublish ? undefined : "Publish preflight blocked",
    }),
    mkField("categorySlug", "Category slug", pr.categorySlug),
    mkField(
      "missingAttributes",
      "Missing required attributes",
      joinBlockers(blockerSections.missing_required_attributes),
      { blocked: hasBlockers(blockerSections.missing_required_attributes) }
    ),
    mkField("casePricing", "Case pricing blockers", joinBlockers(blockerSections.case_pricing), {
      blocked: hasBlockers(blockerSections.case_pricing),
    }),
    mkField("skuBlockers", "SKU blockers", joinBlockers(blockerSections.sku), {
      blocked: hasBlockers(blockerSections.sku),
    })
  );

  const warnings = [...pr.warnings];
  return sectionFromFields("publishReadiness", "Publish readiness", fields, warnings);
}

function deriveOverallStatus(sections: ProductSetupWizardReadinessV1["sections"]): ProductSetupWizardOverallStatus {
  const pricingOnlyIssue =
    sections.pricing.status === "needs_review" &&
    sections.identity.status === "ready" &&
    sections.variants.status === "ready" &&
    sections.images.status === "ready" &&
    sections.commercePackaging.status === "ready" &&
    sections.attributes.status === "ready" &&
    sections.certifications.status === "ready" &&
    sections.publishReadiness.status !== "blocked";

  if (pricingOnlyIssue) return "needs_pricing";

  if (sections.publishReadiness.status === "blocked" || sections.identity.status === "missing") {
    return "missing_required_fields";
  }
  if (sections.identity.fields.some((f) => f.required && f.status === "missing")) {
    return "missing_required_fields";
  }
  if (sections.publishReadiness.fields.some((f) => f.key === "missingAttributes" && f.status === "blocked")) {
    return "missing_required_fields";
  }
  if (sections.variants.status === "needs_review" || sections.variants.status === "missing") {
    return "needs_variant_review";
  }
  if (sections.images.status === "needs_review" || sections.images.status === "missing") {
    return "needs_image_review";
  }
  if (sections.commercePackaging.status === "needs_review" || sections.commercePackaging.status === "missing") {
    return "needs_packaging_review";
  }
  if (sections.attributes.status === "needs_review") {
    return "needs_attribute_review";
  }
  if (sections.certifications.status === "needs_review") {
    return "needs_certification_review";
  }
  if (sections.pricing.status === "needs_review") return "needs_pricing";
  return "publish_ready";
}

/** Build derived wizard readiness from contract summary (not a new source of truth). */
export function buildProductSetupWizardReadiness(
  input: BuildProductSetupWizardReadinessInput
): ProductSetupWizardReadinessV1 {
  const { contractSummary: summary, normalizedData: nd, publishReadiness: pr } = input;

  const sections = {
    identity: buildIdentitySection(summary, nd),
    variants: buildVariantSection(summary),
    images: buildImageSection(summary),
    commercePackaging: buildCommercePackagingSection(summary, nd),
    attributes: buildAttributeSection(summary, nd),
    certifications: buildCertificationSection(summary),
    sku: buildSkuSection(summary),
    pricing: buildPricingSection(nd),
    publishReadiness: buildPublishReadinessSection(pr),
  };

  const allFields = Object.values(sections).flatMap((s) => s.fields);
  const requiredFields = allFields.filter((f) => f.status === "missing" && f.label).map((f) => f.key);
  const safeFields = allFields.filter((f) => f.status === "ready").map((f) => f.key);
  const reviewFields = allFields.filter((f) => f.status === "needs_review").map((f) => f.key);
  const missingFields = allFields.filter((f) => f.status === "missing").map((f) => f.key);
  const blockedReasons = [
    ...summary.review.publishBlockedReasons,
    ...(pr?.blockers ?? []),
    ...allFields.filter((f) => f.blockReason).map((f) => f.blockReason!),
  ].filter(Boolean);

  const warnings = [
    ...new Set([
      ...summary.review.warnings,
      ...Object.values(sections).flatMap((s) => s.warnings),
      ...(pr?.warnings ?? []),
    ]),
  ];

  return {
    schemaVersion: PRODUCT_SETUP_WIZARD_READINESS_SCHEMA_VERSION,
    overallStatus: deriveOverallStatus(sections),
    sections,
    requiredFields,
    safeFields,
    reviewFields,
    missingFields,
    blockedReasons: [...new Set(blockedReasons)],
    warnings,
  };
}

function isV2SummaryCompat(v: unknown): v is ProductUrlExtractionV2Summary {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.version === "product-url-extraction-v2" && typeof o.sourceUrl === "string";
}

/** Build degraded contract summary from legacy _extraction_v2 + normalized_data. */
export function buildContractSummaryFromLegacyStaging(
  normalizedData: Record<string, unknown>
): ProductSetupContractSummaryV1 | null {
  const v2 = normalizedData._extraction_v2;
  if (!isV2SummaryCompat(v2)) return null;

  const fa = (normalizedData.filter_attributes ?? normalizedData.attributes) as Record<string, unknown> | undefined;

  return {
    schemaVersion: PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION,
    source: {
      sourceUrl: v2.sourceUrl,
      extractionMode: "legacy_stub",
    },
    identity: {
      title: v2.normalizedTitle ?? str(normalizedData.canonical_title ?? normalizedData.name),
      brand: v2.brand,
      manufacturer: v2.manufacturer,
      manufacturerSku: str(normalizedData.manufacturer_sku) || undefined,
    },
    taxonomy: {
      categorySlug: str(normalizedData.category_slug) || undefined,
      productType: v2.material,
      confidence: v2.confidence.identity,
    },
    variants: {
      hasVariants: v2.proposedVariantCount > 0,
      variantAxis: v2.variantDimensions,
      proposedVariants: [],
      manufacturerVariantSkus: [],
      unresolvedNotes: v2.review.warnings,
      confidence: v2.confidence.variants,
    },
    commercePackaging: {
      sellUnit: "case",
      unitsPerCase: v2.unitsPerCase,
      caseLabel: v2.caseLabel,
      needsReview: !v2.review.publishReadinessHints.hasPackagingSignal,
      confidence: v2.confidence.packaging,
    },
    attributes: {
      material: v2.material ?? str(fa?.material),
      thicknessMil: fa?.thickness_mil != null ? Number(fa.thickness_mil) : undefined,
      confidenceByKey: {},
      needsReviewByKey: [],
    },
    certifications: { rawLabels: [], canonicalSlugs: [], confidence: 0, needsReview: false },
    images: {
      candidates: [],
      selectedPrimaryUrl: v2.primaryImageUrl,
      selectedGalleryUrls: v2.primaryImageUrl ? [v2.primaryImageUrl] : [],
    },
    sku: {
      manufacturerSku: str(normalizedData.manufacturer_sku) || undefined,
      proposedVariantGlvSkus: [],
      collisionWarnings: [],
    },
    confidence: v2.confidence,
    review: {
      safeToApplyFields: [],
      fieldsNeedingReview: [],
      missingRequiredFields: v2.review.blockers,
      warnings: v2.review.warnings,
      publishBlockedReasons: v2.review.blockers,
      safeToCreateMaster: v2.review.safeToCreateMaster,
      safeToStageVariants: v2.review.safeToStageVariants,
    },
    _extraction_v2_compat: v2,
  };
}

/** Resolve contract summary for wizard (priority: summary → full → legacy v2). */
export function resolveWizardContractSummary(
  normalizedData: Record<string, unknown>,
  rawPayload?: Record<string, unknown>
): ProductSetupContractSummaryV1 | null {
  if (isProductSetupContractSummaryV1(normalizedData.product_setup_contract_summary)) {
    return normalizedData.product_setup_contract_summary;
  }
  const full = resolveProductSetupContractFull(rawPayload ?? {});
  if (full) return buildProductSetupContractSummary(full);
  return buildContractSummaryFromLegacyStaging(normalizedData);
}

export { HIGH_RISK_ATTRIBUTE_KEYS };
