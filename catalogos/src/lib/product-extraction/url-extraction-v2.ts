import type { ParsedProductPage } from "@/lib/openclaw/types";
import { extractCommercePackagingFields } from "./extract-commerce-packaging";
import { extractDomProductFromHtml } from "./extract-dom-product";
import { extractGloveAttributes } from "./extract-glove-attributes";
import { extractImagesFromHtml, ogImageUrlFromEvidence } from "./extract-images";
import { extractJsonLdFromHtml } from "./extract-json-ld";
import { extractMetaFromHtml } from "./extract-meta";
import { extractVariantsFromHtml } from "./extract-variants";
import { makeFieldEvidence } from "./evidence-helpers";
import { normalizeUrlProduct } from "./normalize-url-product";
import { sanitizeParentCopy } from "./sanitize-parent-copy";
import { applyProductUrlExtractionV2Scoring } from "./score-extraction";
import type { ProductUrlExtractionV2 } from "./types";

export type RunUrlExtractionV2Input = {
  url: string;
  html: string;
  parsed?: unknown;
  fetchedAt?: string;
};

function asParsedProductPage(parsed: unknown): ParsedProductPage | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  return parsed as ParsedProductPage;
}

function inferCategorySlug(
  disposableReusable?: string,
  material?: string
): ProductUrlExtractionV2["taxonomy"]["categorySlug"] {
  if (disposableReusable === "reusable") {
    return makeFieldEvidence("reusable_gloves", 0.65, "heuristic", {
      reasons: ["reusable_classification"],
    });
  }
  if (material || disposableReusable === "disposable") {
    return makeFieldEvidence("disposable_gloves", 0.7, "heuristic", {
      reasons: ["disposable_glove_signals"],
    });
  }
  return undefined;
}

/** Run layered URL product extraction and return a complete V2 payload (no DB writes). */
export async function runUrlExtractionV2(input: RunUrlExtractionV2Input): Promise<ProductUrlExtractionV2> {
  const { url, html } = input;
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const parsedPage = asParsedProductPage(input.parsed);

  const jsonLd = extractJsonLdFromHtml(html);
  const meta = extractMetaFromHtml(html, url);
  const dom = extractDomProductFromHtml(html, url);

  const h1 = meta.h1Candidates[0]?.value ?? parsedPage?.product_title;
  const specTable = { ...dom.specTable, ...(parsedPage?.spec_table ?? {}) };
  const brandHint =
    jsonLd.brand?.value ??
    specTable.brand ??
    parsedPage?.brand ??
    meta.openGraph["product:brand"] ??
    undefined;

  const normalized = normalizeUrlProduct({
    sourceTitle:
      jsonLd.title?.value ??
      h1 ??
      parsedPage?.product_title ??
      dom.titleCandidates[0]?.value,
    brand: brandHint,
    pageTitle: meta.pageTitle,
    ogTitle: meta.ogTitle?.value,
    h1,
  });

  const images = extractImagesFromHtml({
    html,
    pageUrl: url,
    jsonLdImageUrls: jsonLd.imageUrls,
    ogImageUrl: ogImageUrlFromEvidence(meta.ogImage),
    parsedImageUrls: parsedPage?.images,
  });

  const variants = extractVariantsFromHtml({
    html,
    pageUrl: url,
    rawTextSample: dom.rawTextSample,
    jsonLdVariantRecords: jsonLd.variantRecords,
    specTable,
  });

  const availableSizes = variants.dimensions.find((d) => d.name === "size")?.options;

  const descriptionText =
    jsonLd.description?.value ??
    dom.description?.value ??
    parsedPage?.description ??
    meta.metaDescription?.value;

  const sanitizedParent = sanitizeParentCopy({
    title: normalized.normalizedTitle?.value ?? normalized.sourceTitle?.value,
    description: descriptionText,
    selectedSize: variants.selectedSize,
    availableSizes,
  });

  const parentTitle =
    sanitizedParent.title ??
    normalized.normalizedTitle?.value ??
    normalized.sourceTitle?.value;

  const parentDescription = sanitizedParent.description ?? descriptionText;

  const normalizedTitle = parentTitle
    ? makeFieldEvidence(parentTitle, sanitizedParent.removedTokens.length ? 0.84 : 0.82, "heuristic", {
        quote: parentTitle.slice(0, 200),
        reasons: sanitizedParent.removedTokens.length
          ? ["sanitize_parent_copy", ...sanitizedParent.removedTokens.map((token) => `removed:${token}`)]
          : ["strip_store_suffix", "dedupe_brand_prefix"],
      })
    : normalized.normalizedTitle;

  const glove = extractGloveAttributes({
    title: parentTitle,
    description: parentDescription,
    bullets: dom.bullets?.value,
    specTable,
    jsonLdDescription: jsonLd.description?.value,
    rawTextSample: dom.rawTextSample,
  });

  const packaging = extractCommercePackagingFields({
    html,
    pageUrl: url,
    pageText: dom.rawTextSample,
    specTable,
    jsonLd: jsonLd.rawItems,
    metaTags: meta.openGraph,
    categorySlug:
      glove.disposableReusable?.value === "reusable" ? "reusable_gloves" : "disposable_gloves",
    packTextRaw: dom.rawTextSample,
  });

  const manufacturerSkus = [
    ...(jsonLd.sku ? [jsonLd.sku.value] : []),
    ...(jsonLd.mpn ? [jsonLd.mpn.value] : []),
    ...variants.manufacturerSkuCandidates,
  ].filter(Boolean);

  const identity: ProductUrlExtractionV2["identity"] = {
    sourceTitle: normalized.sourceTitle,
    normalizedTitle,
    brand: normalized.brand ?? jsonLd.brand,
    manufacturer: jsonLd.manufacturer,
    manufacturerProductId: jsonLd.sku,
    modelNumber: jsonLd.model,
    manufacturerSkuCandidates: manufacturerSkus.length
      ? makeFieldEvidence([...new Set(manufacturerSkus)], 0.85, "json_ld")
      : undefined,
    supplierSkuCandidates: variants.supplierSkuCandidates.length
      ? makeFieldEvidence(variants.supplierSkuCandidates, 0.7, "dom")
      : undefined,
  };

  const taxonomy: ProductUrlExtractionV2["taxonomy"] = {
    categorySlug: inferCategorySlug(
      glove.disposableReusable?.value,
      glove.taxonomyMaterial?.value
    ),
    productType: glove.disposableReusable
      ? makeFieldEvidence("glove", 0.75, "heuristic")
      : undefined,
    gloveType: glove.attributes.examGrade
      ? makeFieldEvidence("exam", 0.78, "text")
      : undefined,
    material: glove.taxonomyMaterial,
    disposableReusable: glove.disposableReusable,
  };

  const specDocs = parsedPage?.spec_sheet_urls ?? [];
  const documents = {
    specSheetUrls: [...new Set([...dom.documents.specSheetUrls, ...specDocs])],
    sdsUrls: dom.documents.sdsUrls,
    otherUrls: dom.documents.otherUrls,
  };

  const draft: ProductUrlExtractionV2 = {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: url,
    canonicalUrl: meta.canonicalUrl ?? parsedPage?.url,
    fetchedAt,
    source: {
      pageTitle: meta.pageTitle,
      metaTitle: meta.metaTitle?.value,
      h1,
      jsonLdProduct: jsonLd.productItems,
      openGraph: meta.openGraph,
      rawTextSample: dom.rawTextSample.slice(0, 2000),
      parentDescription: parentDescription?.slice(0, 2000),
    },
    identity,
    taxonomy,
    commercePackaging: {
      unitsPerCase: packaging.unitsPerCase,
      innersPerCase: packaging.innersPerCase,
      unitsPerInner: packaging.unitsPerInner,
      unitNoun: packaging.unitNoun,
      innerNoun: packaging.innerNoun,
      caseLabel: packaging.caseLabel,
      packTextRaw: packaging.packTextRaw,
      parseWarnings: packaging.parseWarnings,
    },
    attributes: glove.attributes,
    variants: {
      dimensions: variants.dimensions,
      options: variants.options,
      proposedVariants: variants.proposedVariants,
      unresolvedVariantNotes: variants.unresolvedVariantNotes,
      familyBaseSku: variants.familyBaseSku,
      selectedSize: variants.selectedSize,
      selectedVariantIndex: variants.selectedVariantIndex,
      familyEvidenceTier: variants.familyEvidenceTier,
      familyEvidence: variants.familyEvidence,
    },
    images,
    documents,
    confidence: {
      overall: 0,
      identity: 0,
      variants: 0,
      images: 0,
      packaging: 0,
      attributes: 0,
    },
    review: {
      safeToCreateMaster: false,
      safeToStageVariants: false,
      publishReadinessHints: {
        hasVariantCandidates: false,
        hasImageCandidate: false,
        hasPackagingSignal: false,
        hasSkuSourceSeparation: false,
        warnings: [],
      },
      blockers: [],
      warnings: [],
    },
  };

  return applyProductUrlExtractionV2Scoring(draft);
}
