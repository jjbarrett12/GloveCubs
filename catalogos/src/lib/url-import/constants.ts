/** URL import: limits and behavior. */

export const URL_IMPORT_CONFIG = {
  max_pages_default: 50,
  max_pages_cap: 500,
  delay_between_fetches_ms: 400,
  /** Max product URLs to consider from one category page. */
  max_links_first_wave: 200,
  /** Min HTML length to consider for content hash (skip tiny error pages). */
  min_html_for_hash: 500,
  /** High confidence threshold for extraction (>= 0.9). */
  high_confidence_threshold: 0.9,
  /** Below this: flag for review. */
  low_confidence_threshold: 0.5,
} as const;
