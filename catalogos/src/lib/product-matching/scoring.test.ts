import { describe, it, expect } from "vitest";
import {
  normalizeUpc,
  scoreAttributes,
  scoreTitleSimilarity,
  computeMatch,
} from "./scoring";
import type { MasterForScoring, NormalizedForMatching } from "./scoring";

describe("product-matching scoring", () => {
  describe("normalizeUpc", () => {
    it("strips non-digits and truncates to 14", () => {
      expect(normalizeUpc("0 12-34 56789012345")).toBe("01234567890123");
    });
    it("returns empty for null/undefined", () => {
      expect(normalizeUpc(null)).toBe("");
      expect(normalizeUpc(undefined)).toBe("");
    });
  });

  describe("scoreAttributes", () => {
    it("scores full match", () => {
      const n: NormalizedForMatching = {
        filter_attributes: { brand: "Acme", material: "nitrile", size: "L", color: "blue" },
      };
      const m: MasterForScoring = {
        id: "p1",
        name: "Acme Nitrile L Blue",
        attributes: { brand: "Acme", material: "nitrile", size: "L", color: "blue" },
      };
      const { score, matched_attrs } = scoreAttributes(n, m);
      expect(score).toBe(1);
      expect(matched_attrs).toContain("brand");
      expect(matched_attrs).toContain("material");
    });

    it("scores partial match", () => {
      const n: NormalizedForMatching = {
        filter_attributes: { brand: "Acme", material: "nitrile", color: "blue" },
      };
      const m: MasterForScoring = {
        id: "p1",
        name: "Other",
        attributes: { brand: "Acme", material: "vinyl", color: "blue" },
      };
      const { score } = scoreAttributes(n, m);
      expect(score).toBeLessThan(1);
      expect(score).toBeGreaterThan(0);
    });
  });

  describe("scoreTitleSimilarity", () => {
    it("returns high ratio when words overlap", () => {
      expect(scoreTitleSimilarity("Acme Nitrile Gloves Blue", "Acme Nitrile Blue Gloves")).toBeGreaterThanOrEqual(0.5);
    });
    it("returns 0 for short or empty title", () => {
      expect(scoreTitleSimilarity("ab", "ab")).toBe(0);
      expect(scoreTitleSimilarity("", "Acme Gloves")).toBe(0);
    });
  });

  describe("computeMatch", () => {
    it("returns no_candidates when masters empty", () => {
      const result = computeMatch(
        { upc: "123", name: "Gloves", filter_attributes: {} },
        [],
        new Set()
      );
      expect(result.reason).toBe("no_candidates");
      expect(result.suggested_master_product_id).toBeNull();
      expect(result.candidate_list).toHaveLength(0);
    });

    it("returns upc_exact when UPC matches", () => {
      const masters: MasterForScoring[] = [
        { id: "p1", name: "Product 1", attributes: { upc: "12345678901234" } },
      ];
      const result = computeMatch(
        { upc: "12345678901234", name: "Other", filter_attributes: {} },
        masters,
        new Set()
      );
      expect(result.reason).toBe("upc_exact");
      expect(result.suggested_master_product_id).toBe("p1");
      expect(result.confidence).toBe(0.98);
    });

    it("returns attribute_match when attributes align", () => {
      const masters: MasterForScoring[] = [
        { id: "p1", name: "Acme Nitrile L Blue", attributes: { brand: "Acme", material: "nitrile", size: "L", color: "blue" } },
      ];
      const result = computeMatch(
        {
          name: "Acme Nitrile L Blue",
          filter_attributes: { brand: "Acme", material: "nitrile", size: "L", color: "blue" },
        },
        masters,
        new Set()
      );
      expect(result.reason).toBe("attribute_match");
      expect(result.suggested_master_product_id).toBe("p1");
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it("sets duplicate_warning when suggested master is in duplicate set", () => {
      const masters: MasterForScoring[] = [
        { id: "p1", name: "Same", attributes: { upc: "111" } },
      ];
      const result = computeMatch(
        { upc: "111", name: "Same", filter_attributes: {} },
        masters,
        new Set(["p1"])
      );
      expect(result.duplicate_warning).toBe(true);
      expect(result.requires_review).toBe(true);
    });
  });
});
