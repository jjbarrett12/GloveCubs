import type { IngestionJobStatus } from "./types";

const ALLOWED_TRANSITIONS: Record<IngestionJobStatus, ReadonlySet<IngestionJobStatus>> = {
  queued: new Set(["fetching", "failed", "blocked"]),
  fetching: new Set(["extracting", "failed", "blocked"]),
  extracting: new Set(["normalized", "failed", "blocked"]),
  normalized: new Set(["review_ready", "awaiting_human", "failed", "blocked"]),
  awaiting_human: new Set(["review_ready", "failed", "blocked"]),
  review_ready: new Set(["publish_ready", "failed", "blocked"]),
  publish_ready: new Set(["failed"]),
  blocked: new Set(["failed"]),
  failed: new Set(),
};

export function canTransitionIngestionJob(from: IngestionJobStatus, to: IngestionJobStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

export function assertIngestionJobTransition(
  from: IngestionJobStatus,
  to: IngestionJobStatus
): void {
  if (!canTransitionIngestionJob(from, to)) {
    throw new Error(`Invalid ingestion job transition: ${from} → ${to}`);
  }
}
