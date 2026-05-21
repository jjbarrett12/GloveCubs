import type { IngestionJobStatus } from "./types";

const transitionSet = (
  statuses: readonly IngestionJobStatus[],
): ReadonlySet<IngestionJobStatus> => new Set<IngestionJobStatus>(statuses);

const ALLOWED_TRANSITIONS: Record<IngestionJobStatus, ReadonlySet<IngestionJobStatus>> = {
  queued: transitionSet(["fetching", "failed", "blocked"]),
  fetching: transitionSet(["extracting", "failed", "blocked"]),
  extracting: transitionSet(["normalized", "failed", "blocked"]),
  normalized: transitionSet(["review_ready", "awaiting_human", "failed", "blocked"]),
  awaiting_human: transitionSet(["review_ready", "failed", "blocked"]),
  review_ready: transitionSet(["publish_ready", "failed", "blocked"]),
  publish_ready: transitionSet(["failed"]),
  blocked: transitionSet(["failed"]),
  failed: transitionSet([]),
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
