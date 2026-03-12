/**
 * Admin Module Exports
 * 
 * Services for admin functionality including product import from external URLs.
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

// Product Import
export {
  importProductFromUrl,
  approveCandidate,
  rejectCandidate,
  getPendingCandidates,
  getCandidate,
  type ProductCandidate,
  type ImportResult,
  type ApprovalResult,
  type CandidateStatus,
} from './productImport';
