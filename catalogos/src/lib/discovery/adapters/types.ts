/**
 * Discovery adapter interface. Sources (search, manual, CSV) implement this.
 * No fake scraping: adapters return real candidates; service persists and scores.
 */

import type { RawLeadCandidate } from "../types";

export interface DiscoveryAdapterContext {
  /** Run id for logging. */
  runId: string;
  /** Adapter-specific config (e.g. query string, file url). */
  config?: Record<string, unknown>;
}

/**
 * Adapters produce a stream or list of raw candidates.
 * Service normalizes domain, dedupes, scores, and inserts.
 */
export interface DiscoveryAdapter {
  name: string;
  /**
   * Fetch candidates. Can be async generator or return array.
   * Throw or log to context for errors; service will log events.
   */
  discover(context: DiscoveryAdapterContext): Promise<RawLeadCandidate[]> | AsyncGenerator<RawLeadCandidate>;
}

/** Registry of adapters by name for run execution. */
export type DiscoveryAdapterRegistry = Map<string, DiscoveryAdapter>;
