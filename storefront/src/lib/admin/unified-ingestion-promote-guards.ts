import type { IngestionJobStatus } from "@/lib/unified-ingestion/types";

const PROMOTABLE_JOB_STATUSES: ReadonlySet<IngestionJobStatus> = new Set<IngestionJobStatus>([
  "review_ready",
  "awaiting_human",
]);

export function canPromoteUnifiedStaging(input: {
  jobStatus: IngestionJobStatus;
  reviewStatus: string;
  alreadyPromoted: boolean;
  confirmAwaitingHuman: boolean;
}): { ok: true } | { ok: false; error: string; status: number } {
  if (input.jobStatus === "blocked" || input.jobStatus === "failed") {
    return { ok: false, error: `Cannot promote: ingestion job is ${input.jobStatus}.`, status: 409 };
  }
  if (!PROMOTABLE_JOB_STATUSES.has(input.jobStatus)) {
    return {
      ok: false,
      error: `Cannot promote: job status must be review_ready or awaiting_human (got ${input.jobStatus}).`,
      status: 409,
    };
  }
  if (input.jobStatus === "awaiting_human" && !input.confirmAwaitingHuman) {
    return {
      ok: false,
      error: "Job requires operator confirmation (confirm_awaiting_human: true).",
      status: 409,
    };
  }
  if (input.reviewStatus !== "needs_review") {
    return { ok: false, error: "Staging row is not awaiting review.", status: 409 };
  }
  if (input.alreadyPromoted) {
    return { ok: false, error: "Staging row was already promoted.", status: 409 };
  }
  return { ok: true };
}
