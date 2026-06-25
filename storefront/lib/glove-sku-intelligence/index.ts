import {
  clusterSkuFamily,
  parseManufacturerSkuFamily,
  sizeCodeFromManufacturerSku,
  stripKnownSizeSuffixWithParser,
} from "./family-sku-parser";
import {
  decodeHospecoCompactManufacturerSku,
  normalizeGloveSizeCode,
  sortGloveSizeCodes,
} from "./glove-size-normalization";

export * from "./glove-size-normalization";
export * from "./family-sku-parser";

export type SkuProposal = {
  value: string | null;
  confidence: number;
  source: string;
  evidence: string[];
  warnings: string[];
};

export type SkuVariantProposal = {
  size_code: string;
  proposed_glovecubs_sku: string | null;
  manufacturer_sku: string | null;
  confidence: number;
  source: string;
  warnings: string[];
};

export type SkuProposalResult = {
  parent_sku: SkuProposal;
  variants: SkuVariantProposal[];
  warnings: string[];
};

export type SkuCollisionIssue = {
  code: string;
  label: string;
  severity: "blocker" | "warning";
};

export type GloveSkuProposalVariantInput = {
  size_code?: string | null;
  size_label?: string | null;
  manufacturer_sku?: string | null;
  source_sku?: string | null;
};

export type GloveSkuProposalInput = {
  productName?: string | null;
  brand?: string | null;
  sourceSku?: string | null;
  url?: string | null;
  variants: GloveSkuProposalVariantInput[];
};

export const SKU_PROPOSAL_SAFE_CONFIDENCE = 0.7;

/** Strip trailing size suffix from manufacturer SKU (family-aware; backward-compatible). */
export function stripKnownSizeSuffix(input: string): string {
  return stripKnownSizeSuffixWithParser(input, { clusterMembers: [input.trim().toUpperCase()] });
}

/** Strip trailing size suffix with optional sibling cluster for collision-safe parsing. */
export function stripKnownSizeSuffixInCluster(input: string, clusterMembers: string[]): string {
  return stripKnownSizeSuffixWithParser(input, { clusterMembers });
}

/** Strip Hospeco-style trailing F from GL-N125F when multi-size evidence agrees. */
export function stripKnownManufacturerGradeSuffix(
  input: string,
  options?: { allowGradeStrip?: boolean }
): string {
  const s = input.trim().toUpperCase();
  if (!s || !options?.allowGradeStrip) return s;
  const m = s.match(/^([A-Z]{2,}-N\d+)F$/);
  if (m?.[1]) return m[1];
  return s;
}

/** Normalize stripped manufacturer base for GLV prefixing. */
export function normalizeManufacturerSkuBase(input: string): string | null {
  const s = input.trim().toUpperCase();
  if (!s || s.length < 3) return null;
  if (!/^[A-Z0-9-]+$/.test(s)) return null;
  return s;
}

export function deriveGloveCubsVariantSku(parentSku: string, sizeCode: string): string | null {
  const parent = parentSku.trim().toUpperCase();
  const size = normalizeGloveSizeCode(sizeCode);
  if (!parent || !size) return null;
  if (!parent.startsWith("GLV-")) return null;
  return `${parent}${size}`;
}

function collectManufacturerSkus(input: GloveSkuProposalInput): string[] {
  const skus = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const t = raw?.trim();
    if (t) skus.add(t.toUpperCase());
  };
  add(input.sourceSku);
  for (const v of input.variants) {
    add(v.manufacturer_sku);
    add(v.source_sku);
  }
  const url = input.url ?? "";
  const urlMatch = url.match(/\b([A-Z]{2,}-[A-Z0-9-]+-[A-Z]{1,3})\b/i);
  if (urlMatch?.[1]) add(urlMatch[1]);
  return [...skus];
}

function pickDominantBaseFromCluster(skus: string[]): { base: string; evidence: string[] } | null {
  const cluster = clusterSkuFamily(skus);
  if (!cluster) return null;

  if (cluster.members.length >= 2) {
    return {
      base: cluster.parentBase,
      evidence: cluster.members.map((m) => m.rawSku),
    };
  }

  if (skus.length === 1) {
    const parse = parseManufacturerSkuFamily(skus[0]!, { clusterMembers: skus });
    if (parse) {
      return { base: parse.parentBase, evidence: [parse.rawSku] };
    }
    return { base: skus[0]!, evidence: [skus[0]!] };
  }

  return null;
}

export function deriveGloveCubsParentSku(input: {
  manufacturerSkus: string[];
  productSku?: string | null;
  sourceUrl?: string | null;
  variantCount?: number;
}): SkuProposal {
  const warnings: string[] = [];
  const evidence: string[] = [];
  const skus = [...new Set(input.manufacturerSkus.map((s) => s.trim().toUpperCase()).filter(Boolean))];

  if (skus.length === 0) {
    return {
      value: null,
      confidence: 0,
      source: "none",
      evidence: [],
      warnings: ["No manufacturer SKU evidence"],
    };
  }

  const dominant = pickDominantBaseFromCluster(skus);

  if (!dominant) {
    return {
      value: null,
      confidence: 0.55,
      source: "insufficient_agreement",
      evidence: skus,
      warnings: ["Manufacturer SKUs do not agree on a common base"],
    };
  }

  evidence.push(...dominant.evidence);
  const multiSizeAgreement = dominant.evidence.length >= 2;
  let merchandiseBase = stripKnownManufacturerGradeSuffix(dominant.base, {
    allowGradeStrip: multiSizeAgreement && /^[A-Z]{2,}-N\d+F$/.test(dominant.base),
  });
  if (merchandiseBase !== dominant.base) {
    evidence.push(`Grade suffix stripped: ${dominant.base} → ${merchandiseBase}`);
  }

  const normalized = normalizeManufacturerSkuBase(merchandiseBase);
  if (!normalized) {
    return {
      value: null,
      confidence: 0.5,
      source: "invalid_base",
      evidence,
      warnings: ["Could not normalize manufacturer base"],
    };
  }

  const parentValue = `GLV-${normalized}`;
  let confidence = 0.7;
  let source = "single_product_sku";

  if (multiSizeAgreement && dominant.evidence.length >= 3) {
    confidence = 0.95;
    source = "multi_variant_manufacturer_sku";
  } else if (multiSizeAgreement) {
    confidence = 0.95;
    source = "multi_variant_manufacturer_sku";
  } else if (input.productSku && skus.includes(input.productSku.trim().toUpperCase())) {
    confidence = 0.85;
    source = "product_sku";
  } else {
    confidence = 0.7;
    warnings.push("Only one manufacturer SKU — review parent proposal before apply");
  }

  const url = input.sourceUrl ?? "";
  if (/gl-n125/i.test(url) && /gl-n125/i.test(normalized)) {
    confidence = Math.max(confidence, 0.85);
    evidence.push("URL slug agrees with GL-N125 family");
  }

  return {
    value: parentValue,
    confidence,
    source,
    evidence,
    warnings,
  };
}

function resolveVariantSizeCode(v: GloveSkuProposalVariantInput, clusterMembers?: string[]): string | null {
  const fromCode = v.size_code ? normalizeGloveSizeCode(v.size_code) : null;
  if (fromCode) return fromCode;
  const fromLabel = v.size_label ? normalizeGloveSizeCode(v.size_label) : null;
  if (fromLabel) return fromLabel;
  const mfr = v.manufacturer_sku ?? v.source_sku;
  if (mfr) {
    const fromParser = sizeCodeFromManufacturerSku(mfr, clusterMembers ? { clusterMembers } : undefined);
    if (fromParser) return normalizeGloveSizeCode(fromParser) ?? fromParser;
    const decoded = decodeHospecoCompactManufacturerSku(mfr);
    if (decoded) return decoded.normalizedCode;
  }
  return null;
}

/** Source-neutral GLV SKU proposal derivation (clipboard ImportDraft and CatalogOS staging). */
export function deriveSkuProposalsFromInput(input: GloveSkuProposalInput): SkuProposalResult {
  const warnings: string[] = [];
  const manufacturerSkus = collectManufacturerSkus(input);
  const clusterMembers = manufacturerSkus;

  const parent = deriveGloveCubsParentSku({
    manufacturerSkus,
    productSku: input.sourceSku,
    sourceUrl: input.url,
    variantCount: input.variants.length,
  });
  warnings.push(...parent.warnings);

  const variantRows: SkuVariantProposal[] = [];
  const seenSizes = new Set<string>();

  const sizeCodes = sortGloveSizeCodes(
    input.variants
      .map((v) => resolveVariantSizeCode(v, clusterMembers))
      .filter((c): c is string => Boolean(c))
  );

  for (const code of sizeCodes) {
    if (seenSizes.has(code)) continue;
    seenSizes.add(code);

    const v =
      input.variants.find((row) => resolveVariantSizeCode(row, clusterMembers) === code) ??
      input.variants.find((row) => normalizeGloveSizeCode(row.size_code ?? "") === code);

    const sizeCode = normalizeGloveSizeCode(code) ?? code.toUpperCase();
    if (!normalizeGloveSizeCode(sizeCode) && sizeCode !== "X") {
      variantRows.push({
        size_code: code,
        proposed_glovecubs_sku: null,
        manufacturer_sku: v?.manufacturer_sku ?? v?.source_sku ?? null,
        confidence: 0,
        source: "invalid_size",
        warnings: ["Invalid or missing size code"],
      });
      continue;
    }

    const proposed =
      parent.value != null ? deriveGloveCubsVariantSku(parent.value, sizeCode) : null;
    const rowWarnings: string[] = [];
    if (!parent.value) rowWarnings.push("No parent SKU proposal");
    if (!proposed) rowWarnings.push("Could not derive variant SKU");

    variantRows.push({
      size_code: sizeCode,
      proposed_glovecubs_sku: proposed,
      manufacturer_sku: v?.manufacturer_sku ?? v?.source_sku ?? null,
      confidence: parent.confidence,
      source: parent.source,
      warnings: rowWarnings,
    });
  }

  const proposedVariantSkus = variantRows
    .map((r) => r.proposed_glovecubs_sku)
    .filter(Boolean) as string[];
  if (new Set(proposedVariantSkus).size !== proposedVariantSkus.length) {
    warnings.push("Duplicate proposed variant SKUs detected");
  }

  return { parent_sku: parent, variants: variantRows, warnings };
}

export function isSafeGloveCubsSkuProposal(result: SkuProposalResult): boolean {
  if (!result.parent_sku.value) return false;
  if (result.parent_sku.confidence < SKU_PROPOSAL_SAFE_CONFIDENCE) return false;
  if (result.variants.length === 0) return false;
  return result.variants.every(
    (v) =>
      v.proposed_glovecubs_sku != null &&
      v.confidence >= SKU_PROPOSAL_SAFE_CONFIDENCE &&
      (normalizeGloveSizeCode(v.size_code) != null || v.size_code === "X")
  );
}

export function isGlvParentSkuFormat(sku: string | null | undefined): boolean {
  if (!sku?.trim()) return false;
  return /^GLV-[A-Z0-9-]+$/.test(sku.trim().toUpperCase());
}

export function isGlvVariantSkuFormat(
  variantSku: string | null | undefined,
  parentSku: string | null | undefined
): boolean {
  if (!variantSku?.trim() || !parentSku?.trim()) return false;
  const v = variantSku.trim().toUpperCase();
  const p = parentSku.trim().toUpperCase();
  return v.startsWith(p) && v.length > p.length;
}

export function detectSkuCollisionIssues(input: {
  parentSku: string | null;
  variantSkus: string[];
  existingParentSkus?: Set<string>;
  existingVariantSkus?: Set<string>;
  manufacturerSkusByVariant?: string[];
}): SkuCollisionIssue[] {
  const issues: SkuCollisionIssue[] = [];
  const parent = input.parentSku?.trim().toUpperCase();
  if (parent && input.existingParentSkus?.has(parent)) {
    issues.push({
      code: "duplicate_parent_sku",
      label: `SKU already exists: parent ${parent}`,
      severity: "blocker",
    });
  }
  const seenInProduct = new Set<string>();
  for (const raw of input.variantSkus) {
    const sku = raw.trim().toUpperCase();
    if (!sku) continue;
    if (seenInProduct.has(sku)) {
      issues.push({
        code: "duplicate_variant_sku_same_product",
        label: `Duplicate variant SKU within product: ${sku}`,
        severity: "blocker",
      });
    }
    seenInProduct.add(sku);
    if (input.existingVariantSkus?.has(sku)) {
      issues.push({
        code: "duplicate_variant_sku",
        label: `SKU already exists: variant ${sku}`,
        severity: "blocker",
      });
    }
  }
  for (let i = 0; i < input.variantSkus.length; i++) {
    const variantSku = input.variantSkus[i]?.trim().toUpperCase();
    const mfr = input.manufacturerSkusByVariant?.[i]?.trim().toUpperCase();
    if (variantSku && mfr && variantSku === mfr) {
      issues.push({
        code: "manufacturer_sku_used_as_variant_sku",
        label: "Manufacturer SKU must not be used as GloveCubs variant SKU",
        severity: "blocker",
      });
    }
  }
  return issues;
}
