/**
 * Detect whether a URL should be ingested as a direct image asset (vision path)
 * vs HTML product page (OpenClaw fetch-parse path).
 */

import { OPENCLAW_CONFIG } from "@/lib/openclaw/config";

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

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
]);

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(h)) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  return false;
}

/** HEAD request: returns true when Content-Type is image/*. Same host safety as OpenClaw fetch. */
export async function isImageContentTypeByHead(urlString: string): Promise<boolean> {
  try {
    const url = new URL(urlString.trim());
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (isPrivateHost(url.hostname)) return false;

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), Math.min(8000, OPENCLAW_CONFIG.fetch_timeout_ms));
    const res = await fetch(urlString, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": OPENCLAW_CONFIG.user_agent },
    });
    clearTimeout(to);
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    return ct.startsWith("image/");
  } catch {
    return false;
  }
}

export async function shouldIngestUrlAsImage(urlString: string): Promise<boolean> {
  if (isLikelyImageUrlByPath(urlString)) return true;
  return isImageContentTypeByHead(urlString);
}
