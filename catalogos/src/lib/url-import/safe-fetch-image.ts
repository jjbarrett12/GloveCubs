/**
 * Fetch a remote image with the same host safety model as OpenClaw HTML fetch.
 */

import { OPENCLAW_CONFIG } from "@/lib/openclaw/config";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
]);

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(h)) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  return false;
}

export interface SafeFetchImageResult {
  ok: boolean;
  url: string;
  final_url?: string;
  content_type?: string;
  buffer?: Buffer;
  fetch_time_ms?: number;
  error?: string;
  security_blocked?: boolean;
}

export async function safeFetchImage(urlString: string): Promise<SafeFetchImageResult> {
  const start = Date.now();
  try {
    const url = new URL(urlString.trim());
    if (!["http:", "https:"].includes(url.protocol))
      return { ok: false, url: urlString, error: "Invalid protocol", security_blocked: true };
    if (isPrivateHost(url.hostname))
      return { ok: false, url: urlString, error: "Blocked host", security_blocked: true };

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), OPENCLAW_CONFIG.fetch_timeout_ms);
    const res = await fetch(urlString, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": OPENCLAW_CONFIG.user_agent },
    });
    clearTimeout(to);
    const finalUrl = res.url;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.startsWith("image/"))
      return {
        ok: false,
        url: urlString,
        final_url: finalUrl,
        content_type: ct,
        fetch_time_ms: Date.now() - start,
        error: "Not an image",
      };

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES)
      return {
        ok: false,
        url: urlString,
        final_url: finalUrl,
        fetch_time_ms: Date.now() - start,
        error: "Image too large",
      };

    return {
      ok: true,
      url: urlString,
      final_url: finalUrl,
      content_type: ct,
      buffer: buf,
      fetch_time_ms: Date.now() - start,
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      url: urlString,
      fetch_time_ms: Date.now() - start,
      error: err,
    };
  }
}
