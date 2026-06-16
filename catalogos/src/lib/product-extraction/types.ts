/**
 * Product URL Extraction V2 — evidence-backed extraction contract.
 * Collect broadly; bridge and publish paths apply data narrowly.
 */

export type ProductUrlExtractionVersion = "product-url-extraction-v2";

export type ExtractionSource =
  | "json_ld"
  | "meta"
  | "open_graph"
  | "title"
  | "h1"
  | "dom"
  | "table"
  | "bullet"
  | "text"
  | "image_alt"
  | "embedded_json"
  | "pdf"
  | "heuristic"
  | "unknown";

export type FieldTrust =
  | "trusted"
  | "probable"
  | "weak"
  | "conflicting"
  | "missing";

export type FieldEvidence<T> = {
  value: T;
  confidence: number;
  trust: FieldTrust;
  source: ExtractionSource;
  selector?: string;
  quote?: string;
  url?: string;
  reasons?: string[];
};

export type ProductImageRole =
  | "primary_product"
  | "alternate_product"
  | "variant_swatch"
  | "packaging"
  | "lifestyle"
  | "logo"
  | "badge"
  | "spec_diagram"
  | "unknown";

export type ProductImageSource =
  | "json_ld"
  | "og_image"
  | "img"
  | "srcset"
  | "picture"
  | "gallery"
  | "thumbnail"
  | "embedded_json";

export type ProductImageCandidate = {
  id: string;
  url: string;
  absoluteUrl: string;
  alt?: string;
  width?: number;
  height?: number;
  source: ProductImageSource;
  role: ProductImageRole;
  score: number;
  confidence: number;
  trust: FieldTrust;
  reasons: string[];
  variantHints?: {
    color?: string;
    size?: string;
    material?: string;
  };
};

export type VariantDimensionName =
  | "size"
  | "color"
  | "material"
  | "pack"
  | "length"
  | "thickness"
  | "style"
  | "unknown";

export type VariantDimension = {
  name: VariantDimensionName;
  confidence: number;
  trust: FieldTrust;
  source: ExtractionSource;
  selector?: string;
  options: string[];
};

export type VariantOption = {
  dimension: VariantDimensionName;
  value: string;
  normalizedValue?: string;
  confidence: number;
  trust: FieldTrust;
  source: ExtractionSource;
  selector?: string;
  evidence?: FieldEvidence<string>[];
};

export type FamilyEvidenceTier = "strong" | "medium" | "weak";

export type ProposedVariantFromUrl = {
  sourceVariantId?: string;
  title?: string;
  size?: string;
  color?: string;
  material?: string;
  pack?: string;
  manufacturerSku?: string;
  supplierSku?: string;
  imageUrl?: string;
  availability?: string;
  evidence: FieldEvidence<string>[];
  confidence: number;
  trust: FieldTrust;
};

export type DisposableReusable = "disposable" | "reusable" | "unknown";

export type ProductUrlExtractionV2 = {
  version: ProductUrlExtractionVersion;
  schemaVersion: 1;

  sourceUrl: string;
  canonicalUrl?: string;
  fetchedAt: string;

  source: {
    pageTitle?: string;
    metaTitle?: string;
    h1?: string;
    jsonLdProduct?: unknown[];
    openGraph?: Record<string, string>;
    rawTextSample?: string;
    /** Size-neutral parent description after selected-size sanitization. */
    parentDescription?: string;
  };

  identity: {
    sourceTitle?: FieldEvidence<string>;
    normalizedTitle?: FieldEvidence<string>;
    brand?: FieldEvidence<string>;
    manufacturer?: FieldEvidence<string>;
    manufacturerProductId?: FieldEvidence<string>;
    modelNumber?: FieldEvidence<string>;
    manufacturerSkuCandidates?: FieldEvidence<string[]>;
    supplierSkuCandidates?: FieldEvidence<string[]>;
  };

  taxonomy: {
    categorySlug?: FieldEvidence<string>;
    productType?: FieldEvidence<string>;
    gloveType?: FieldEvidence<string>;
    material?: FieldEvidence<string>;
    disposableReusable?: FieldEvidence<DisposableReusable>;
  };

  commercePackaging: {
    unitsPerCase?: FieldEvidence<number>;
    innersPerCase?: FieldEvidence<number>;
    unitsPerInner?: FieldEvidence<number>;
    unitNoun?: FieldEvidence<string>;
    innerNoun?: FieldEvidence<string>;
    caseLabel?: FieldEvidence<string>;
    packTextRaw?: FieldEvidence<string>;
    parseWarnings?: string[];
  };

  attributes: {
    material?: FieldEvidence<string>;
    color?: FieldEvidence<string>;
    thicknessMil?: FieldEvidence<number>;
    lengthInches?: FieldEvidence<number>;
    cuffLength?: FieldEvidence<string>;
    powderFree?: FieldEvidence<boolean>;
    latexFree?: FieldEvidence<boolean>;
    foodSafe?: FieldEvidence<boolean>;
    examGrade?: FieldEvidence<boolean>;
    chemoRated?: FieldEvidence<boolean>;
    fentanylRated?: FieldEvidence<boolean>;
    textured?: FieldEvidence<boolean>;
    grip?: FieldEvidence<string>;
    ambidextrous?: FieldEvidence<boolean>;
    beadedCuff?: FieldEvidence<boolean>;
    sterile?: FieldEvidence<boolean>;
    certifications?: FieldEvidence<string[]>;
    standards?: FieldEvidence<string[]>;
    ansiCutLevel?: FieldEvidence<string>;
    en388Rating?: FieldEvidence<string>;
    coating?: FieldEvidence<string>;
    liner?: FieldEvidence<string>;
    cuffType?: FieldEvidence<string>;
  };

  variants: {
    dimensions: VariantDimension[];
    options: VariantOption[];
    proposedVariants: ProposedVariantFromUrl[];
    unresolvedVariantNotes: string[];
    familyBaseSku?: string;
    selectedSize?: string;
    selectedVariantIndex?: number;
    familyEvidenceTier?: FamilyEvidenceTier;
    familyEvidence?: string[];
  };

  images: {
    candidates: ProductImageCandidate[];
    primaryCandidateId?: string;
    rejected: ProductImageCandidate[];
  };

  documents: {
    specSheetUrls: string[];
    sdsUrls: string[];
    otherUrls: string[];
  };

  confidence: {
    overall: number;
    identity: number;
    variants: number;
    images: number;
    packaging: number;
    attributes: number;
  };

  review: {
    safeToCreateMaster: boolean;
    safeToStageVariants: boolean;
    publishReadinessHints: {
      hasVariantCandidates: boolean;
      hasImageCandidate: boolean;
      hasPackagingSignal: boolean;
      hasSkuSourceSeparation: boolean;
      warnings: string[];
    };
    blockers: string[];
    warnings: string[];
  };
};

export type ProductUrlExtractionV2Summary = {
  version: ProductUrlExtractionVersion;
  schemaVersion: 1;
  sourceUrl: string;
  canonicalUrl?: string;
  normalizedTitle?: string;
  brand?: string;
  manufacturer?: string;
  material?: string;
  disposableReusable?: DisposableReusable;
  primaryImageUrl?: string;
  imageCandidateCount: number;
  proposedVariantCount: number;
  variantDimensions: VariantDimensionName[];
  unitsPerCase?: number;
  caseLabel?: string;
  confidence: ProductUrlExtractionV2["confidence"];
  review: ProductUrlExtractionV2["review"];
};
