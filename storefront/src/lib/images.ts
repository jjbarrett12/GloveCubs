/**
 * Production image URL policy and resolution.
 * Single contract for product/card image URLs so missing or malformed URLs
 * do not break storefront. Ready for Supabase Storage or CDN later.
 */

/** Placeholder path when no image URL is set (relative to public or asset host). */
export const PRODUCT_IMAGE_PLACEHOLDER = '/images/placeholder-product.svg';

/**
 * Resolve a product image URL for display.
 * Returns a safe URL string: valid input URL, or placeholder path when missing/invalid.
 * Do not use for sensitive redirects; input is not validated for protocol (assume same-origin or trusted CDN).
 */
export function resolveProductImageUrl(url: string | null | undefined): string {
  if (url == null || typeof url !== 'string') return PRODUCT_IMAGE_PLACEHOLDER;
  const trimmed = url.trim();
  if (trimmed === '') return PRODUCT_IMAGE_PLACEHOLDER;
  if (!trimmed.startsWith('http') && !trimmed.startsWith('/')) return PRODUCT_IMAGE_PLACEHOLDER;
  return trimmed;
}

/**
 * Return the first valid image URL from a list, or placeholder.
 */
export function resolveFirstProductImageUrl(urls: (string | null | undefined)[] | null | undefined): string {
  if (urls == null || !Array.isArray(urls)) return PRODUCT_IMAGE_PLACEHOLDER;
  for (const u of urls) {
    const resolved = resolveProductImageUrl(u);
    if (resolved !== PRODUCT_IMAGE_PLACEHOLDER) return resolved;
  }
  return PRODUCT_IMAGE_PLACEHOLDER;
}
