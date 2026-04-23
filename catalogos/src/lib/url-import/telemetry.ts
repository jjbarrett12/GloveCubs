/**
 * Structured telemetry for URL import (crawl, extraction, bridge).
 * Log events for observability and cost control; can be extended to send to external system.
 */

export type UrlImportEvent =
  | { type: "crawl_started"; jobId: string; startUrl: string }
  | { type: "crawl_failed"; jobId: string; error: string }
  | { type: "page_extraction_failed"; jobId: string; url: string; error?: string }
  | { type: "low_confidence_extraction"; jobId: string; productId: string; confidence: number }
  | { type: "family_grouping_applied"; jobId: string; familyGroupKey: string; variantCount: number }
  | { type: "family_grouping_uncertain"; jobId: string; reason: string }
  | { type: "import_bridge_failed"; jobId: string; error: string }
  | { type: "import_bridge_success"; jobId: string; batchId: string; normalizedCount: number };

export function emitUrlImportEvent(event: UrlImportEvent): void {
  if (process.env.NODE_ENV === "development") {
    console.log("[url-import]", event.type, event);
  }
  // Future: send to telemetry backend (e.g. catalogos.import_telemetry_events table or external)
}
