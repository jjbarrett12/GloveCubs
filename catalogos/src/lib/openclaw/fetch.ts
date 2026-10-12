/**
 * Safe fetch for OpenClaw: timeout, size limit, SSRF-safe (DNS + redirect hops).
 */

import { ssrfSafeFetch } from "@ssrf-safe-fetch";
import { OPENCLAW_CONFIG } from "./config";

export interface SafeFetchResult {
  ok: boolean;
  url: string;
  final_url?: string;
  html?: string;
  content_type?: string;
  fetch_time_ms?: number;
  error?: string;
  security_blocked?: boolean;
}

export async function safeFetchHtml(urlString: string): Promise<SafeFetchResult> {
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
  const ct = fetched.content_type ?? "";
  if (!ct.toLowerCase().includes("text/html")) {
    return {
      ok: false,
      url: urlString,
      final_url: fetched.final_url,
      content_type: ct,
      fetch_time_ms: fetched.fetch_time_ms,
      error: "Not HTML",
    };
  }
  const text = fetched.buffer.toString("utf8");
  if (text.length > OPENCLAW_CONFIG.max_html_bytes) {
    return {
      ok: false,
      url: urlString,
      final_url: fetched.final_url,
      fetch_time_ms: fetched.fetch_time_ms,
      error: "Response too large",
    };
  }
  return {
    ok: true,
    url: urlString,
    final_url: fetched.final_url,
    html: text,
    content_type: ct,
    fetch_time_ms: fetched.fetch_time_ms,
  };
}
