/**
 * Fetch-only HTML retrieval for URL import staging.
 * Parsing is exclusively productExtraction.ts.
 */

const DEFAULT_MAX_BYTES = 400_000;
const FETCH_TIMEOUT_MS = 12_000;

export async function fetchHtmlForImport(
  url: string,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<{ html: string; truncated: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "GloveCubsAdminUrlStaging/1.0",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("text/html") && !ct.toLowerCase().includes("application/xhtml")) {
      throw new Error("Response is not HTML.");
    }
    const text = await res.text();
    const truncated = text.length > maxBytes;
    return { html: truncated ? text.slice(0, maxBytes) : text, truncated };
  } finally {
    clearTimeout(t);
  }
}
