/**
 * Detect whether a URL should be ingested as a direct image asset (vision path)
 * vs HTML product page (OpenClaw fetch-parse path).
 */

import { OPENCLAW_CONFIG } from "@/lib/openclaw/config";

import { ssrfSafeFetch } from "@ssrf-safe-fetch";

const IMAGE_EXT = /\.(jpe?g|png|webp)(\?|#|$)/i;

/** True when path suggests a raster image (query/hash allowed). */
export function isLikelyImageUrlByPath(urlString: string): boolean {
  try {
    const u = new URL(urlString.trim());
    return IMAGE_EXT.test(u.pathname);
  } catch {
    return false;
  }
}

/** HEAD request: returns true when Content-Type is image/*. SSRF-safe (DNS + redirect hops). */
export async function isImageContentTypeByHead(urlString: string): Promise<boolean> {
  const res = await ssrfSafeFetch(urlString, {
    method: "HEAD",
    timeoutMs: Math.min(8000, OPENCLAW_CONFIG.fetch_timeout_ms),
    headers: { "User-Agent": OPENCLAW_CONFIG.user_agent },
  });
  if (!res.ok) return false;
  return res.content_type.toLowerCase().startsWith("image/");
}

export async function shouldIngestUrlAsImage(urlString: string): Promise<boolean> {
  if (isLikelyImageUrlByPath(urlString)) return true;
  return isImageContentTypeByHead(urlString);
}
