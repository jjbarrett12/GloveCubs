import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { assertUrlSafeForServerFetch } from "@/lib/admin/url-fetch-guard";
import { extractPageEvidence, fetchHtmlEvidence } from "@/lib/admin/html-evidence";
import { validateHttpUrl } from "@/lib/admin/products-import-proxy";

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

export async function createClipboardStaging(input: {
  productPageUrl: string;
  imageUrl?: string | null;
  createdBy: string | null;
}): Promise<{ id: string; extracted: Record<string, unknown> } | { error: string }> {
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
  let evidence: Record<string, unknown> = {
    source_product_page_url: pageUrl.url.toString(),
    source_image_url: imageUrlParsed?.toString() ?? null,
  };

  try {
    const { html, truncated } = await fetchHtmlEvidence(pageUrl.url.toString());
    const parsed = extractPageEvidence(html);
    evidence = {
      ...evidence,
      html_truncated: truncated,
      suggested_name: parsed.ogTitle ?? parsed.title ?? null,
      suggested_description: parsed.ogDescription ?? null,
      suggested_image_from_page: parsed.ogImage ?? null,
      page_title: parsed.title,
      canonical_url: parsed.canonicalUrl,
    };
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
    evidence = {
      ...evidence,
      fetch_error: fetchError,
    };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .insert({
      product_page_url: pageUrl.url.toString(),
      image_url: imageUrlParsed?.toString() ?? null,
      extracted: evidence,
      review_status: "needs_review",
      created_by: input.createdBy,
    })
    .select("id, extracted")
    .single();

  if (error) {
    return { error: error.message };
  }
  return { id: (data as { id: string }).id, extracted: ((data as { extracted: unknown }).extracted ?? {}) as Record<string, unknown> };
}
