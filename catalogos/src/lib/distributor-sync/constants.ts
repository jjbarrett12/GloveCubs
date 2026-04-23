/**
 * Distributor sync: limits and config (crawl scope, rate, extraction).
 */

import { OPENCLAW_CONFIG } from "@/lib/openclaw/config";

export const DISTRIBUTOR_SYNC_CONFIG = {
  /** Max product pages to fetch and extract per crawl job. */
  max_pages_to_fetch: Math.min(OPENCLAW_CONFIG.max_pages_to_fetch, 200),
  /** Max unique URLs to discover from start page (first wave). */
  max_urls_first_wave: 500,
  /** Delay between page fetches (ms). */
  delay_between_fetches_ms: OPENCLAW_CONFIG.delay_between_fetches_ms,
  /** Fetch timeout per page (ms). */
  fetch_timeout_ms: OPENCLAW_CONFIG.fetch_timeout_ms,
} as const;
