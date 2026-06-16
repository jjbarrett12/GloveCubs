import { hasPackagingMathConflict } from "@commerce-packaging/labels";
import type { CommercePackagingV1 } from "@commerce-packaging/types";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "@commerce-packaging/types";
import type {
  ProductImageCandidate,
  ProductUrlExtractionV2,
  ProposedVariantFromUrl,
} from "./types";

const TITLE_CONF_THRESHOLD = 0.65;
const GLV_SKU_RE = /\bGLV[-_]/i;
const PACK_TOTAL_RE = /(\d[\d,]*)\s*(?:gloves|pairs|units)?\s*(?:per\s*)?(?:case|cs)\b/gi;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function isMalformedExtraction(extraction: ProductUrlExtractionV2): boolean {
  return (
    extraction.version !== "product-url-extraction-v2" ||
    extraction.schemaVersion !== 1 ||
    !extraction.sourceUrl?.trim() ||
    !extraction.fetchedAt?.trim()
  );
}

function usableProductImages(extraction: ProductUrlExtractionV2): ProductImageCandidate[] {
  return extraction.images.candidates.filter(
    (c) =>
      c.role === "primary_product" ||
      c.role === "alternate_product" ||
      (c.role === "unknown" && c.score >= 0.45)
  );
}

function isSourceConfirmedVariant(variant: ProposedVariantFromUrl): boolean {
  if (variant.manufacturerSku?.trim() || variant.sourceVariantId?.trim()) return true;
  if (variant.supplierSku?.trim() && variant.confidence >= 0.75) return true;
  const fromEmbedded = variant.evidence.some(
    (e) => e.source === "embedded_json" || e.source === "json_ld"
  );
  if (fromEmbedded) return true;
  if (variant.size && variant.confidence >= 0.65 && variant.trust !== "weak") return true;
  return false;
}

function collectSkuStrings(extraction: ProductUrlExtractionV2): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    if (Array.isArray(v)) v.forEach(push);
  };
  push(extraction.identity.manufacturerSkuCandidates?.value);
  push(extraction.identity.supplierSkuCandidates?.value);
  push(extraction.identity.manufacturerProductId?.value);
  for (const pv of extraction.variants.proposedVariants) {
    push(pv.manufacturerSku);
    push(pv.supplierSku);
  }
  return out;
}

function packagingV1FromExtraction(extraction: ProductUrlExtractionV2): CommercePackagingV1 | null {
  const cp = extraction.commercePackaging;
  if (
    cp.unitsPerCase?.value == null &&
    cp.innersPerCase?.value == null &&
    cp.unitsPerInner?.value == null
  ) {
    return null;
  }
  return {
    schema_version: COMMERCE_PACKAGING_SCHEMA_VERSION,
    inner_unit_type: cp.innerNoun?.value === "box" ? "box" : null,
    units_per_inner: cp.unitsPerInner?.value ?? null,
    inners_per_case: cp.innersPerCase?.value ?? null,
    units_per_case: cp.unitsPerCase?.value ?? null,
    unit_noun: cp.unitNoun?.value ?? null,
    case_label: cp.caseLabel?.value ?? null,
    field_provenance: {},
    parse_warnings: cp.parseWarnings ?? [],
  };
}

function parsePackTextTotals(text: string): number[] {
  const totals: number[] = [];
  let m: RegExpExecArray | null;
  PACK_TOTAL_RE.lastIndex = 0;
  while ((m = PACK_TOTAL_RE.exec(text)) !== null) {
    const n = parseInt(m[1]!.replace(/,/g, ""), 10);
    if (Number.isFinite(n) && n > 0) totals.push(n);
  }
  return [...new Set(totals)];
}

export type PackagingConflictAssessment = {
  hasInnerProductConflict: boolean;
  hasPackTextConflict: boolean;
  highConfidence: boolean;
  details: string[];
};

/** Inspect commercePackaging evidence for math contradictions (does not re-parse packaging). */
export function assessPackagingConflicts(extraction: ProductUrlExtractionV2): PackagingConflictAssessment {
  const details: string[] = [];
  const cp = extraction.commercePackaging;
  const unitsPerCase = cp.unitsPerCase?.value;
  const inners = cp.innersPerCase?.value;
  const unitsPerInner = cp.unitsPerInner?.value;

  let hasInnerProductConflict = false;
  const v1 = packagingV1FromExtraction(extraction);
  if (v1 && hasPackagingMathConflict(v1)) {
    hasInnerProductConflict = true;
    details.push(
      `inners_per_case (${inners}) × units_per_inner (${unitsPerInner}) ≠ units_per_case (${unitsPerCase})`
    );
  }

  let hasPackTextConflict = false;
  const packText = cp.packTextRaw?.value ?? "";
  if (packText && unitsPerCase != null) {
    const textTotals = parsePackTextTotals(packText);
    const conflicting = textTotals.filter((t) => t !== unitsPerCase);
    if (conflicting.length > 0) {
      hasPackTextConflict = true;
      details.push(
        `pack text mentions case total(s) ${conflicting.join(", ")} but parsed units_per_case is ${unitsPerCase}`
      );
    }
  }

  const confidences = [
    cp.unitsPerCase?.confidence,
    cp.innersPerCase?.confidence,
    cp.unitsPerInner?.confidence,
    cp.packTextRaw?.confidence,
  ].filter((c): c is number => typeof c === "number" && Number.isFinite(c));

  const highConfidence =
    confidences.length > 0 && confidences.every((c) => c >= 0.75) && (confidences.reduce((a, b) => a + b, 0) / confidences.length) >= 0.8;

  return {
    hasInnerProductConflict,
    hasPackTextConflict,
    highConfidence,
    details,
  };
}

function scoreIdentity(extraction: ProductUrlExtractionV2): number {
  const parts: number[] = [];
  const titleConf = extraction.identity.normalizedTitle?.confidence ?? 0;
  const sourceTitleConf = extraction.identity.sourceTitle?.confidence ?? 0;
  parts.push(Math.max(titleConf, sourceTitleConf * 0.9));

  if (extraction.identity.brand?.value || extraction.identity.manufacturer?.value) {
    parts.push(
      clamp01(
        avg([
          extraction.identity.brand?.confidence ?? 0,
          extraction.identity.manufacturer?.confidence ?? 0.5,
        ])
      )
    );
  }

  if (extraction.taxonomy.categorySlug?.value || extraction.taxonomy.productType?.value) {
    parts.push(
      clamp01(
        avg([
          extraction.taxonomy.categorySlug?.confidence ?? 0,
          extraction.taxonomy.productType?.confidence ?? 0,
        ])
      )
    );
  }

  return clamp01(avg(parts));
}

function scoreVariants(extraction: ProductUrlExtractionV2): number {
  const proposed = extraction.variants.proposedVariants;
  if (proposed.length === 0) {
    if (extraction.variants.unresolvedVariantNotes.length > 0) return 0.25;
    if (extraction.variants.dimensions.length > 0) return 0.35;
    return 0;
  }

  const confirmed = proposed.filter(isSourceConfirmedVariant);
  let score = clamp01(avg(confirmed.map((v) => v.confidence)));
  if (confirmed.length === 0) score *= 0.5;
  if (extraction.variants.unresolvedVariantNotes.length > 0) score *= 0.7;
  return clamp01(score);
}

function scoreImages(extraction: ProductUrlExtractionV2): number {
  const usable = usableProductImages(extraction);
  if (usable.length === 0) {
    const onlyBad =
      extraction.images.candidates.length > 0 &&
      extraction.images.candidates.every((c) =>
        ["logo", "lifestyle", "badge"].includes(c.role)
      );
    return onlyBad ? 0.1 : 0;
  }
  return clamp01(avg(usable.map((c) => c.confidence ?? c.score)));
}

function scorePackaging(extraction: ProductUrlExtractionV2): number {
  const cp = extraction.commercePackaging;
  const parts: number[] = [];

  if (cp.unitsPerCase?.value != null) parts.push(cp.unitsPerCase.confidence);
  if (cp.innersPerCase?.value != null) parts.push(cp.innersPerCase.confidence);
  if (cp.unitsPerInner?.value != null) parts.push(cp.unitsPerInner.confidence);
  if (cp.packTextRaw?.value) parts.push(cp.packTextRaw.confidence * 0.85);

  if (parts.length === 0) return cp.packTextRaw?.value ? 0.35 : 0;

  let score = clamp01(avg(parts));
  const conflict = assessPackagingConflicts(extraction);
  if (conflict.hasInnerProductConflict || conflict.hasPackTextConflict) {
    score *= conflict.highConfidence ? 0.35 : 0.65;
  }
  if ((cp.parseWarnings ?? []).length > 0) score *= 0.85;
  return clamp01(score);
}

function scoreAttributes(extraction: ProductUrlExtractionV2): number {
  const parts: number[] = [];
  const attrs = extraction.attributes;

  if (extraction.taxonomy.material?.value) parts.push(extraction.taxonomy.material.confidence);
  if (extraction.taxonomy.disposableReusable?.value && extraction.taxonomy.disposableReusable.value !== "unknown") {
    parts.push(extraction.taxonomy.disposableReusable.confidence);
  }
  if (attrs.material?.value) parts.push(attrs.material.confidence);
  if (attrs.thicknessMil?.value != null) parts.push(attrs.thicknessMil.confidence);
  if (attrs.examGrade?.value) parts.push(attrs.examGrade.confidence);
  if (attrs.certifications?.value?.length) parts.push(attrs.certifications.confidence * 0.9);

  return clamp01(avg(parts));
}

function scoreOverall(confidence: ProductUrlExtractionV2["confidence"]): number {
  return clamp01(
    confidence.identity * 0.28 +
      confidence.variants * 0.22 +
      confidence.images * 0.22 +
      confidence.packaging * 0.14 +
      confidence.attributes * 0.14
  );
}

/** Apply confidence buckets and review readiness to a completed extraction payload. */
export function applyProductUrlExtractionV2Scoring(
  extraction: ProductUrlExtractionV2,
  options: { adminImageAcknowledged?: boolean } = {}
): ProductUrlExtractionV2 {
  const adminImageAck = options.adminImageAcknowledged === true;

  const confidence = {
    identity: scoreIdentity(extraction),
    variants: scoreVariants(extraction),
    images: scoreImages(extraction),
    packaging: scorePackaging(extraction),
    attributes: scoreAttributes(extraction),
    overall: 0,
  };
  confidence.overall = scoreOverall(confidence);

  const blockers: string[] = [];
  const warnings: string[] = [];
  const hintWarnings: string[] = [];

  if (isMalformedExtraction(extraction)) {
    blockers.push("Extraction payload is malformed or missing required source metadata.");
  }

  const normalizedTitle = extraction.identity.normalizedTitle?.value?.trim();
  const sourceTitle = extraction.identity.sourceTitle?.value?.trim();
  const titleConf = extraction.identity.normalizedTitle?.confidence ?? 0;

  if (!normalizedTitle && !sourceTitle) {
    blockers.push("No usable product title extracted.");
  } else if (titleConf < TITLE_CONF_THRESHOLD) {
    blockers.push(`Normalized title confidence (${titleConf.toFixed(2)}) is below ${TITLE_CONF_THRESHOLD}.`);
  }

  const categoryInferable = Boolean(
    extraction.taxonomy.categorySlug?.value || extraction.taxonomy.productType?.value
  );
  if (!categoryInferable) {
    blockers.push("No inferable category or product type.");
  }

  const packagingConflict = assessPackagingConflicts(extraction);
  if (packagingConflict.hasInnerProductConflict || packagingConflict.hasPackTextConflict) {
    const msg = `Packaging math conflict: ${packagingConflict.details.join("; ")}`;
    if (packagingConflict.highConfidence) blockers.push(msg);
    else warnings.push(msg);
  }

  const usableImages = usableProductImages(extraction);
  const hasUsableImage = usableImages.length > 0;

  if (!hasUsableImage && !adminImageAck) {
    warnings.push("No usable product image candidate; primary image review required.");
    if (extraction.images.candidates.length > 0) {
      const roles = [...new Set(extraction.images.candidates.map((c) => c.role))];
      if (roles.every((r) => r === "logo" || r === "lifestyle" || r === "unknown")) {
        warnings.push("Only logo, lifestyle, or unknown images detected.");
      }
    }
  }

  const materialConf = extraction.attributes.material?.confidence ?? extraction.taxonomy.material?.confidence;
  if (extraction.attributes.material?.value && materialConf != null && materialConf < 0.55) {
    warnings.push("Material extracted with low confidence.");
  }

  const colorRelevant =
    extraction.variants.dimensions.some((d) => d.name === "color") ||
    /color|violet|blue|black|white|clear|orange|green/i.test(
      extraction.identity.normalizedTitle?.value ?? extraction.identity.sourceTitle?.value ?? ""
    );
  if (
    colorRelevant &&
    extraction.attributes.color?.value &&
    (extraction.attributes.color.confidence ?? 0) < 0.55
  ) {
    warnings.push("Color appears relevant but was extracted with low confidence.");
  }

  if (
    extraction.attributes.certifications?.value?.length &&
    (extraction.attributes.certifications.confidence ?? 0) < 0.6
  ) {
    warnings.push("Certification claims detected but not strongly confirmed from source evidence.");
  }

  if (extraction.variants.unresolvedVariantNotes.length > 0) {
    for (const note of extraction.variants.unresolvedVariantNotes) {
      warnings.push(note);
    }
  }

  const cp = extraction.commercePackaging;
  if (cp.packTextRaw?.value && cp.unitsPerCase?.value == null && (cp.innersPerCase?.value == null || cp.unitsPerInner?.value == null)) {
    warnings.push("Packaging text found but case math could not be parsed reliably.");
  }
  if ((cp.parseWarnings ?? []).length > 0) {
    for (const w of cp.parseWarnings) warnings.push(w);
  }

  const skuStrings = collectSkuStrings(extraction);
  const glvSkus = skuStrings.filter((s) => GLV_SKU_RE.test(s));
  if (glvSkus.length > 0) {
    warnings.push(
      `Internal/GLV-looking SKU(s) appeared in source extraction fields (${glvSkus.join(", ")}); must not become internal SKU without review.`
    );
  }

  const mfrSkus = new Set<string>();
  const supplierSkus = new Set<string>();
  for (const s of extraction.identity.manufacturerSkuCandidates?.value ?? []) mfrSkus.add(s);
  for (const s of extraction.identity.supplierSkuCandidates?.value ?? []) supplierSkus.add(s);
  for (const pv of extraction.variants.proposedVariants) {
    if (pv.manufacturerSku) mfrSkus.add(pv.manufacturerSku);
    if (pv.supplierSku) supplierSkus.add(pv.supplierSku);
  }
  for (const s of mfrSkus) {
    if (supplierSkus.has(s)) {
      warnings.push(`Manufacturer and supplier SKU ambiguity for "${s}".`);
    }
  }

  const confirmedVariants = extraction.variants.proposedVariants.filter(isSourceConfirmedVariant);
  const safeToStageVariants = confirmedVariants.length > 0;

  if (!safeToStageVariants && extraction.variants.proposedVariants.length === 0) {
    if (extraction.variants.unresolvedVariantNotes.length > 0) {
      warnings.push("Variant dimensions unresolved; admin must confirm variants before staging.");
    } else if (categoryInferable) {
      warnings.push("No source-confirmed variants; product may stage as single-family row pending admin review.");
    }
  }

  for (const pv of extraction.variants.proposedVariants) {
    const needsSize = extraction.taxonomy.categorySlug?.value?.includes("glove");
    if (needsSize && !pv.size && !pv.manufacturerSku) {
      warnings.push("Proposed variant lacks size/material/color evidence expected for gloves.");
      break;
    }
  }

  const hasPackagingSignal = Boolean(
    cp.unitsPerCase?.value != null ||
      cp.innersPerCase?.value != null ||
      cp.unitsPerInner?.value != null ||
      cp.packTextRaw?.value
  );

  const hasSkuSourceSeparation =
    glvSkus.length === 0 && ![...mfrSkus].some((s) => supplierSkus.has(s));

  if (!hasSkuSourceSeparation && mfrSkus.size > 0 && supplierSkus.size > 0) {
    hintWarnings.push("Manufacturer and supplier SKU sources overlap or are ambiguous.");
  }

  const safeToCreateMaster =
    blockers.length === 0 &&
    Boolean(normalizedTitle || sourceTitle) &&
    titleConf >= TITLE_CONF_THRESHOLD &&
    categoryInferable &&
    (hasUsableImage || adminImageAck);

  const publishReadinessHints = {
    hasVariantCandidates: confirmedVariants.length > 0,
    hasImageCandidate: hasUsableImage,
    hasPackagingSignal,
    hasSkuSourceSeparation: hasSkuSourceSeparation && glvSkus.length === 0,
    warnings: [...hintWarnings],
  };

  return {
    ...extraction,
    confidence,
    review: {
      safeToCreateMaster,
      safeToStageVariants,
      publishReadinessHints,
      blockers: [...new Set(blockers)],
      warnings: [...new Set(warnings)],
    },
  };
}

/** @deprecated Alias for applyProductUrlExtractionV2Scoring */
export function scoreProductUrlExtractionV2(extraction: ProductUrlExtractionV2): ProductUrlExtractionV2 {
  return applyProductUrlExtractionV2Scoring(extraction);
}
