import type { IngestionJobStatus, IngestionMode } from "./types";

export type UnifiedIngestionTelemetryEvent =
  | { type: "unified_ingestion_job_created"; jobId: string; mode: IngestionMode; sourceFingerprint: string }
  | { type: "unified_ingestion_state"; jobId: string; from: IngestionJobStatus; to: IngestionJobStatus }
  | {
      type: "unified_ingestion_blocked";
      jobId: string;
      sourceFingerprint: string;
      duplicateOf: string;
      reason: string;
    }
  | {
      type: "unified_staging_written";
      jobId: string;
      stagingProductId: string;
      stagingVariantIds: string[];
      evidenceCount: number;
    }
  | { type: "unified_staging_write_failed"; error: string; sourceFingerprint?: string };

export type UnifiedIngestionEmit = (event: UnifiedIngestionTelemetryEvent) => void;

export const noopUnifiedIngestionEmit: UnifiedIngestionEmit = () => {};
