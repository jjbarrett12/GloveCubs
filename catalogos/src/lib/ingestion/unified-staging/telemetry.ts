/**
 * Unified ingestion telemetry (console + ingestion_failure log).
 */

import { logIngestionFailure } from "@/lib/observability";
import type { UnifiedIngestionTelemetryEvent } from "../../../../../lib/unified-ingestion/telemetry-events";

export type { UnifiedIngestionTelemetryEvent };

export function emitUnifiedIngestionEvent(event: UnifiedIngestionTelemetryEvent): void {
  if (process.env.NODE_ENV === "development") {
    console.log("[unified-ingestion]", event.type, event);
  }

  if (event.type === "unified_staging_write_failed") {
    logIngestionFailure(event.error, {
      entity_type: "unified_ingestion",
      event: event.type,
      source_fingerprint: event.sourceFingerprint,
    });
  }
}
