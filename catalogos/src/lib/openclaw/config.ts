/**
 * OpenClaw runtime config: limits, timeouts, safety.
 */

export const OPENCLAW_CONFIG = {
  /** Max product URLs to discover from one root (pagination + links). */
  max_product_urls_per_run: 2000,
  /** Max product pages to fetch and parse per run. */
  max_pages_to_fetch: 500,
  /** Fetch timeout per page (ms). */
  fetch_timeout_ms: 15_000,
  /** Max HTML size per page (bytes). */
  max_html_bytes: 2 * 1024 * 1024,
  /** User-Agent for fetch. */
  user_agent: "GloveCubs-OpenClaw/1.0 (+https://glovecubs.com)",
  /** Min confidence to consider row "high confidence" (>= 0.90). */
  high_confidence_threshold: 0.9,
  /** Usable with light review (0.75–0.89). */
  usable_confidence_min: 0.75,
  /** Below this: needs review. */
  needs_review_threshold: 0.75,
  /** Delay between page fetches (ms) to be polite. */
  delay_between_fetches_ms: 300,
} as const;
