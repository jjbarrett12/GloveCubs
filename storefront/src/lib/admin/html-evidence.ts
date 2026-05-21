/**
 * Lightweight HTML evidence extraction (no cheerio dependency).
 */

export type PageEvidence = {
  title: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  jsonLdProduct: Record<string, unknown> | null;
};

export type JsonLdProductHints = {
  name: string | null;
  brand: string | null;
  sku: string | null;
  mpn: string | null;
  gtin: string | null;
  description: string | null;
  image: string | null;
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

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function brandFromJsonLd(node: Record<string, unknown>): string | null {
  const b = node.brand;
  if (typeof b === "string") return b.trim() || null;
  if (b && typeof b === "object" && !Array.isArray(b)) {
    return firstString((b as Record<string, unknown>).name);
  }
  return null;
}

/** Extract first Product node from JSON-LD script blocks. */
export function extractJsonLdProduct(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const nodes: unknown[] = [];
      if (Array.isArray(parsed)) nodes.push(...parsed);
      else if (parsed && typeof parsed === "object") {
        const o = parsed as Record<string, unknown>;
        if (Array.isArray(o["@graph"])) nodes.push(...o["@graph"]);
        else nodes.push(o);
      }
      for (const node of nodes) {
        if (!node || typeof node !== "object" || Array.isArray(node)) continue;
        const typeVal = (node as Record<string, unknown>)["@type"];
        const types = Array.isArray(typeVal) ? typeVal : [typeVal];
        if (types.some((t) => String(t).toLowerCase().includes("product"))) {
          return node as Record<string, unknown>;
        }
      }
    } catch {
      /* skip invalid JSON-LD */
    }
  }
  return null;
}

export function jsonLdProductHints(node: Record<string, unknown> | null): JsonLdProductHints {
  if (!node) {
    return { name: null, brand: null, sku: null, mpn: null, gtin: null, description: null, image: null };
  }
  const img = node.image;
  let image: string | null = null;
  if (typeof img === "string") image = img.trim() || null;
  else if (Array.isArray(img) && typeof img[0] === "string") image = img[0].trim() || null;

  return {
    name: firstString(node.name),
    brand: brandFromJsonLd(node),
    sku: firstString(node.sku),
    mpn: firstString(node.mpn),
    gtin: firstString(node.gtin13) ?? firstString(node.gtin12) ?? firstString(node.gtin),
    description: firstString(node.description),
    image,
  };
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
  const jsonLdProduct = extractJsonLdProduct(html);
  return {
    title,
    ogTitle,
    ogDescription,
    ogImage,
    canonicalUrl,
    jsonLdProduct,
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
