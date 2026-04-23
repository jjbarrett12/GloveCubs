/**
 * OpenClaw Step 1: Discover glove product URLs from a category/collection URL.
 * Excludes blogs, support, cart, login, policy, generic category-only pages.
 */

import { safeFetchHtml } from "./fetch";
import { OPENCLAW_CONFIG } from "./config";
import type { DiscoveredProductUrl, ProductUrlList } from "./types";

const NON_PRODUCT_PATH_PATTERNS = [
  /\/blog\//i,
  /\/news\//i,
  /\/support\//i,
  /\/help\//i,
  /\/faq/i,
  /\/login/i,
  /\/signin/i,
  /\/cart/i,
  /\/checkout/i,
  /\/account/i,
  /\/policy/i,
  /\/privacy/i,
  /\/terms/i,
  /\/contact/i,
  /\/about(?:\/|$)/i,
  /\/search/i,
  /\/wishlist/i,
  /\.pdf$/i,
  /\.(jpg|jpeg|png|gif|webp)$/i,
];

/** Paths that often indicate a product detail page (not just category listing). */
const LIKELY_PRODUCT_PATTERNS = [
  /\/product\//i,
  /\/p\//i,
  /\/item\//i,
  /\/glove/i,
  /\/gloves/i,
  /\/pd\//i,
  /\/prod\//i,
  /-[a-z0-9-]{10,}$/i,
  /\/[a-z0-9-]+-\d+$/i,
];

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

function isSameOrigin(url: string, root: string): boolean {
  try {
    return new URL(url).origin === new URL(root).origin;
  } catch {
    return false;
  }
}

function isNonProductPath(pathname: string): boolean {
  return NON_PRODUCT_PATH_PATTERNS.some((re) => re.test(pathname));
}

function discoveryConfidence(url: string, categoryPath: string): number {
  const path = new URL(url).pathname;
  if (isNonProductPath(path)) return 0;
  let score = 0.3;
  if (LIKELY_PRODUCT_PATTERNS.some((re) => re.test(path))) score += 0.4;
  if (path.split("/").filter(Boolean).length >= 2) score += 0.1;
  if (categoryPath) score += 0.1;
  return Math.min(1, score);
}

function extractLinks(html: string, baseUrl: string): Array<{ href: string; categoryPath: string }> {
  const base = new URL(baseUrl);
  const links: Array<{ href: string; categoryPath: string }> = [];
  const hrefRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1].trim().split("#")[0];
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
    const resolved = resolveUrl(href, baseUrl);
    if (!resolved || !isSameOrigin(resolved, baseUrl)) continue;
    const path = new URL(resolved).pathname;
    if (isNonProductPath(path)) continue;
    const pathSegments = path.split("/").filter(Boolean);
    const categoryPath = pathSegments.length >= 2 ? pathSegments.slice(0, -1).join(" / ") : "";
    links.push({ href: resolved, categoryPath });
  }
  return links;
}

/** Pagination: find next page links (common patterns). */
function findPaginationUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const nextRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(?:next|>\s*»|&raquo;)/i;
  const m = html.match(nextRe);
  if (m) {
    const resolved = resolveUrl(m[1], baseUrl);
    if (resolved && isSameOrigin(resolved, baseUrl)) urls.push(resolved);
  }
  const pageRe = /href\s*=\s*["']([^"']*(?:page[=\-]\d+|\/page\/\d+)[^"']*)["']/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pageRe.exec(html)) !== null) {
    const resolved = resolveUrl(pm[1], baseUrl);
    if (resolved && isSameOrigin(resolved, baseUrl)) urls.push(resolved);
  }
  return [...new Set(urls)];
}

export interface DiscoverInput {
  /** Category or collection URL to start from. */
  root_url: string;
  /** Optional: list of product URLs directly (skip discovery). */
  product_urls?: string[];
  /** Max product URLs to return (default from config). */
  max_urls?: number;
}

/**
 * Discover product URLs from root or use provided list.
 * Returns product_url_list.json shape.
 */
export async function discoverProductUrls(input: DiscoverInput): Promise<ProductUrlList> {
  const maxUrls = input.max_urls ?? OPENCLAW_CONFIG.max_product_urls_per_run;
  const seen = new Set<string>();
  const discovered: DiscoveredProductUrl[] = [];

  if (input.product_urls?.length) {
    for (const u of input.product_urls) {
      const normalized = new URL(u).href;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      discovered.push({
        source_root_url: input.root_url,
        discovered_product_url: normalized,
        discovery_confidence: 0.95,
        category_path: "",
        notes: "Provided URL",
      });
      if (discovered.length >= maxUrls) break;
    }
    return {
      source_root_url: input.root_url,
      discovered,
      discovered_at: new Date().toISOString(),
    };
  }

  const queue: string[] = [input.root_url];
  const visited = new Set<string>();

  while (queue.length > 0 && discovered.length < maxUrls) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const result = await safeFetchHtml(current);
    if (!result.ok || !result.html) continue;

    const links = extractLinks(result.html, current);
    for (const { href, categoryPath } of links) {
      const norm = new URL(href).href;
      if (seen.has(norm)) continue;
      const conf = discoveryConfidence(norm, categoryPath);
      if (conf < 0.4) continue;
      seen.add(norm);
      discovered.push({
        source_root_url: input.root_url,
        discovered_product_url: norm,
        discovery_confidence: conf,
        category_path: categoryPath,
        notes: conf >= 0.7 ? "Likely product page" : "Possible product page",
      });
      if (discovered.length >= maxUrls) break;
    }
    if (discovered.length >= maxUrls) break;

    const nextPages = findPaginationUrls(result.html, current);
    for (const nextUrl of nextPages.slice(0, 5)) {
      if (!visited.has(nextUrl)) queue.push(nextUrl);
    }

    await new Promise((r) => setTimeout(r, OPENCLAW_CONFIG.delay_between_fetches_ms));
  }

  return {
    source_root_url: input.root_url,
    discovered,
    discovered_at: new Date().toISOString(),
  };
}
