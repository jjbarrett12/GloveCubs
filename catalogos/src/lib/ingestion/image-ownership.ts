/**
 * MVP: copy staged hero image off supplier hotlinks into catalog-import-images bucket.
 * Updates supplier_products_normalized.normalized_data with ownership fields; never throws batch.
 */

import { createHash } from "crypto";
import { getSupabaseCatalogos } from "@/lib/db/client";

export const CATALOG_IMPORT_IMAGES_BUCKET = "catalog-import-images";

/** Align with storage.buckets.file_size_limit for catalog-import-images */
export const IMAGE_OWNERSHIP_MAX_BYTES = 5 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 25_000;
const PAGE = 200;

export type ImageOwnershipStatus = "owned" | "failed" | "missing";

export type ImageOwnershipBatchResult = {
  owned: number;
  failed: number;
  skipped: number;
  rowsUpdated: number;
};

type RowLite = { id: string; normalized_data: Record<string, unknown> };

type UrlIngestOutcome =
  | { status: "owned"; publicUrl: string; hotlink: string }
  | { status: "failed"; error: string; hotlink: string };

/** Sniff image/jpeg | image/png | image/webp from magic bytes (do not trust Content-Type alone). */
export function sniffImageMimeFromBuffer(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function firstHttpsFromNormalized(nd: Record<string, unknown>): string | null {
  const single = typeof nd.image_url === "string" ? nd.image_url.trim() : "";
  if (single.startsWith("https://")) return single;
  const imgs = nd.images;
  if (Array.isArray(imgs)) {
    for (const x of imgs) {
      const u = String(x).trim();
      if (u.startsWith("https://")) return u;
    }
  }
  return null;
}

function firstHttpHotlink(nd: Record<string, unknown>): string | null {
  const single = typeof nd.image_url === "string" ? nd.image_url.trim() : "";
  if (single.startsWith("http://")) return single;
  const imgs = nd.images;
  if (Array.isArray(imgs)) {
    for (const x of imgs) {
      const u = String(x).trim();
      if (u.startsWith("http://")) return u;
    }
  }
  return null;
}

async function readBodyWithMaxSize(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Empty response body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      total += value.length;
      if (total > maxBytes) {
        throw new Error(`Image exceeds max size (${maxBytes} bytes)`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function storagePathForUrl(batchId: string, httpsUrl: string, ext: string): string {
  const h = createHash("sha256").update(httpsUrl, "utf8").digest("hex").slice(0, 24);
  return `${batchId}/${h}.${ext}`;
}

async function ingestHttpsImageToStorage(batchId: string, httpsUrl: string): Promise<UrlIngestOutcome> {
  let res: Response;
  try {
    const clRes = await fetch(httpsUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(Math.min(8000, FETCH_TIMEOUT_MS)),
      redirect: "follow",
      headers: { Accept: "image/*,*/*", "User-Agent": "CatalogOS-ImageOwnership/1.0" },
    });
    const lenHdr = clRes.headers.get("content-length");
    if (lenHdr) {
      const n = Number(lenHdr);
      if (Number.isFinite(n) && n > IMAGE_OWNERSHIP_MAX_BYTES) {
        return { status: "failed", error: `Content-Length exceeds max (${IMAGE_OWNERSHIP_MAX_BYTES} bytes)`, hotlink: httpsUrl };
      }
    }
  } catch {
    /* non-fatal: proceed to GET; some hosts omit HEAD */
  }

  try {
    res = await fetch(httpsUrl, {
      method: "GET",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: { Accept: "image/*,*/*", "User-Agent": "CatalogOS-ImageOwnership/1.0" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: `Fetch failed: ${msg}`, hotlink: httpsUrl };
  }

  if (!res.ok) {
    return { status: "failed", error: `HTTP ${res.status}`, hotlink: httpsUrl };
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBodyWithMaxSize(res, IMAGE_OWNERSHIP_MAX_BYTES);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg, hotlink: httpsUrl };
  }

  const mime = sniffImageMimeFromBuffer(bytes);
  if (!mime) {
    return { status: "failed", error: "Not a JPEG, PNG, or WebP image (magic bytes)", hotlink: httpsUrl };
  }

  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  const path = storagePathForUrl(batchId, httpsUrl, ext);
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const supabase = getSupabaseCatalogos(true);
  const { error: upErr } = await supabase.storage.from(CATALOG_IMPORT_IMAGES_BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: true,
  });

  if (upErr) {
    return { status: "failed", error: `Storage upload: ${upErr.message}`, hotlink: httpsUrl };
  }

  const { data: pub } = supabase.storage.from(CATALOG_IMPORT_IMAGES_BUCKET).getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) {
    return { status: "failed", error: "Could not build public URL for uploaded object", hotlink: httpsUrl };
  }

  return { status: "owned", publicUrl, hotlink: httpsUrl };
}

async function loadBatchRows(batchId: string): Promise<RowLite[]> {
  const supabase = getSupabaseCatalogos(true);
  const all: RowLite[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data: rows, error } = await supabase
      .from("supplier_products_normalized")
      .select("id, normalized_data")
      .eq("batch_id", batchId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`load batch rows for image ownership: ${error.message}`);
    const chunk = (rows ?? []) as RowLite[];
    if (chunk.length === 0) break;
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return all;
}

function mergeOwnershipIntoNd(
  nd: Record<string, unknown>,
  patch: {
    status: ImageOwnershipStatus;
    catalog_image_public_url: string | null;
    supplier_image_hotlink_url: string | null;
    image_ownership_error: string | null;
  }
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...nd };
  next.image_ownership_status = patch.status;
  next.catalog_image_public_url = patch.catalog_image_public_url;
  next.supplier_image_hotlink_url = patch.supplier_image_hotlink_url;
  if (patch.image_ownership_error != null && patch.image_ownership_error !== "") {
    next.image_ownership_error = patch.image_ownership_error.slice(0, 500);
  } else {
    delete next.image_ownership_error;
  }
  return next;
}

/**
 * For each staged row: resolve HTTPS hero URL, dedupe fetches by URL within the batch, upload to storage, patch normalized_data.
 */
export async function runImageOwnershipForBatch(batchId: string): Promise<ImageOwnershipBatchResult> {
  const supabase = getSupabaseCatalogos(true);
  const stats: ImageOwnershipBatchResult = { owned: 0, failed: 0, skipped: 0, rowsUpdated: 0 };

  let rows: RowLite[];
  try {
    rows = await loadBatchRows(batchId);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }

  const urlOutcomeCache = new Map<string, UrlIngestOutcome>();

  for (const row of rows) {
    const nd = { ...(row.normalized_data ?? {}) } as Record<string, unknown>;
    const https = firstHttpsFromNormalized(nd);
    const httpOnly = https ? null : firstHttpHotlink(nd);

    if (https) {
      let outcome = urlOutcomeCache.get(https);
      if (!outcome) {
        try {
          outcome = await ingestHttpsImageToStorage(batchId, https);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          outcome = { status: "failed", error: msg, hotlink: https };
        }
        urlOutcomeCache.set(https, outcome);
      }

      if (outcome.status === "owned") {
        const next = mergeOwnershipIntoNd(nd, {
          status: "owned",
          catalog_image_public_url: outcome.publicUrl,
          supplier_image_hotlink_url: outcome.hotlink,
          image_ownership_error: null,
        });
        const { error } = await supabase.from("supplier_products_normalized").update({ normalized_data: next }).eq("id", row.id);
        if (!error) {
          stats.owned++;
          stats.rowsUpdated++;
        }
      } else {
        const next = mergeOwnershipIntoNd(nd, {
          status: "failed",
          catalog_image_public_url: null,
          supplier_image_hotlink_url: outcome.hotlink,
          image_ownership_error: outcome.error,
        });
        const { error } = await supabase.from("supplier_products_normalized").update({ normalized_data: next }).eq("id", row.id);
        if (!error) {
          stats.failed++;
          stats.rowsUpdated++;
        }
      }
      continue;
    }

    if (httpOnly) {
      const next = mergeOwnershipIntoNd(nd, {
        status: "failed",
        catalog_image_public_url: null,
        supplier_image_hotlink_url: httpOnly,
        image_ownership_error: "Image URL must use HTTPS",
      });
      const { error } = await supabase.from("supplier_products_normalized").update({ normalized_data: next }).eq("id", row.id);
      if (!error) {
        stats.failed++;
        stats.rowsUpdated++;
      }
      continue;
    }

    const next = mergeOwnershipIntoNd(nd, {
      status: "missing",
      catalog_image_public_url: null,
      supplier_image_hotlink_url: null,
      image_ownership_error: null,
    });
    const { error } = await supabase.from("supplier_products_normalized").update({ normalized_data: next }).eq("id", row.id);
    if (!error) {
      stats.skipped++;
      stats.rowsUpdated++;
    }
  }

  return stats;
}
