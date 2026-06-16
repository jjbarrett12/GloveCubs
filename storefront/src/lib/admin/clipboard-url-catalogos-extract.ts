/**
 * Clipboard URL staging: delegate extraction to CatalogOS single-product URL import (V2).
 * Falls back to local productExtraction.ts when CatalogOS is unavailable.
 * Does not publish or write catalog_v2 products — staging payload only.
 */

import type { CommercePackagingV1 } from "@commerce-packaging/types";
import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import {
  buildStagingExtractedPayload,
  draftNeedsHumanReview,
} from "@/lib/admin/import-draft-mapper";
import {
  IMPORT_DRAFT_PARSER_VERSION,
  IMPORT_DRAFT_SCHEMA_VERSION,
  type ImportDraftProductV1,
  type ImportDraftVariantV1,
  type StagingExtractedPayloadV1,
} from "@/lib/admin/import-draft-types";
import { normalizeGloveSizeCode } from "@/lib/admin/glove-size-normalization";
import {
  adaptUrlImportJobDetail,
  type UrlImportExtractedProduct,
} from "@/lib/admin/url-import-adapter";

export const CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS = "catalogos_url_import_v2" as const;
export const CLIPBOARD_EXTRACTION_AUTHORITY_LOCAL = "storefront_product_extraction_v2" as const;

export function isClipboardCatalogosExtractConfigured(): boolean {
  return computeProductsImportConnectionStatus().configured;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Map CatalogOS url_import_products row → ImportDraftProductV1 for clipboard promote UI. */
export function importDraftFromCatalogosUrlProduct(
  product: UrlImportExtractedProduct,
  rawProduct: Record<string, unknown>,
  pageUrl: string,
  overrideImageUrl: string | null
): ImportDraftProductV1 {
  const payload = asObject(rawProduct.normalized_payload) ?? {};
  const manufacturerSku =
    pickString(payload, ["manufacturer_sku", "supplier_sku"]) ?? product.mpn ?? product.sku ?? null;
  const sizeRaw = product.size ?? pickString(payload, ["size"]);
  const sizeCode = sizeRaw ? (normalizeGloveSizeCode(sizeRaw) ?? "UNKNOWN") : "UNKNOWN";
  const images = product.images;
  const primaryImage = overrideImageUrl ?? images[0] ?? null;

  const variants: ImportDraftVariantV1[] = [
    {
      size_label: sizeRaw,
      normalized_size_code: sizeCode,
      sku: manufacturerSku,
      manufacturer_sku: manufacturerSku,
      source_sku: manufacturerSku,
      mpn: product.mpn,
      gtin: product.gtin,
      list_price: null,
    },
  ];

  const materialAttr = product.attributes.find((a) => /material/i.test(a.key));
  const thicknessAttr = product.attributes.find((a) => /thickness/i.test(a.key));
  let thicknessMil: number | null = null;
  if (thicknessAttr?.value) {
    const n = Number(thicknessAttr.value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n)) thicknessMil = n;
  }

  const cpRaw = payload.commerce_packaging;
  const commercePackaging =
    cpRaw && typeof cpRaw === "object" && !Array.isArray(cpRaw)
      ? (cpRaw as CommercePackagingV1)
      : undefined;

  const confidence = product.confidence ?? 0.5;

  return {
    schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
    parser_version: IMPORT_DRAFT_PARSER_VERSION,
    source_url: pageUrl,
    product_name: product.title,
    brand: product.brand,
    category_hint: pickString(payload, ["category_slug", "product_type"]),
    description: pickString(payload, ["description", "long_description"]),
    image_url: primaryImage,
    image_urls: images.length > 0 ? images : undefined,
    sku: manufacturerSku,
    mpn: product.mpn,
    gtin: product.gtin,
    material: materialAttr?.value ?? pickString(payload, ["material"]),
    color: pickString(payload, ["color"]),
    thickness_mil: thicknessMil,
    case_pack: null,
    units_per_case: null,
    powder_free: null,
    latex_free: null,
    exam_grade: null,
    glove_grade: null,
    size: sizeRaw,
    variants,
    confidence: { overall: confidence, fields: {} },
    field_provenance: {},
    parse_warnings: [
      ...product.warnings,
      `extraction_authority:${CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS}`,
    ],
    commerce_packaging: commercePackaging,
    raw_evidence: {},
  };
}

export type ClipboardCatalogosExtractSuccess = {
  evidence: StagingExtractedPayloadV1 & Record<string, unknown>;
  stagingImageUrl: string | null;
  needsReview: boolean;
  catalogosJobId: string;
  catalogosProductId: string;
};

export type ClipboardCatalogosExtractResult =
  | { ok: true; value: ClipboardCatalogosExtractSuccess }
  | { ok: false; reason: string };

/**
 * Run CatalogOS single-product URL import and map the first product into clipboard staging shape.
 */
export async function extractClipboardViaCatalogosUrl(input: {
  pageUrl: string;
  imageUrl?: string | null;
}): Promise<ClipboardCatalogosExtractResult> {
  if (!isClipboardCatalogosExtractConfigured()) {
    return { ok: false, reason: "CatalogOS not configured" };
  }

  const hostname = new URL(input.pageUrl).hostname.replace(/^www\./i, "");
  const supplierName = hostname || "URL clipboard import";

  const post = await catalogosInternalRequest({
    method: "POST",
    path: "/api/admin/url-import",
    body: {
      supplier_name: supplierName,
      start_url: input.pageUrl,
      crawl_mode: "single_product",
      max_pages: 1,
    },
    maxAttempts: 1,
    timeoutMs: 290_000,
  });

  if (!post.ok) {
    return { ok: false, reason: post.error.message };
  }

  const postData = asObject(post.data);
  const jobId = pickString(postData ?? {}, ["jobId", "job_id"]);
  if (!jobId) {
    return { ok: false, reason: "CatalogOS URL import returned no jobId" };
  }

  const detail = await catalogosInternalRequest({
    method: "GET",
    path: `/api/admin/url-import/${encodeURIComponent(jobId)}`,
  });
  if (!detail.ok) {
    return { ok: false, reason: detail.error.message };
  }

  const adapted = adaptUrlImportJobDetail(detail.data);
  if (!adapted || adapted.products.length === 0) {
    return { ok: false, reason: "CatalogOS URL import produced no products" };
  }

  const root = asObject(detail.data);
  const productList = Array.isArray(root?.products) ? (root!.products as unknown[]) : [];
  const rawProduct =
    asObject(
      productList.find((p) => {
        const o = asObject(p);
        const url = pickString(o ?? {}, ["source_url"]) ?? "";
        return url === input.pageUrl;
      }) ?? productList[0]
    ) ?? null;
  if (!rawProduct) {
    return { ok: false, reason: "CatalogOS product row missing" };
  }

  const rawId = pickString(rawProduct, ["id"]);
  const adaptedProduct =
    adapted.products.find((p) => p.id === rawId) ?? adapted.products[0];

  const draft = importDraftFromCatalogosUrlProduct(
    adaptedProduct,
    rawProduct,
    input.pageUrl,
    input.imageUrl?.trim() || null
  );
  const stagingImageUrl = input.imageUrl?.trim() || draft.image_url || null;

  const evidence = buildStagingExtractedPayload({
    draft,
    sourceProductPageUrl: input.pageUrl,
    sourceImageUrl: stagingImageUrl,
    htmlTruncated: false,
  }) as StagingExtractedPayloadV1 & Record<string, unknown>;

  const rawPayload = asObject(rawProduct.raw_payload);
  if (rawPayload?.product_setup_contract_summary) {
    evidence.product_setup_contract_summary = rawPayload.product_setup_contract_summary;
  }
  if (rawPayload?.product_setup_contract_full) {
    evidence.product_setup_contract_full = rawPayload.product_setup_contract_full;
  }
  evidence.extraction_authority = CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS;
  evidence.catalogos_job_id = jobId;
  evidence.catalogos_product_id = adaptedProduct.id;

  return {
    ok: true,
    value: {
      evidence,
      stagingImageUrl,
      needsReview: draftNeedsHumanReview(draft) || adaptedProduct.warnings.length > 0,
      catalogosJobId: jobId,
      catalogosProductId: adaptedProduct.id,
    },
  };
}
