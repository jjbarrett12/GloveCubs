/**
 * Feature flag for Product URL Extraction V2 crawl path.
 * When false, crawl-service continues using the legacy OpenClaw extraction path.
 */

export function isUrlExtractionV2Enabled(): boolean {
  return process.env.GLOVECUBS_URL_EXTRACTION_V2 === "true";
}
