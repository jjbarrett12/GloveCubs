import { describe, it, expect } from "vitest";
import { deriveReviewDecisionStep } from "./review-decision-step";
import type { PublishReadiness } from "./publish-guards";

function readiness(partial: Partial<PublishReadiness>): PublishReadiness {
  return {
    canPublish: false,
    blockers: [],
    warnings: [],
    categorySlug: "disposable_gloves",
    categoryRequirementsEnforced: true,
    blockerSections: {
      workflow: [],
      staging_validation: [],
      missing_required_attributes: [],
      case_pricing: [],
    },
    postClickPipelineNotes: [],
    ...partial,
  };
}

describe("deriveReviewDecisionStep", () => {
  it("step 1 when no master", () => {
    const r = deriveReviewDecisionStep({
      masterProductId: null,
      resolutionPending: false,
      publishReadiness: readiness({ canPublish: true }),
    });
    expect(r.currentStep).toBe(1);
    expect(r.step1Complete).toBe(false);
    expect(r.publishTone).toBeNull();
    expect(r.headline).toContain("Link");
  });

  it("step 1 when resolution pending even if master exists", () => {
    const r = deriveReviewDecisionStep({
      masterProductId: "00000000-0000-0000-0000-000000000001",
      resolutionPending: true,
      publishReadiness: readiness({ canPublish: true }),
    });
    expect(r.currentStep).toBe(1);
    expect(r.headline).toContain("resolution");
  });

  it("step 1 when no master and resolution pending (combined copy)", () => {
    const r = deriveReviewDecisionStep({
      masterProductId: "",
      resolutionPending: true,
    });
    expect(r.currentStep).toBe(1);
    expect(r.headline).toContain("resolution");
    expect(r.headline.toLowerCase()).toContain("master");
  });

  it("step 2 blocked when master linked, resolution settled, canPublish false", () => {
    const r = deriveReviewDecisionStep({
      masterProductId: "mid-1",
      resolutionPending: false,
      publishReadiness: readiness({ canPublish: false, blockers: ["x"] }),
    });
    expect(r.currentStep).toBe(2);
    expect(r.step1Complete).toBe(true);
    expect(r.publishTone).toBe("blocked");
    expect(r.headline).toContain("blocked");
  });

  it("step 2 warning when canPublish and warnings present", () => {
    const r = deriveReviewDecisionStep({
      masterProductId: "mid-1",
      resolutionPending: false,
      publishReadiness: readiness({ canPublish: true, warnings: ["Low image confidence"] }),
    });
    expect(r.currentStep).toBe(2);
    expect(r.publishTone).toBe("warning");
    expect(r.headline).toContain("warnings");
  });

  it("step 2 ready when canPublish and no warnings", () => {
    const r = deriveReviewDecisionStep({
      masterProductId: "mid-1",
      resolutionPending: false,
      publishReadiness: readiness({ canPublish: true, warnings: [] }),
    });
    expect(r.currentStep).toBe(2);
    expect(r.publishTone).toBe("ready");
    expect(r.headline).toContain("Ready");
  });

  it("step 2 blocked when publishReadiness missing", () => {
    const r = deriveReviewDecisionStep({
      masterProductId: "mid-1",
      resolutionPending: false,
      publishReadiness: undefined,
    });
    expect(r.currentStep).toBe(2);
    expect(r.publishTone).toBe("blocked");
    expect(r.headline).toContain("not loaded");
  });

  it("treats whitespace-only master id as no master", () => {
    const r = deriveReviewDecisionStep({
      masterProductId: "   ",
      resolutionPending: false,
    });
    expect(r.currentStep).toBe(1);
  });
});
