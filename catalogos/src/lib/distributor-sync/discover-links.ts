/**
 * Discover product/category links from HTML, restricted by allowed domain and path patterns.
 * Reuses OpenClaw-style link extraction with configurable URL filter.
 */

import type { AllowedDomainConfig } from "./url-validation";
import { isUrlAllowedForCrawl } from "./url-validation";

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

function isNonProductPath(pathname: string): boolean {
  return NON_PRODUCT_PATH_PATTERNS.some((re) => re.test(pathname));
}

function isLikelyProductPath(pathname: string): boolean {
  return LIKELY_PRODUCT_PATTERNS.some((re) => re.test(pathname));
}

export interface DiscoveredLink {
  url: string;
  categoryPath: string;
  pageType: "product" | "category" | "unknown";
}

/**
 * Extract links from HTML that are allowed for crawl and classify as product/category/unknown.
 */
export function discoverLinks(
  html: string,
  baseUrl: string,
  config: AllowedDomainConfig
): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];
  const hrefRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1].trim().split("#")[0];
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
    const resolved = resolveUrl(href, baseUrl);
    if (!resolved) continue;
    if (!isUrlAllowedForCrawl(resolved, baseUrl, config)) continue;
    const path = new URL(resolved).pathname;
    if (isNonProductPath(path)) continue;
    const pathSegments = path.split("/").filter(Boolean);
    const categoryPath = pathSegments.length >= 2 ? pathSegments.slice(0, -1).join(" / ") : "";
    const pageType: DiscoveredLink["pageType"] = isLikelyProductPath(path) ? "product" : pathSegments.length >= 2 ? "category" : "unknown";
    links.push({ url: resolved, categoryPath, pageType });
  }
  return links;
}

/** Pagination: find next page links (common patterns). */
export function findPaginationUrls(
  html: string,
  baseUrl: string,
  config: AllowedDomainConfig
): string[] {
  const urls: string[] = [];
  const nextRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(?:next|>\s*»|&raquo;)/i;
  const m = html.match(nextRe);
  if (m) {
    const resolved = resolveUrl(m[1], baseUrl);
    if (resolved && isUrlAllowedForCrawl(resolved, baseUrl, config)) urls.push(resolved);
  }
  const pageRe = /href\s*=\s*["']([^"']*(?:page[=\-]\d+|\/page\/\d+)[^"']*)["']/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pageRe.exec(html)) !== null) {
    const resolved = resolveUrl(pm[1], baseUrl);
    if (resolved && isUrlAllowedForCrawl(resolved, baseUrl, config)) urls.push(resolved);
  }
  return [...new Set(urls)];
}
