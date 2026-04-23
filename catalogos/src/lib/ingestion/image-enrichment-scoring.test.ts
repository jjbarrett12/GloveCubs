import { describe, it, expect } from "vitest";
import { adjustImageCandidateScore, pickBestCandidate } from "./image-enrichment-scoring";

describe("adjustImageCandidateScore", () => {
  it("penalizes banner/logo style URLs", async () => {
    const a = await adjustImageCandidateScore("https://cdn.example.com/products/n125-pack.jpg", 0.9);
    const b = await adjustImageCandidateScore("https://cdn.example.com/banner/n125-promo-logo.jpg", 0.9);
    expect(a.score).toBeGreaterThan(b.score);
  });

  it("pickBestCandidate chooses higher adjusted score", () => {
    const best = pickBestCandidate([
      { url: "a", adjustedScore: 0.5, baseScore: 0.5, source: "search" as const, query: null },
      { url: "b", adjustedScore: 0.88, baseScore: 0.9, source: "sku_catalog" as const, query: null },
    ]);
    expect(best?.url).toBe("b");
  });
});
