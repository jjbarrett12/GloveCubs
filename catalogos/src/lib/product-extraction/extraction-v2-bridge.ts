import { attachCommercePackagingToParsedRow } from "@commerce-packaging/staging-bridge";
import type { ParsedRow } from "@/lib/ingestion/types";
import {
  buildProductSetupContractFromExtractionV2,
  buildProductSetupContractSummary,
  type BuildProductSetupContractContext,
  type ProductSetupContractV1,
} from "./product-setup-contract";
import type {
  ProductImageCandidate,
  ProductUrlExtractionV2,
  ProductUrlExtractionV2Summary,
  ProposedVariantFromUrl,
} from "./types";

const GLV_SKU_RE = /\bGLV[-_]/i;
const INTERNAL_SKU_KEYS = [
  "sku",
  "internal_sku",
  "variant_sku",
  "catalog_sku",
  "glovecubs_sku",
  "proposed_glovecubs_sku",
] as const;

export type BridgeExtractionV2ToParsedRowsInput = {
  extraction: ProductUrlExtractionV2;
  contractContext?: BuildProductSetupContractContext;
};

export type BridgeExtractionV2ToParsedRowsResult = {
  rows: ParsedRow[];
  summary: ProductUrlExtractionV2Summary;
  contract: ProductSetupContractV1;
  contractSummary: ReturnType<typeof buildProductSetupContractSummary>;
  warnings: string[];
};

export type BuildUrlImportProductPayloadsInput = {
  extraction: ProductUrlExtractionV2;
  rows: ParsedRow[];
  legacyRawPayload?: Record<string, unknown>;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function isUsableProductImage(c: ProductImageCandidate): boolean {
  return (
    c.role === "primary_product" ||
    c.role === "alternate_product" ||
    (c.role === "unknown" && c.score >= 0.45)
  );
}

function isPackagingFallbackImage(c: ProductImageCandidate): boolean {
  return c.role === "packaging";
}

function selectRowImages(
  extraction: ProductUrlExtractionV2,
  variant?: ProposedVariantFromUrl
): { urls: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const urls: string[] = [];

  if (variant?.imageUrl?.trim()) {
    urls.push(variant.imageUrl.trim());
  }

  const usable = extraction.images.candidates.filter(isUsableProductImage);
  for (const c of usable) {
    if (!urls.includes(c.absoluteUrl)) urls.push(c.absoluteUrl);
  }

  if (urls.length === 0) {
    const packaging = extraction.images.candidates.filter(isPackagingFallbackImage);
    if (packaging.length > 0) {
      warnings.push("Only packaging images available; no product gallery image for staging row.");
      urls.push(packaging[0]!.absoluteUrl);
    }
  }

  const hasProduct = usable.length > 0 || Boolean(variant?.imageUrl);
  const badPrimary = extraction.images.primaryCandidateId
    ? extraction.images.candidates.find((c) => c.id === extraction.images.primaryCandidateId)
    : undefined;
  if (
    badPrimary &&
    (badPrimary.role === "logo" || badPrimary.role === "lifestyle" || badPrimary.role === "badge") &&
    hasProduct
  ) {
    warnings.push("Logo/lifestyle image ignored because usable product images exist.");
  }

  return { urls, warnings };
}

function primaryImageUrl(extraction: ProductUrlExtractionV2): string | undefined {
  const primaryId = extraction.images.primaryCandidateId;
  if (primaryId) {
    const primary = extraction.images.candidates.find((c) => c.id === primaryId);
    if (primary && isUsableProductImage(primary)) return primary.absoluteUrl;
  }
  const usable = extraction.images.candidates.filter(isUsableProductImage);
  return usable[0]?.absoluteUrl;
}

/** Compact summary for `_extraction_v2` and admin preview (no full extraction blob). */
export function summarizeProductUrlExtractionV2(
  extraction: ProductUrlExtractionV2
): ProductUrlExtractionV2Summary {
  return {
    version: extraction.version,
    schemaVersion: extraction.schemaVersion,
    sourceUrl: extraction.sourceUrl,
    canonicalUrl: extraction.canonicalUrl,
    normalizedTitle:
      extraction.identity.normalizedTitle?.value ?? extraction.identity.sourceTitle?.value,
    brand: extraction.identity.brand?.value,
    manufacturer: extraction.identity.manufacturer?.value,
    material:
      extraction.taxonomy.material?.value ?? extraction.attributes.material?.value,
    disposableReusable: extraction.taxonomy.disposableReusable?.value,
    primaryImageUrl: primaryImageUrl(extraction),
    imageCandidateCount: extraction.images.candidates.length,
    proposedVariantCount: extraction.variants.proposedVariants.length,
    variantDimensions: extraction.variants.dimensions.map((d) => d.name),
    unitsPerCase: extraction.commercePackaging.unitsPerCase?.value,
    caseLabel: extraction.commercePackaging.caseLabel?.value,
    confidence: extraction.confidence,
    review: extraction.review,
  };
}

function familyTitle(extraction: ProductUrlExtractionV2): string {
  return (
    extraction.identity.normalizedTitle?.value ??
    extraction.identity.sourceTitle?.value ??
    "Untitled"
  );
}

function variantDisplayTitle(
  base: string,
  variant: ProposedVariantFromUrl,
  familyMaterial?: string
): string {
  const parts = [base];
  if (variant.size) parts.push(variant.size);
  if (variant.color) parts.push(variant.color);
  if (variant.material && variant.material !== familyMaterial) parts.push(variant.material);
  if (parts.length <= 1 && variant.title?.trim()) return variant.title.trim();
  return parts.join(" — ");
}

function extractionMaterial(extraction: ProductUrlExtractionV2): string | undefined {
  return extraction.attributes.material?.value ?? extraction.taxonomy.material?.value;
}

function applyPackagingLegacyFields(
  row: Record<string, unknown>,
  extraction: ProductUrlExtractionV2
): void {
  const cp = extraction.commercePackaging;
  if (cp.innersPerCase?.value != null) row.boxes_per_case = cp.innersPerCase.value;
  if (cp.unitsPerInner?.value != null) {
    row.gloves_per_box = cp.unitsPerInner.value;
    row.box_qty = cp.unitsPerInner.value;
  }
  if (cp.unitsPerCase?.value != null) {
    row.total_gloves_per_case = cp.unitsPerCase.value;
    row.case_qty = cp.unitsPerCase.value;
  }
  if (cp.packTextRaw?.value) row.pack_size = cp.packTextRaw.value;
}

function buildSharedRowBase(
  extraction: ProductUrlExtractionV2,
  summary: ProductUrlExtractionV2Summary,
  contractSummary: ReturnType<typeof buildProductSetupContractSummary>
): Record<string, unknown> {
  const title = familyTitle(extraction);
  const attrs = extraction.attributes;
  const categorySlug =
    extraction.taxonomy.categorySlug?.value ?? extraction.taxonomy.productType?.value;

  const row: Record<string, unknown> = {
    name: title,
    title,
    product_name: title,
    brand: extraction.identity.brand?.value,
    manufacturer: extraction.identity.manufacturer?.value,
    manufacturer_part_number:
      extraction.identity.modelNumber?.value ??
      extraction.identity.manufacturerProductId?.value,
    category_slug: categorySlug,
    category: categorySlug,
    material: extractionMaterial(extraction),
    color: attrs.color?.value,
    thickness_mil: attrs.thicknessMil?.value,
    thickness: attrs.thicknessMil?.value,
    length_inches: attrs.lengthInches?.value,
    powder_free: attrs.powderFree?.value,
    latex_free: attrs.latexFree?.value,
    food_safe: attrs.foodSafe?.value,
    exam_grade: attrs.examGrade?.value,
    chemo_rated: attrs.chemoRated?.value,
    textured: attrs.textured?.value,
    grip: attrs.grip?.value,
    grade:
      attrs.examGrade?.value === true || extraction.taxonomy.gloveType?.value === "exam"
        ? "exam"
        : extraction.taxonomy.gloveType?.value,
    glove_type: extraction.taxonomy.gloveType?.value,
    certifications: attrs.certifications?.value,
    standards: attrs.standards?.value,
    source_url: extraction.sourceUrl,
    canonical_url: extraction.canonicalUrl,
    cost: 0,
    supplier_cost: 0,
    description:
      extraction.source.parentDescription?.slice(0, 2000) ??
      extraction.source.rawTextSample?.slice(0, 2000),
    long_description:
      extraction.source.parentDescription?.slice(0, 4000) ??
      extraction.source.rawTextSample?.slice(0, 4000),
    spec_sheet_urls: extraction.documents.specSheetUrls,
    sds_urls: extraction.documents.sdsUrls,
    _extraction_v2: contractSummary._extraction_v2_compat ?? summary,
    product_setup_contract_summary: contractSummary,
  };

  applyPackagingLegacyFields(row, extraction);
  return row;
}

function applyVariantFields(
  row: Record<string, unknown>,
  extraction: ProductUrlExtractionV2,
  variant: ProposedVariantFromUrl
): void {
  const baseTitle = familyTitle(extraction);
  row.name = variantDisplayTitle(baseTitle, variant, extractionMaterial(extraction));
  row.title = row.name;
  row.product_name = row.name;

  if (variant.size) row.size = variant.size;
  if (variant.color) row.color = variant.color;
  if (variant.material) row.material = variant.material;
  if (variant.pack) row.pack_size = variant.pack;

  const mfrSku = str(variant.manufacturerSku);
  if (mfrSku && !GLV_SKU_RE.test(mfrSku)) {
    row.manufacturer_sku = mfrSku;
    if (!row.manufacturer_part_number) row.manufacturer_part_number = mfrSku;
  } else if (mfrSku && GLV_SKU_RE.test(mfrSku)) {
    row._extraction_v2_source_warnings = [
      ...(Array.isArray(row._extraction_v2_source_warnings)
        ? (row._extraction_v2_source_warnings as string[])
        : []),
      `GLV-looking manufacturer source SKU preserved as evidence only: ${mfrSku}`,
    ];
  }

  const supplierSku = str(variant.supplierSku);
  if (supplierSku && !GLV_SKU_RE.test(supplierSku)) {
    row.supplier_sku = supplierSku;
  }
}

function stripInternalSkuFields(row: Record<string, unknown>): void {
  for (const key of INTERNAL_SKU_KEYS) {
    delete row[key];
  }
  delete row.id;
}

function finalizeRow(
  row: Record<string, unknown>,
  extraction: ProductUrlExtractionV2,
  variant?: ProposedVariantFromUrl
): ParsedRow {
  const { urls, warnings: imageWarnings } = selectRowImages(extraction, variant);
  if (urls.length) {
    row.images = urls;
    row.image_url = urls[0];
  }

  stripInternalSkuFields(row);

  const categorySlug =
    typeof row.category_slug === "string" ? row.category_slug : undefined;

  const finalized = attachCommercePackagingToParsedRow(row, { categorySlug });

  if (imageWarnings.length) {
    finalized._bridge_warnings = [
      ...(Array.isArray(finalized._bridge_warnings) ? (finalized._bridge_warnings as string[]) : []),
      ...imageWarnings,
    ];
  }

  return finalized as ParsedRow;
}

/** Bridge scored ProductUrlExtractionV2 into ingestion-compatible ParsedRow rows. */
export function bridgeExtractionV2ToParsedRows(
  input: BridgeExtractionV2ToParsedRowsInput
): BridgeExtractionV2ToParsedRowsResult {
  const { extraction, contractContext } = input;
  const summary = summarizeProductUrlExtractionV2(extraction);
  let contract = buildProductSetupContractFromExtractionV2(extraction, contractContext);
  let contractSummary = buildProductSetupContractSummary(contract);
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];

  const proposed = extraction.variants.proposedVariants;

  if (proposed.length > 0) {
    for (const variant of proposed) {
      const row = buildSharedRowBase(extraction, summary, contractSummary);
      applyVariantFields(row, extraction, variant);
      rows.push(finalizeRow(row, extraction, variant));
    }
  } else {
    warnings.push("No source-confirmed proposed variants; emitting single family-level staging row.");
    if (extraction.variants.unresolvedVariantNotes.length > 0) {
      warnings.push(...extraction.variants.unresolvedVariantNotes);
      summary.review = {
        ...summary.review,
        warnings: [...new Set([...summary.review.warnings, ...extraction.variants.unresolvedVariantNotes])],
      };
      contract = buildProductSetupContractFromExtractionV2(
        {
          ...extraction,
          review: { ...extraction.review, warnings: summary.review.warnings },
        },
        contractContext
      );
      contractSummary = buildProductSetupContractSummary(contract);
    }
    const row = buildSharedRowBase(extraction, summary, contractSummary);
    row._extraction_v2 = contractSummary._extraction_v2_compat ?? summary;
    row.product_setup_contract_summary = contractSummary;

    const mfrCandidates = extraction.identity.manufacturerSkuCandidates?.value ?? [];
    const cleanMfr = mfrCandidates.find((s) => s && !GLV_SKU_RE.test(s));
    if (cleanMfr) {
      row.manufacturer_sku = cleanMfr;
      if (!row.manufacturer_part_number) row.manufacturer_part_number = cleanMfr;
    }

    const supplierCandidates = extraction.identity.supplierSkuCandidates?.value ?? [];
    const cleanSupplier = supplierCandidates.find((s) => s && !GLV_SKU_RE.test(s));
    if (cleanSupplier) row.supplier_sku = cleanSupplier;

    rows.push(finalizeRow(row, extraction));
  }

  for (const w of extraction.review.warnings) {
    if (!warnings.includes(w)) warnings.push(w);
  }

  return { rows, summary, contract, contractSummary, warnings };
}

/** Build url_import_products insert payloads (full V2 on first rawPayload only). */
export function buildUrlImportProductPayloadsForExtractionV2(
  input: BuildUrlImportProductPayloadsInput
): Array<{ normalizedPayload: ParsedRow; rawPayload: Record<string, unknown> }> {
  const legacy = input.legacyRawPayload ?? { source_url: input.extraction.sourceUrl };

  const contract = buildProductSetupContractFromExtractionV2(input.extraction);

  return input.rows.map((normalizedPayload, index) => ({
    normalizedPayload,
    rawPayload:
      index === 0
        ? {
            ...legacy,
            extraction_v2: input.extraction,
            product_setup_contract: contract,
            product_setup_contract_full: contract,
          }
        : { ...legacy },
  }));
}

export { INTERNAL_SKU_KEYS, isUsableProductImage };
