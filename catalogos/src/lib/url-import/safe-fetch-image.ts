/**
 * Fetch a remote image with hop-by-hop SSRF protection (shared with OpenClaw HTML fetch).
 */

import { ssrfSafeFetch } from "@ssrf-safe-fetch";
import { OPENCLAW_CONFIG } from "@/lib/openclaw/config";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

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
  const fetched = await ssrfSafeFetch(urlString, {
    method: "GET",
    timeoutMs: OPENCLAW_CONFIG.fetch_timeout_ms,
    headers: { "User-Agent": OPENCLAW_CONFIG.user_agent },
  });
  if (!fetched.ok) {
    return {
      ok: false,
      url: urlString,
      error: fetched.error,
      security_blocked: fetched.security_blocked,
      fetch_time_ms: fetched.fetch_time_ms,
    };
  }
  const ct = fetched.content_type.toLowerCase();
  if (!ct.startsWith("image/")) {
    return {
      ok: false,
      url: urlString,
      final_url: fetched.final_url,
      content_type: ct,
      fetch_time_ms: fetched.fetch_time_ms,
      error: "Not an image",
    };
  }
  if (fetched.buffer.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      url: urlString,
      final_url: fetched.final_url,
      fetch_time_ms: fetched.fetch_time_ms,
      error: "Image too large",
    };
  }
  return {
    ok: true,
    url: urlString,
    final_url: fetched.final_url,
    content_type: ct,
    buffer: fetched.buffer,
    fetch_time_ms: fetched.fetch_time_ms,
  };
}
