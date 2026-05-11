import { describe, expect, it } from "vitest";
import {
  buyerLifecycleStageLabel,
  buyerPipelineStageSortIndex,
  isBuyerPipelineDistributionStage,
} from "@/lib/procurement/buyer-lifecycle-copy";

describe("buyer lifecycle copy", () => {
  it("maps quote_linked to pricing-in-progress language (not complete)", () => {
    expect(buyerLifecycleStageLabel("quote_linked")).toBe("Pricing in progress");
    expect(buyerLifecycleStageLabel("quote_linked")).not.toMatch(/complete|done|final/i);
  });

  it("excludes closed from pipeline distribution", () => {
    expect(isBuyerPipelineDistributionStage("closed")).toBe(false);
    expect(isBuyerPipelineDistributionStage("quote_linked")).toBe(true);
  });

  it("sorts quote_linked before sales_follow_up for chip ordering", () => {
    expect(buyerPipelineStageSortIndex("quote_linked")).toBeLessThan(buyerPipelineStageSortIndex("sales_follow_up"));
  });

  it("falls back to raw stage for unknown values without throwing", () => {
    expect(buyerLifecycleStageLabel("hypothetical_future_stage")).toBe("hypothetical_future_stage");
  });
});
