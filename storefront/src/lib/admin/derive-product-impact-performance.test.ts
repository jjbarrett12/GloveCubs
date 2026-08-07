import { describe, expect, it } from "vitest";
import {
  deriveProductImpactPerformance,
  initProductImpactPerformance,
  parseImpactPerformanceFromMetadata,
} from "@/lib/admin/derive-product-impact-performance";

describe("deriveProductImpactPerformance", () => {
  it("derives higher chemical and barrier for nitrile exam gloves", () => {
    const perf = deriveProductImpactPerformance({
      categorySlug: "disposable_gloves",
      attributes: {
        material: "nitrile",
        thickness_mil: "5",
        texture: "fingertip_textured",
        grade: "medical_exam_grade",
        powder: "powder_free",
      },
    });
    expect(perf.chemical).toBeGreaterThanOrEqual(1);
    expect(perf.grip).toBeGreaterThanOrEqual(1);
  });

  it("derives higher cost-per-use level for vinyl food service gloves", () => {
    const perf = deriveProductImpactPerformance({
      categorySlug: "disposable_gloves",
      attributes: {
        material: "vinyl",
        thickness_mil: "3",
        texture: "smooth",
        grade: "food_service",
        industries: ["food-service"],
      },
    });
    expect(perf.costPerUse).toBe(2);
  });

  it("derives cut protection for reusable cut-rated gloves", () => {
    const perf = deriveProductImpactPerformance({
      categorySlug: "reusable_work_gloves",
      attributes: {
        cut_level_ansi: "A4",
        coating: "nitrile",
        liner: "hppe",
      },
    });
    expect(perf.cut).toBeGreaterThanOrEqual(1);
  });

  it("round-trips impact performance from product metadata", () => {
    const stored = {
      grip: 2,
      abrasion: 1,
      chemical: 2,
      cut: 0,
      comfort: 1,
      costPerUse: 0,
    } as const;
    expect(parseImpactPerformanceFromMetadata({ impact_performance: stored })).toEqual(stored);
    expect(
      initProductImpactPerformance({
        metadata: { impact_performance: stored },
        attributes: { material: "vinyl" },
        categorySlug: "disposable_gloves",
      })
    ).toEqual(stored);
  });
});
