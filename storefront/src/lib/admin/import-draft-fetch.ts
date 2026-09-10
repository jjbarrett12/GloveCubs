/**
 * Fetch-only HTML retrieval for URL import staging.
 * Parsing is exclusively productExtraction.ts.
 */

import { ssrfSafeFetch } from "@ssrf-safe-fetch";

const DEFAULT_MAX_BYTES = 400_000;
const FETCH_TIMEOUT_MS = 12_000;

export async function fetchHtmlForImport(
  url: string,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<{ html: string; truncated: boolean }> {
  const res = await ssrfSafeFetch(url, {
    method: "GET",
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "User-Agent": "GloveCubsAdminUrlStaging/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(res.security_blocked ? `Blocked URL: ${res.error}` : res.error);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}`);
  }
  const ct = res.content_type ?? "";
  if (!ct.toLowerCase().includes("text/html") && !ct.toLowerCase().includes("application/xhtml")) {
    throw new Error("Response is not HTML.");
  }
  const text = res.buffer.toString("utf8");
  const truncated = text.length > maxBytes;
  return { html: truncated ? text.slice(0, maxBytes) : text, truncated };
}
