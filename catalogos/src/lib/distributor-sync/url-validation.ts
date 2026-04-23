/**
 * URL validation for distributor sync: protocol, host, and path restrictions.
 * Crawl is restricted to approved distributor source domain and optional path patterns.
 */

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

export interface AllowedDomainConfig {
  allowedDomains: string[];
  allowedPathPatterns: string[];
}

/**
 * Normalize host for comparison (lowercase, optional www strip).
 */
export function normalizeHost(host: string): string {
  const h = host.toLowerCase().trim();
  return h.startsWith("www.") ? h.slice(4) : h;
}

/**
 * Validate URL: must be HTTP(S), not private IP, and host allowed.
 * Returns error message or null if valid.
 */
export function validateUrl(
  urlString: string,
  allowedDomains: string[]
): string | null {
  const trimmed = urlString.trim();
  if (!trimmed) return "URL is required";

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "Invalid URL";
  }

  if (!["http:", "https:"].includes(url.protocol))
    return "Only HTTP and HTTPS URLs are allowed";

  if (isPrivateHost(url.hostname)) return "URL host is not allowed";

  const hostNorm = normalizeHost(url.hostname);
  const allowedNorm = allowedDomains.map(normalizeHost);
  if (allowedNorm.length > 0 && !allowedNorm.includes(hostNorm))
    return `Domain ${url.hostname} is not in the allowed list`;

  return null;
}

/**
 * Check if a resolved link URL is allowed for this source:
 * - host must be in allowedDomains (or same as root if empty)
 * - if allowedPathPatterns is non-empty, pathname must start with one of them
 */
export function isUrlAllowedForCrawl(
  linkUrl: string,
  rootUrl: string,
  config: AllowedDomainConfig
): boolean {
  try {
    const link = new URL(linkUrl);
    const root = new URL(rootUrl);

    const allowedDomains = config.allowedDomains.length
      ? config.allowedDomains
      : [normalizeHost(root.hostname)];
    const hostNorm = normalizeHost(link.hostname);
    if (!allowedDomains.map(normalizeHost).includes(hostNorm)) return false;

    if (config.allowedPathPatterns.length === 0) return true;
    const path = link.pathname;
    return config.allowedPathPatterns.some((p) => {
      const pattern = p.startsWith("/") ? p : `/${p}`;
      return path === pattern || path.startsWith(pattern + "/");
    });
  } catch {
    return false;
  }
}

/**
 * Build allowed domain list from a single start URL (for new source).
 */
export function allowedDomainsFromStartUrl(startUrl: string): string[] {
  try {
    const url = new URL(startUrl.trim());
    const host = normalizeHost(url.hostname);
    return [host];
  } catch {
    return [];
  }
}
