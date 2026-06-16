import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { assertUrlSafeForServerFetch } from "@/lib/admin/url-fetch-guard";
import { fetchHtmlForImport } from "@/lib/admin/import-draft-fetch";
import {
  buildStagingExtractedPayload,
  draftNeedsHumanReview,
  toImportDraftProductV1,
} from "@/lib/admin/import-draft-mapper";
import {
  CLIPBOARD_EXTRACTION_AUTHORITY_LOCAL,
  extractClipboardViaCatalogosUrl,
  isClipboardCatalogosExtractConfigured,
} from "@/lib/admin/clipboard-url-catalogos-extract";
import { extractProductFromHtml } from "@/lib/admin/productExtraction";
import { validateHttpUrl } from "@/lib/admin/products-import-proxy";
import { isLegacyClipboardMirrorEnabled, isUnifiedStagingWriteEnabled } from "@/lib/unified-ingestion/config";
import { writeQuickDraftUnifiedStaging } from "@/lib/admin/unified-staging-quick";
import { deleteCatalogProduct } from "@/lib/admin/product-write";
import type { StagingExtractedPayloadV1 } from "@/lib/admin/import-draft-types";

/** Map raw PostgREST/Postgres errors to operator-safe copy; log the original server-side. */
export function mapClipboardStagingWriteError(raw: string): string {
  if (/permission denied for table admin_url_clipboard_staging/i.test(raw)) {
    return "URL staging failed because the admin staging table could not be written. Check server write permissions/RLS.";
  }
  if (/permission denied/i.test(raw) && /catalog_v2|admin_url_clipboard_staging|ingestion_/i.test(raw)) {
    return "URL staging failed because catalog staging tables could not be written. Check server write permissions/RLS.";
  }
  return raw;
}

export type ClipboardStagingRow = {
  id: string;
  product_page_url: string;
  image_url: string | null;
  extracted: Record<string, unknown>;
  review_status: string;
  created_catalog_product_id: string | null;
  created_at: string;
  /** Draft product updated_at when promoted; otherwise staging created_at. */
  last_edited_at: string | null;
};

export async function listClipboardStaging(limit = 50): Promise<ClipboardStagingRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .select("id, product_page_url, image_url, extracted, review_status, created_catalog_product_id, created_at")
    .neq("review_status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[clipboard-staging] list failed", error.message);
    return [];
  }

  const rows = (data ?? []) as Omit<ClipboardStagingRow, "last_edited_at">[];
  const productIds = rows
    .map((r) => r.created_catalog_product_id?.trim())
    .filter((id): id is string => Boolean(id));

  const productUpdatedAt = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products, error: prodErr } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, updated_at")
      .in("id", productIds);
    if (prodErr) {
      console.error("[clipboard-staging] product timestamps failed", prodErr.message);
    } else {
      for (const p of products ?? []) {
        const row = p as { id: string; updated_at: string | null };
        if (row.updated_at) productUpdatedAt.set(row.id, row.updated_at);
      }
    }
  }

  return rows.map((r) => {
    const productId = r.created_catalog_product_id?.trim();
    return {
      ...r,
      last_edited_at: (productId && productUpdatedAt.get(productId)) || r.created_at || null,
    };
  });
}

export type CreateClipboardStagingResult =
  | {
      id: string;
      extracted: Record<string, unknown>;
      /** Clipboard row id when legacy mirror is on; null when unified-only. */
      clipboardStagingId: string | null;
      unifiedStagingVariantId: string | null;
      catalogosEnrichment: "not_requested";
      /** catalogos_v2 when CatalogOS single-product import succeeded; local_fallback otherwise. */
      extraction_path: "catalogos_v2" | "local_fallback";
    }
  | { error: string };

export async function createClipboardStaging(input: {
  productPageUrl: string;
  imageUrl?: string | null;
  createdBy: string | null;
}): Promise<CreateClipboardStagingResult> {
  const pageUrl = validateHttpUrl(input.productPageUrl);
  if (!pageUrl.ok) return { error: `product_page_url ${pageUrl.reason}` };

  let imageUrlParsed: URL | null = null;
  if (input.imageUrl?.trim()) {
    const im = validateHttpUrl(input.imageUrl);
    if (!im.ok) return { error: `image_url ${im.reason}` };
    imageUrlParsed = im.url;
  }

  assertUrlSafeForServerFetch(pageUrl.url);
  if (imageUrlParsed) assertUrlSafeForServerFetch(imageUrlParsed);

  let fetchError: string | null = null;
  let evidence: StagingExtractedPayloadV1 | Record<string, unknown> | null = null;
  let stagingImageUrl: string | null = imageUrlParsed?.toString() ?? null;
  let extractionPath: "catalogos_v2" | "local_fallback" = "local_fallback";
  let needsReview = true;

  if (isClipboardCatalogosExtractConfigured()) {
    const catalogosRes = await extractClipboardViaCatalogosUrl({
      pageUrl: pageUrl.url.toString(),
      imageUrl: imageUrlParsed?.toString() ?? null,
    });
    if (catalogosRes.ok) {
      evidence = catalogosRes.value.evidence;
      stagingImageUrl = catalogosRes.value.stagingImageUrl;
      extractionPath = "catalogos_v2";
      needsReview = catalogosRes.value.needsReview;
    } else {
      console.warn(
        "[clipboard-staging] CatalogOS extract failed; using local fallback",
        catalogosRes.reason
      );
    }
  }

  if (!evidence) {
    try {
      const { html, truncated } = await fetchHtmlForImport(pageUrl.url.toString());
      const extraction = extractProductFromHtml(html, pageUrl.url.toString());
      const draft = toImportDraftProductV1(extraction, pageUrl.url.toString());
      if (imageUrlParsed && !draft.image_url) {
        draft.image_url = imageUrlParsed.toString();
      }
      draft.parse_warnings.push(`extraction_authority:${CLIPBOARD_EXTRACTION_AUTHORITY_LOCAL}`);
      stagingImageUrl = imageUrlParsed?.toString() ?? draft.image_url ?? null;
      evidence = buildStagingExtractedPayload({
        draft,
        sourceProductPageUrl: pageUrl.url.toString(),
        sourceImageUrl: stagingImageUrl,
        htmlTruncated: truncated,
      });
      (evidence as Record<string, unknown>).extraction_authority =
        CLIPBOARD_EXTRACTION_AUTHORITY_LOCAL;
      needsReview =
        draftNeedsHumanReview((evidence as StagingExtractedPayloadV1).draft);
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e);
      const failedExtraction = extractProductFromHtml(
        `<html><head><title>Fetch failed</title></head><body></body></html>`,
        pageUrl.url.toString()
      );
      failedExtraction.reasoning.warnings.push(fetchError);
      const emptyDraft = toImportDraftProductV1(failedExtraction, pageUrl.url.toString());
      emptyDraft.parse_warnings.push(`extraction_authority:${CLIPBOARD_EXTRACTION_AUTHORITY_LOCAL}`);
      evidence = buildStagingExtractedPayload({
        draft: emptyDraft,
        sourceProductPageUrl: pageUrl.url.toString(),
        sourceImageUrl: imageUrlParsed?.toString() ?? null,
        fetchError,
      });
      (evidence as Record<string, unknown>).extraction_authority =
        CLIPBOARD_EXTRACTION_AUTHORITY_LOCAL;
      needsReview = true;
    }
  }

  if (!evidence) {
    return { error: "URL staging extraction failed." };
  }

  const extractedRecord = evidence as Record<string, unknown>;
  if (extractionPath === "local_fallback") {
    needsReview =
      fetchError != null ||
      draftNeedsHumanReview((evidence as StagingExtractedPayloadV1).draft);
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const supabase = getSupabaseAdmin() as any;
  const unifiedOn = isUnifiedStagingWriteEnabled();
  const mirrorClipboard = isLegacyClipboardMirrorEnabled() || !unifiedOn;

  let clipboardId: string | null = null;
  let unifiedVariantId: string | null = null;

  if (mirrorClipboard) {
    const { data, error } = await supabase
      .schema("catalog_v2")
      .from("admin_url_clipboard_staging")
      .insert({
        product_page_url: pageUrl.url.toString(),
        image_url: stagingImageUrl,
        extracted: extractedRecord,
        review_status: "needs_review",
        created_by: input.createdBy,
      })
      .select("id, extracted")
      .single();

    if (error) {
      console.error("[clipboard-staging] insert failed", error.message);
      return { error: mapClipboardStagingWriteError(error.message) };
    }
    clipboardId = (data as { id: string }).id;
  }

  if (unifiedOn) {
    const unified = await writeQuickDraftUnifiedStaging(supabase, {
      productPageUrl: pageUrl.url.toString(),
      imageUrl: stagingImageUrl,
      extracted: extractedRecord,
      createdBy: input.createdBy,
      clipboardStagingId: clipboardId,
      requireHumanReview: needsReview,
    });
    if (!unified.ok) {
      if (!mirrorClipboard) {
        console.error("[clipboard-staging] unified write failed", unified.error);
        return { error: mapClipboardStagingWriteError(unified.error) };
      }
      console.error("[clipboard-staging] unified write failed (clipboard row kept)", unified.error);
    } else {
      unifiedVariantId = unified.stagingVariantId;
    }
  }

  if (!mirrorClipboard && unifiedOn) {
    if (!unifiedVariantId) {
      return { error: "Unified staging did not return a variant id." };
    }
    return {
      id: unifiedVariantId,
      extracted: extractedRecord,
      clipboardStagingId: null,
      unifiedStagingVariantId: unifiedVariantId,
      catalogosEnrichment: "not_requested",
      extraction_path: extractionPath,
    };
  }

  if (!clipboardId) {
    return { error: "Staging failed: no clipboard row and unified write disabled." };
  }

  return {
    id: clipboardId,
    extracted: extractedRecord,
    clipboardStagingId: clipboardId,
    unifiedStagingVariantId: unifiedVariantId,
    catalogosEnrichment: "not_requested",
    extraction_path: extractionPath,
  };
}

/** Removes a draft catalog product created from a clipboard staging row; marks staging dismissed. */
export async function discardClipboardStagingDraft(
  stagingId: string
): Promise<{ ok: true } | { error: string; status?: number }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", status: 503 };
  }

  const supabase = getSupabaseAdmin() as any;
  const { data: row, error: selErr } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .select("id, review_status, created_catalog_product_id")
    .eq("id", stagingId)
    .maybeSingle();

  if (selErr || !row) {
    return { error: "Staging row not found.", status: 404 };
  }

  const st = row as {
    review_status: string;
    created_catalog_product_id: string | null;
  };

  if (st.review_status !== "converted_to_draft") {
    return { error: "Only converted drafts can be deleted from staging.", status: 409 };
  }

  const productId = st.created_catalog_product_id?.trim();
  if (!productId) {
    return { error: "Staging row has no linked draft product.", status: 409 };
  }

  const deleted = await deleteCatalogProduct(productId);
  if ("error" in deleted) {
    return { error: deleted.error, status: deleted.status };
  }

  const { error: upErr } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .update({ review_status: "dismissed", created_catalog_product_id: null })
    .eq("id", stagingId)
    .eq("review_status", "converted_to_draft");

  if (upErr) {
    return { error: upErr.message, status: 500 };
  }

  return { ok: true };
}

/** Hide a converted staging row from active QA lists without deleting the linked draft. */
export async function archiveClipboardStagingConvertedDraft(
  stagingId: string
): Promise<{ ok: true } | { error: string; status?: number }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", status: 503 };
  }

  const supabase = getSupabaseAdmin() as any;
  const { data: row, error: selErr } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .select("id, review_status, created_catalog_product_id")
    .eq("id", stagingId)
    .maybeSingle();

  if (selErr || !row) {
    return { error: "Staging row not found.", status: 404 };
  }

  const st = row as {
    review_status: string;
    created_catalog_product_id: string | null;
  };

  if (st.review_status !== "converted_to_draft") {
    return { error: "Only converted drafts can be archived from staging.", status: 409 };
  }

  if (!st.created_catalog_product_id?.trim()) {
    return { error: "Staging row has no linked draft product.", status: 409 };
  }

  const { error: upErr } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .update({ review_status: "dismissed" })
    .eq("id", stagingId)
    .eq("review_status", "converted_to_draft");

  if (upErr) {
    return { error: upErr.message, status: 500 };
  }

  return { ok: true };
}

export type RemoveClipboardStagingImportOptions = {
  /** When true, deletes a linked catalog draft before removing the staging row. */
  deleteLinkedDrafts?: boolean;
};

export type RemoveClipboardStagingImportsResult = {
  removed: string[];
  failed: Array<{ stagingId: string; error: string }>;
};

/** Removes one staged import from active lists (dismiss or archive; optional linked draft delete). */
export async function removeClipboardStagingImport(
  stagingId: string,
  options: RemoveClipboardStagingImportOptions = {}
): Promise<{ ok: true } | { error: string; status?: number }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", status: 503 };
  }

  const supabase = getSupabaseAdmin() as any;
  const { data: row, error: selErr } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .select("id, review_status, created_catalog_product_id")
    .eq("id", stagingId)
    .maybeSingle();

  if (selErr || !row) {
    return { error: "Staging row not found.", status: 404 };
  }

  const st = row as {
    review_status: string;
    created_catalog_product_id: string | null;
  };

  if (st.review_status === "dismissed") {
    return { error: "Staging row is already removed.", status: 409 };
  }

  if (st.review_status === "needs_review") {
    const { error: upErr } = await supabase
      .schema("catalog_v2")
      .from("admin_url_clipboard_staging")
      .update({ review_status: "dismissed" })
      .eq("id", stagingId)
      .eq("review_status", "needs_review");
    if (upErr) return { error: upErr.message, status: 500 };
    return { ok: true };
  }

  if (st.review_status === "converted_to_draft") {
    if (options.deleteLinkedDrafts) {
      return discardClipboardStagingDraft(stagingId);
    }
    return archiveClipboardStagingConvertedDraft(stagingId);
  }

  return { error: `Cannot remove staging row in status "${st.review_status}".`, status: 409 };
}

/** Removes multiple staged imports; continues on per-row failures. */
export async function removeClipboardStagingImports(
  stagingIds: string[],
  options: RemoveClipboardStagingImportOptions = {}
): Promise<RemoveClipboardStagingImportsResult | { error: string; status?: number }> {
  const unique = [...new Set(stagingIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { error: "No staging ids provided.", status: 400 };
  }
  if (unique.length > 100) {
    return { error: "Too many staging rows (max 100 per request).", status: 400 };
  }

  const removed: string[] = [];
  const failed: Array<{ stagingId: string; error: string }> = [];

  for (const stagingId of unique) {
    const res = await removeClipboardStagingImport(stagingId, options);
    if ("error" in res) {
      failed.push({ stagingId, error: res.error });
    } else {
      removed.push(stagingId);
    }
  }

  return { removed, failed };
}
