import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { assertUrlSafeForServerFetch } from "@/lib/admin/url-fetch-guard";
import { fetchHtmlForImport } from "@/lib/admin/import-draft-fetch";
import {
  buildStagingExtractedPayload,
  draftNeedsHumanReview,
  toImportDraftProductV1,
} from "@/lib/admin/import-draft-mapper";
import { extractProductFromHtml } from "@/lib/admin/productExtraction";
import { validateHttpUrl } from "@/lib/admin/products-import-proxy";
import { isLegacyClipboardMirrorEnabled, isUnifiedStagingWriteEnabled } from "@/lib/unified-ingestion/config";
import { writeQuickDraftUnifiedStaging } from "@/lib/admin/unified-staging-quick";
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
};

export async function listClipboardStaging(limit = 50): Promise<ClipboardStagingRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .select("id, product_page_url, image_url, extracted, review_status, created_catalog_product_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[clipboard-staging] list failed", error.message);
    return [];
  }
  return (data ?? []) as ClipboardStagingRow[];
}

export type CreateClipboardStagingResult =
  | {
      id: string;
      extracted: Record<string, unknown>;
      /** Clipboard row id when legacy mirror is on; null when unified-only. */
      clipboardStagingId: string | null;
      unifiedStagingVariantId: string | null;
      catalogosEnrichment: "not_requested";
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
  let evidence: StagingExtractedPayloadV1 | Record<string, unknown>;

  try {
    const { html, truncated } = await fetchHtmlForImport(pageUrl.url.toString());
    const extraction = extractProductFromHtml(html, pageUrl.url.toString());
    const draft = toImportDraftProductV1(extraction, pageUrl.url.toString());
    if (imageUrlParsed && !draft.image_url) {
      draft.image_url = imageUrlParsed.toString();
    }
    evidence = buildStagingExtractedPayload({
      draft,
      sourceProductPageUrl: pageUrl.url.toString(),
      sourceImageUrl: imageUrlParsed?.toString() ?? null,
      htmlTruncated: truncated,
    });
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
    const failedExtraction = extractProductFromHtml(
      `<html><head><title>Fetch failed</title></head><body></body></html>`,
      pageUrl.url.toString()
    );
    failedExtraction.reasoning.warnings.push(fetchError);
    const emptyDraft = toImportDraftProductV1(failedExtraction, pageUrl.url.toString());
    evidence = buildStagingExtractedPayload({
      draft: emptyDraft,
      sourceProductPageUrl: pageUrl.url.toString(),
      sourceImageUrl: imageUrlParsed?.toString() ?? null,
      fetchError,
    });
  }

  const extractedRecord = evidence as Record<string, unknown>;
  const needsReview =
    fetchError != null ||
    draftNeedsHumanReview((evidence as StagingExtractedPayloadV1).draft);

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
        image_url: imageUrlParsed?.toString() ?? null,
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
      imageUrl: imageUrlParsed?.toString() ?? null,
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
  };
}
