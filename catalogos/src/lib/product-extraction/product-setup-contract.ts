/**
 * ProductSetupContractV1 — formal versioned contract for URL import → staged review.
 * Evolved from ProductUrlExtractionV2; preserves evidence through bridge/staging.
 */

import type {
  FieldEvidence,
  FamilyEvidenceTier,
  ProductImageCandidate,
  ProductImageRole,
  ProductUrlExtractionV2,
  ProposedVariantFromUrl,
} from "./types";
import { summarizeProductUrlExtractionV2 } from "./extraction-v2-bridge";

export const PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION = "glovecubs.product_setup_contract.v1" as const;

export type ProductSetupExtractionMode = "v2" | "legacy_stub";

export type ProductSetupContractSource = {
  sourceUrl: string;
  crawlJobId?: string;
  importedAt?: string;
  extractionMode: ProductSetupExtractionMode;
};

export type ProductSetupImageCandidateSummary = {
  id: string;
  url: string;
  absoluteUrl: string;
  alt?: string;
  width?: number;
  height?: number;
  role: ProductImageRole;
  score: number;
  confidence: number;
  source: ProductImageCandidate["source"];
  rejectionReason?: string;
  recommendedPrimary: boolean;
  recommendedGallery: boolean;
  variantHints?: ProductImageCandidate["variantHints"];
};

export type ProductSetupContractIdentity = {
  title?: string;
  brand?: string;
  manufacturer?: string;
  manufacturerSku?: string;
  manufacturerPartNumber?: string;
  supplierSku?: string;
  description?: string;
  bullets?: string[];
};

export type ProductSetupContractVariants = {
  hasVariants: boolean;
  variantAxis: string[];
  proposedVariants: Array<{
    size?: string;
    color?: string;
    material?: string;
    pack?: string;
    manufacturerSku?: string;
    supplierSku?: string;
    imageUrl?: string;
    confidence: number;
  }>;
  manufacturerVariantSkus: string[];
  unresolvedNotes: string[];
  confidence: number;
  familyBaseSku?: string;
  selectedSize?: string;
  selectedVariantIndex?: number;
  familyEvidenceTier?: FamilyEvidenceTier;
  familyEvidence?: string[];
};

export type ProductSetupContractCommercePackaging = {
  sellUnit?: string;
  boxesPerCase?: number;
  unitsPerBox?: number;
  unitsPerCase?: number;
  casesPerPallet?: number;
  caseLabel?: string;
  needsReview: boolean;
  confidence: number;
};

export type ProductSetupContractAttributes = {
  material?: string;
  color?: string;
  thicknessMil?: number;
  powderFree?: boolean;
  latexFree?: boolean;
  foodSafe?: boolean;
  medicalGrade?: boolean;
  examGrade?: boolean;
  grade?: string;
  sterile?: boolean;
  texture?: string;
  cuffType?: string;
  lengthInches?: number;
  certificationsRaw?: string[];
  confidenceByKey: Record<string, number>;
  needsReviewByKey: string[];
};

export type ProductSetupContractCertifications = {
  rawLabels: string[];
  canonicalSlugs: string[];
  confidence: number;
  needsReview: boolean;
};

export type ProductSetupContractImages = {
  candidates: ProductSetupImageCandidateSummary[];
  selectedPrimaryUrl?: string;
  selectedGalleryUrls: string[];
};

export type ProductSetupContractSku = {
  manufacturerSku?: string;
  manufacturerPartNumber?: string;
  proposedParentGlvSku?: string;
  proposedVariantGlvSkus: string[];
  collisionWarnings: string[];
};

export type ProductSetupContractReview = {
  safeToApplyFields: string[];
  fieldsNeedingReview: string[];
  missingRequiredFields: string[];
  warnings: string[];
  publishBlockedReasons: string[];
  safeToCreateMaster: boolean;
  safeToStageVariants: boolean;
};

export type ProductSetupContractConfidence = ProductUrlExtractionV2["confidence"];

/** Full contract retained on supplier_products_raw.raw_payload.product_setup_contract_full */
export type ProductSetupContractV1 = {
  schemaVersion: typeof PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION;
  source: ProductSetupContractSource;
  identity: ProductSetupContractIdentity;
  taxonomy: {
    categorySlug?: string;
    productType?: string;
    detectedFamily?: string;
    confidence: number;
  };
  variants: ProductSetupContractVariants;
  commercePackaging: ProductSetupContractCommercePackaging;
  attributes: ProductSetupContractAttributes;
  certifications: ProductSetupContractCertifications;
  images: ProductSetupContractImages;
  documents: {
    specSheetUrls: string[];
    sdsUrls: string[];
    otherUrls: string[];
  };
  sku: ProductSetupContractSku;
  confidence: ProductSetupContractConfidence;
  review: ProductSetupContractReview;
  wizardState?: Record<string, unknown>;
  /** Original V2 extraction mirror for review UI (not canonical merchandising). */
  _sourceExtractionV2?: ProductUrlExtractionV2;
};

/** Staging-safe summary on supplier_products_normalized.normalized_data.product_setup_contract_summary */
export type ProductSetupContractSummaryV1 = {
  schemaVersion: typeof PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION;
  source: ProductSetupContractSource;
  identity: ProductSetupContractIdentity;
  taxonomy: ProductSetupContractV1["taxonomy"];
  variants: ProductSetupContractVariants;
  commercePackaging: ProductSetupContractCommercePackaging;
  attributes: ProductSetupContractAttributes;
  certifications: ProductSetupContractCertifications;
  images: ProductSetupContractImages;
  sku: ProductSetupContractSku;
  confidence: ProductSetupContractConfidence;
  review: ProductSetupContractReview;
  /** Compatibility alias for StagedUrlExtractionPanel / _extraction_v2 consumers */
  _extraction_v2_compat?: ReturnType<typeof summarizeProductUrlExtractionV2>;
};

const GLV_SKU_RE = /\bGLV[-_]/i;

export function isGlvLookingSku(sku: string): boolean {
  return GLV_SKU_RE.test(sku.trim());
}

export function isProductSetupContractV1(v: unknown): v is ProductSetupContractV1 {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return o.schemaVersion === PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION && typeof o.source === "object";
}

export function isProductSetupContractSummaryV1(v: unknown): v is ProductSetupContractSummaryV1 {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return o.schemaVersion === PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION && typeof o.source === "object";
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function ev<T>(field: FieldEvidence<T> | undefined): T | undefined {
  return field?.value;
}

function safeManufacturerSku(...candidates: (string | undefined)[]): string | undefined {
  for (const c of candidates) {
    const s = str(c);
    if (s && !isGlvLookingSku(s)) return s;
  }
  return undefined;
}

function imageCandidateSummary(
  c: ProductImageCandidate,
  primaryId?: string
): ProductSetupImageCandidateSummary {
  const usable =
    c.role === "primary_product" ||
    c.role === "alternate_product" ||
    (c.role === "unknown" && c.score >= 0.45);
  return {
    id: c.id,
    url: c.url,
    absoluteUrl: c.absoluteUrl,
    alt: c.alt,
    width: c.width,
    height: c.height,
    role: c.role,
    score: c.score,
    confidence: c.confidence,
    source: c.source,
    rejectionReason:
      c.role === "logo" || c.role === "badge" || c.role === "lifestyle"
        ? c.role
        : undefined,
    recommendedPrimary: c.id === primaryId,
    recommendedGallery: usable,
    variantHints: c.variantHints,
  };
}

function buildReviewSection(extraction: ProductUrlExtractionV2): ProductSetupContractReview {
  const r = extraction.review;
  const safeToApply: string[] = [];
  if (extraction.identity.brand?.trust === "trusted" || extraction.identity.brand?.confidence >= 0.75) {
    safeToApply.push("brand");
  }
  if (extraction.attributes.material?.confidence >= 0.75) safeToApply.push("material");
  if (extraction.commercePackaging.unitsPerCase?.confidence >= 0.75) safeToApply.push("commercePackaging");

  const needsReview: string[] = [];
  if (extraction.variants.proposedVariants.length === 0 && extraction.variants.unresolvedVariantNotes.length) {
    needsReview.push("variants");
  }
  if (extraction.images.candidates.filter((c) => c.role === "primary_product").length === 0) {
    needsReview.push("images");
  }

  return {
    safeToApplyFields: safeToApply,
    fieldsNeedingReview: needsReview,
    missingRequiredFields: r.blockers,
    warnings: r.warnings,
    publishBlockedReasons: r.blockers,
    safeToCreateMaster: r.safeToCreateMaster,
    safeToStageVariants: r.safeToStageVariants,
  };
}

export type BuildProductSetupContractContext = {
  crawlJobId?: string;
  importedAt?: string;
  extractionMode?: ProductSetupExtractionMode;
};

/** Build full ProductSetupContractV1 from scored ProductUrlExtractionV2. */
export function buildProductSetupContractFromExtractionV2(
  extraction: ProductUrlExtractionV2,
  context: BuildProductSetupContractContext = {}
): ProductSetupContractV1 {
  const mfrSku = safeManufacturerSku(
    ...extraction.variants.proposedVariants.map((v) => v.manufacturerSku),
    ...(extraction.identity.manufacturerSkuCandidates?.value ?? []),
    ev(extraction.identity.manufacturerProductId),
    ev(extraction.identity.modelNumber)
  );
  const mpn = safeManufacturerSku(ev(extraction.identity.modelNumber), ev(extraction.identity.manufacturerProductId));
  const supplierSku = safeManufacturerSku(...(extraction.identity.supplierSkuCandidates?.value ?? []));

  const attrs = extraction.attributes;
  const certRaw = attrs.certifications?.value ?? [];
  const primaryId = extraction.images.primaryCandidateId;
  const usableImages = extraction.images.candidates.filter(
    (c) =>
      c.role === "primary_product" ||
      c.role === "alternate_product" ||
      (c.role === "unknown" && c.score >= 0.45)
  );
  const galleryUrls = usableImages.map((c) => c.absoluteUrl);
  const primaryUrl =
    (primaryId ? extraction.images.candidates.find((c) => c.id === primaryId)?.absoluteUrl : undefined) ??
    galleryUrls[0];

  const proposedVariants = extraction.variants.proposedVariants.map((v: ProposedVariantFromUrl) => ({
    size: v.size,
    color: v.color,
    material: v.material,
    pack: v.pack,
    manufacturerSku: safeManufacturerSku(v.manufacturerSku),
    supplierSku: safeManufacturerSku(v.supplierSku),
    imageUrl: v.imageUrl,
    confidence: v.confidence,
  }));

  const mfrVariantSkus = proposedVariants
    .map((v) => v.manufacturerSku)
    .filter((s): s is string => Boolean(s));

  const confidenceByKey: Record<string, number> = {};
  for (const [key, field] of Object.entries(attrs)) {
    if (field && typeof field === "object" && "confidence" in field) {
      const conf = (field as FieldEvidence<unknown>).confidence;
      if (typeof conf === "number" && Number.isFinite(conf)) confidenceByKey[key] = conf;
    }
  }

  const cp = extraction.commercePackaging;
  const packagingNeedsReview =
    (cp.parseWarnings?.length ?? 0) > 0 ||
    extraction.review.publishReadinessHints.hasPackagingSignal === false;

  return {
    schemaVersion: PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION,
    source: {
      sourceUrl: extraction.sourceUrl,
      crawlJobId: context.crawlJobId,
      importedAt: context.importedAt ?? extraction.fetchedAt,
      extractionMode: context.extractionMode ?? "v2",
    },
    identity: {
      title:
        ev(extraction.identity.normalizedTitle) ?? ev(extraction.identity.sourceTitle),
      brand: ev(extraction.identity.brand),
      manufacturer: ev(extraction.identity.manufacturer),
      manufacturerSku: mfrSku,
      manufacturerPartNumber: mpn ?? mfrSku,
      supplierSku,
      description:
        extraction.source.parentDescription?.slice(0, 2000) ??
        extraction.source.rawTextSample?.slice(0, 2000),
      bullets: undefined,
    },
    taxonomy: {
      categorySlug: ev(extraction.taxonomy.categorySlug),
      productType: ev(extraction.taxonomy.productType),
      detectedFamily: ev(extraction.taxonomy.gloveType),
      confidence: extraction.confidence.identity,
    },
    variants: {
      hasVariants: proposedVariants.length > 0,
      variantAxis: extraction.variants.dimensions.map((d) => d.name),
      proposedVariants,
      manufacturerVariantSkus: mfrVariantSkus,
      unresolvedNotes: extraction.variants.unresolvedVariantNotes,
      confidence: extraction.confidence.variants,
      familyBaseSku: extraction.variants.familyBaseSku,
      selectedSize: extraction.variants.selectedSize,
      selectedVariantIndex: extraction.variants.selectedVariantIndex,
      familyEvidenceTier: extraction.variants.familyEvidenceTier,
      familyEvidence: extraction.variants.familyEvidence,
    },
    commercePackaging: {
      sellUnit: ev(cp.unitNoun) ?? "case",
      boxesPerCase: ev(cp.innersPerCase),
      unitsPerBox: ev(cp.unitsPerInner),
      unitsPerCase: ev(cp.unitsPerCase),
      casesPerPallet: undefined,
      caseLabel: ev(cp.caseLabel),
      needsReview: packagingNeedsReview,
      confidence: extraction.confidence.packaging,
    },
    attributes: {
      material: ev(attrs.material) ?? ev(extraction.taxonomy.material),
      color: ev(attrs.color),
      thicknessMil: ev(attrs.thicknessMil),
      powderFree: ev(attrs.powderFree),
      latexFree: ev(attrs.latexFree),
      foodSafe: ev(attrs.foodSafe),
      medicalGrade: ev(attrs.examGrade),
      examGrade: ev(attrs.examGrade),
      grade: attrs.examGrade?.value ? "medical_exam_grade" : undefined,
      sterile: ev(attrs.sterile),
      texture: ev(attrs.textured) ? "textured" : ev(attrs.grip),
      cuffType: ev(attrs.cuffType),
      lengthInches: ev(attrs.lengthInches),
      certificationsRaw: certRaw,
      confidenceByKey,
      needsReviewByKey: Object.entries(confidenceByKey)
        .filter(([, c]) => c < 0.65)
        .map(([k]) => k),
    },
    certifications: {
      rawLabels: certRaw,
      canonicalSlugs: [],
      confidence: attrs.certifications?.confidence ?? 0,
      needsReview: certRaw.length > 0 && (attrs.certifications?.confidence ?? 0) < 0.75,
    },
    images: {
      candidates: extraction.images.candidates.map((c) => imageCandidateSummary(c, primaryId)),
      selectedPrimaryUrl: primaryUrl,
      selectedGalleryUrls: galleryUrls,
    },
    documents: {
      specSheetUrls: extraction.documents.specSheetUrls,
      sdsUrls: extraction.documents.sdsUrls,
      otherUrls: extraction.documents.otherUrls,
    },
    sku: {
      manufacturerSku: mfrSku,
      manufacturerPartNumber: mpn ?? mfrSku,
      proposedParentGlvSku: undefined,
      proposedVariantGlvSkus: [],
      collisionWarnings: [],
    },
    confidence: extraction.confidence,
    review: buildReviewSection(extraction),
    _sourceExtractionV2: extraction,
  };
}

/** Strip heavy fields; retain review-critical metadata including image candidates. */
export function buildProductSetupContractSummary(
  contract: ProductSetupContractV1
): ProductSetupContractSummaryV1 {
  const v2Compat = contract._sourceExtractionV2
    ? summarizeProductUrlExtractionV2(contract._sourceExtractionV2)
    : undefined;

  const { _sourceExtractionV2: _drop, wizardState: _ws, ...rest } = contract;

  return {
    ...rest,
    _extraction_v2_compat: v2Compat,
  };
}

/** Extract passthrough fields from a ParsedRow for staging normalized_data. */
export function extractProductSetupPassthroughFromParsedRow(row: Record<string, unknown>): {
  product_setup_contract_summary?: ProductSetupContractSummaryV1;
  _extraction_v2?: ReturnType<typeof summarizeProductUrlExtractionV2>;
  manufacturer_sku?: string;
} {
  const out: {
    product_setup_contract_summary?: ProductSetupContractSummaryV1;
    _extraction_v2?: ReturnType<typeof summarizeProductUrlExtractionV2>;
    manufacturer_sku?: string;
  } = {};

  const summaryRaw = row.product_setup_contract_summary;
  if (isProductSetupContractSummaryV1(summaryRaw)) {
    out.product_setup_contract_summary = summaryRaw;
    if (summaryRaw._extraction_v2_compat) {
      out._extraction_v2 = summaryRaw._extraction_v2_compat;
    }
  } else if (row._extraction_v2 && typeof row._extraction_v2 === "object") {
    out._extraction_v2 = row._extraction_v2 as ReturnType<typeof summarizeProductUrlExtractionV2>;
  }

  const mfr = safeManufacturerSku(str(row.manufacturer_sku), str(row.manufacturer_part_number));
  if (mfr) out.manufacturer_sku = mfr;

  return out;
}

/** Resolve full contract from url_import or raw payloads (multiple key aliases). */
export function resolveProductSetupContractFull(
  rawPayload: Record<string, unknown> | null | undefined
): ProductSetupContractV1 | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  if (isProductSetupContractV1(rawPayload.product_setup_contract)) {
    return rawPayload.product_setup_contract;
  }
  if (isProductSetupContractV1(rawPayload.product_setup_contract_full)) {
    return rawPayload.product_setup_contract_full;
  }
  return null;
}
