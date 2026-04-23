/**
 * Admin module exports (URL fetch / extraction helpers for tests and future tooling).
 * URL product import for the catalog runs in CatalogOS only.
 */

// URL Fetch (with SSRF protection)
export {
  validateUrl,
  safeFetchHtml,
  extractTextContent,
  extractMetaTags,
  extractTitle,
  extractTables,
  extractJsonLd,
  type UrlValidationResult,
  type FetchResult,
} from './urlFetch';

// Product Extraction
export {
  extractProductFromHtml,
  type ExtractedProductData,
  type ExtractionResult,
} from './productExtraction';
