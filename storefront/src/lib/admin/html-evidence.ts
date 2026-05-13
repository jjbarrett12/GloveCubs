/**
 * Lightweight HTML evidence extraction (no cheerio dependency).
 */

export type PageEvidence = {
  title: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
};

function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re);
  if (m?.[1]) return decodeBasicEntities(m[1].trim()) || null;
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    "i"
  );
  const m2 = html.match(re2);
  if (m2?.[1]) return decodeBasicEntities(m2[1].trim()) || null;
  return null;
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function extractPageEvidence(html: string): PageEvidence {
  const ogTitle = metaContent(html, "property", "og:title");
  const ogDescription = metaContent(html, "property", "og:description");
  const ogImage = metaContent(html, "property", "og:image");
  let title: string | null = null;
  const tm = html.match(/<title[^>]*>([^<]{1,500})<\/title>/i);
  if (tm?.[1]) title = decodeBasicEntities(tm[1].replace(/\s+/g, " ").trim()) || null;
  const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const canonicalUrl = canon?.[1]?.trim() ? canon[1].trim() : null;
  return {
    title,
    ogTitle,
    ogDescription,
    ogImage,
    canonicalUrl,
  };
}

export async function fetchHtmlEvidence(url: string, maxBytes = 400_000): Promise<{ html: string; truncated: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
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
