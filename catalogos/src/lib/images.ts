/**
 * Production image URL policy and resolution for CatalogOS.
 * Matches storefront contract: invalid or missing URLs resolve to placeholder
 * so product cards and pages never break.
 */

/** Placeholder path when no image URL is set (relative to public or asset host). */
export const PRODUCT_IMAGE_PLACEHOLDER = "/images/placeholder-product.svg";

/**
 * Resolve a product image URL for display.
 * Returns a safe URL string or placeholder when missing/invalid.
 */
export function resolveProductImageUrl(url: string | null | undefined): string {
  if (url == null || typeof url !== "string") return PRODUCT_IMAGE_PLACEHOLDER;
  const trimmed = url.trim();
  if (trimmed === "") return PRODUCT_IMAGE_PLACEHOLDER;
  if (!trimmed.startsWith("http") && !trimmed.startsWith("/")) return PRODUCT_IMAGE_PLACEHOLDER;
  return trimmed;
}

/**
 * Return the first valid image URL from a list, or placeholder.
 */
export function resolveFirstProductImageUrl(
  urls: (string | null | undefined)[] | null | undefined
): string {
  if (urls == null || !Array.isArray(urls)) return PRODUCT_IMAGE_PLACEHOLDER;
  for (const u of urls) {
    const resolved = resolveProductImageUrl(u);
    if (resolved !== PRODUCT_IMAGE_PLACEHOLDER) return resolved;
  }
  return PRODUCT_IMAGE_PLACEHOLDER;
}
