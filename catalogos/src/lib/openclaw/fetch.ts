/**
 * Safe fetch for OpenClaw: timeout, size limit, SSRF-safe.
 */

import { OPENCLAW_CONFIG } from "./config";

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
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("text/html"))
      return {
        ok: false,
        url: urlString,
        final_url: finalUrl,
        content_type: ct,
        fetch_time_ms: Date.now() - start,
        error: "Not HTML",
      };
    const text = await res.text();
    if (text.length > OPENCLAW_CONFIG.max_html_bytes)
      return {
        ok: false,
        url: urlString,
        final_url: finalUrl,
        fetch_time_ms: Date.now() - start,
        error: "Response too large",
      };
    return {
      ok: true,
      url: urlString,
      final_url: finalUrl,
      html: text,
      content_type: ct,
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
