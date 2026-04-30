import type { PublishReadiness } from "@/lib/review/publish-guards";

export type ReviewDecisionStepNumber = 1 | 2;

export type ReviewDecisionPublishTone = "blocked" | "warning" | "ready";

export interface ReviewDecisionStepResult {
  /** 1 = resolve match, 2 = publish to live */
  currentStep: ReviewDecisionStepNumber;
  /** True when step 1 is satisfied (master linked and no pending resolution). */
  step1Complete: boolean;
  /** Visual tone for step 2 copy; null when currentStep is 1. */
  publishTone: ReviewDecisionPublishTone | null;
  /** Single line for the decision helper. */
  headline: string;
}

function hasMasterProductId(v: unknown): boolean {
  if (v == null) return false;
  return String(v).trim().length > 0;
}

/**
 * Pure UI step for import review sheet. Uses only fields already on the staging detail payload.
 *
 * Step 1 when: resolution candidate is pending, or there is no master_product_id.
 * Step 2 when: master is linked and resolution is not pending.
 *
 * Publish sub-tone (step 2 only) uses publish_readiness.canPublish and warnings length.
 */
export function deriveReviewDecisionStep(input: {
  masterProductId: unknown;
  resolutionPending: boolean;
  publishReadiness?: PublishReadiness | null;
}): ReviewDecisionStepResult {
  const hasMaster = hasMasterProductId(input.masterProductId);
  const resolutionPending = input.resolutionPending === true;
  const step1Unresolved = resolutionPending || !hasMaster;
  const currentStep: ReviewDecisionStepNumber = step1Unresolved ? 1 : 2;
  const step1Complete = currentStep === 2;

  if (currentStep === 1) {
    let headline: string;
    if (resolutionPending && !hasMaster) {
      headline =
        "Resolve the proposed resolution, then link this row to a master (approve, merge, or create).";
    } else if (resolutionPending) {
      headline = "Resolve the proposed resolution (accept or reject).";
    } else {
      headline = "Link this row to a master product (approve match, merge with an existing master, or create new).";
    }
    return {
      currentStep: 1,
      step1Complete: false,
      publishTone: null,
      headline,
    };
  }

  const pr = input.publishReadiness;
  const canPublish = pr?.canPublish === true;
  const warningsLen = Array.isArray(pr?.warnings) ? pr.warnings.length : 0;

  if (!pr) {
    return {
      currentStep: 2,
      step1Complete: true,
      publishTone: "blocked",
      headline: "Publish preflight not loaded — scroll to Publish to live below.",
    };
  }

  if (!canPublish) {
    return {
      currentStep: 2,
      step1Complete: true,
      publishTone: "blocked",
      headline: "Publish blocked — fix preflight issues in Publish to live below.",
    };
  }

  if (warningsLen > 0) {
    return {
      currentStep: 2,
      step1Complete: true,
      publishTone: "warning",
      headline: "Ready to publish with warnings — review Publish to live below.",
    };
  }

  return {
    currentStep: 2,
    step1Complete: true,
    publishTone: "ready",
    headline: "Ready to publish when you are — primary actions are above.",
  };
}
