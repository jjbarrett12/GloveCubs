import { describe, expect, it } from "vitest";
import {
  GloveFinderRequestSchema,
  GloveFinderResponseSchema,
  GloveFinderRecommendationSchema,
} from "@/lib/ai/schemas";

describe("Glove Finder canonical contract", () => {
  it("parses minimal wizard request with defaults", () => {
    const r = GloveFinderRequestSchema.parse({ useCaseLabel: "Food service" });
    expect(r.hazards).toEqual([]);
    expect(r.latexAllergy).toBe(false);
    expect(r.operationalEnvironmentKey).toBe("restaurant_prep_line");
  });

  it("rejects empty useCaseLabel", () => {
    expect(GloveFinderRequestSchema.safeParse({ useCaseLabel: "" }).success).toBe(false);
  });

  it("parses response and strips badges from model-shaped input", () => {
    const raw = {
      recommendations: [
        {
          sku: "A",
          name: "Glove",
          reason: "fits",
          badges: ["food safe"],
          price_cents: 1000,
        },
      ],
      summary: "ok",
      follow_up_questions: ["q1"],
      opportunity_id: "550e8400-e29b-41d4-a716-446655440000",
    };
    const out = GloveFinderResponseSchema.parse(raw);
    expect(out.recommendations[0]).not.toHaveProperty("badges");
    expect(out.recommendations[0].price).toBe(10);
    expect(out.followUpQuestions).toEqual(["q1"]);
    expect(out.opportunityId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("GloveFinderRecommendationSchema omits badges after preprocess", () => {
    const one = GloveFinderRecommendationSchema.parse({
      sku: "X",
      name: "N",
      reason: "r",
      badges: ["ignore"],
    });
    expect("badges" in one).toBe(false);
  });

  it("parses buyer_display_ref snake_case and catalogFacts", () => {
    const raw = {
      recommendations: [
        {
          sku: "SKU1",
          name: "Glove",
          reason: "advisory",
          catalogFacts: [{ label: "Material (listing)", value: "Nitrile" }],
        },
      ],
      buyer_display_ref: "GC-PREP-ABCDEF012345",
    };
    const out = GloveFinderResponseSchema.parse(raw);
    expect(out.buyerDisplayRef).toBe("GC-PREP-ABCDEF012345");
    expect(out.recommendations[0].catalogFacts?.[0]?.value).toBe("Nitrile");
  });
});
