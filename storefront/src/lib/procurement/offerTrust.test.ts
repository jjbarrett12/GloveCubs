import { describe, it, expect } from "vitest";
import { 
  calculateTrustAdjustedPrice, 
  shouldOfferRequireReview, 
  type OfferTrustScore, 
  type OfferTrustFactors,
  type TrustBand,
} from "./offerTrust";

describe("Offer Trust Scoring", () => {
  describe("Trust-Adjusted Price Calculation", () => {
    it("should apply exponential penalty for low trust scores", () => {
      const rawPrice = 100;

      // High trust (0.9) = minimal penalty
      const highTrustPrice = calculateTrustAdjustedPrice(rawPrice, 0.9);
      expect(highTrustPrice).toBeLessThan(110); // Less than 10% increase

      // Medium trust (0.6) = moderate penalty
      const mediumTrustPrice = calculateTrustAdjustedPrice(rawPrice, 0.6);
      expect(mediumTrustPrice).toBeGreaterThan(110);
      expect(mediumTrustPrice).toBeLessThan(130);

      // Low trust (0.3) = significant penalty
      const lowTrustPrice = calculateTrustAdjustedPrice(rawPrice, 0.3);
      expect(lowTrustPrice).toBeGreaterThan(130);
      expect(lowTrustPrice).toBeLessThan(180);

      // Zero trust = maximum penalty (up to 100% increase)
      const zeroTrustPrice = calculateTrustAdjustedPrice(rawPrice, 0);
      expect(zeroTrustPrice).toBe(200); // 100% penalty
    });

    it("should make low-trust cheap offers less attractive than high-trust expensive ones", () => {
      // Low-trust offer at $80
      const lowTrustOfferAdjusted = calculateTrustAdjustedPrice(80, 0.3);

      // High-trust offer at $100
      const highTrustOfferAdjusted = calculateTrustAdjustedPrice(100, 0.9);

      // After trust adjustment, high-trust should win (lower adjusted price)
      expect(highTrustOfferAdjusted).toBeLessThan(lowTrustOfferAdjusted);
    });

    it("should have monotonically increasing penalty as trust decreases", () => {
      const rawPrice = 100;
      const trustLevels = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0];
      
      let previousPrice = rawPrice;
      for (const trust of trustLevels) {
        const adjustedPrice = calculateTrustAdjustedPrice(rawPrice, trust);
        expect(adjustedPrice).toBeGreaterThanOrEqual(previousPrice);
        previousPrice = adjustedPrice;
      }
    });

    it("should have no penalty for perfect trust (1.0)", () => {
      const rawPrice = 100;
      const adjustedPrice = calculateTrustAdjustedPrice(rawPrice, 1.0);
      expect(adjustedPrice).toBe(rawPrice);
    });
  });

  describe("Review Requirement", () => {
    const mockFactors: OfferTrustFactors = {
      supplier_reliability: 0.5,
      match_confidence: 0.5,
      extraction_confidence: 0.5,
      pricing_confidence: 0.5,
      freshness: 0.5,
      normalization_confidence: 0.5,
      anomaly_history: 0.1,
      correction_history: 0.1,
    };

    function createMockOffer(overrides: Partial<OfferTrustScore>): OfferTrustScore {
      return {
        offer_id: "offer-1",
        supplier_id: "sup-1",
        trust_score: 0.5,
        trust_band: "medium_trust" as TrustBand,
        supplier_reliability_score: 0.5,
        match_confidence: 0.5,
        pricing_confidence: 0.5,
        freshness_score: 0.5,
        normalization_confidence: 0.5,
        anomaly_penalty: 0.1,
        override_penalty: 0.1,
        factors: mockFactors,
        ...overrides,
      };
    }

    it("should require review for low_trust offers", () => {
      const lowTrustOffer = createMockOffer({
        trust_score: 0.3,
        trust_band: "low_trust",
      });

      expect(shouldOfferRequireReview(lowTrustOffer)).toBe(true);
    });

    it("should require review for review_sensitive offers", () => {
      const reviewSensitiveOffer = createMockOffer({
        trust_score: 0.5,
        trust_band: "review_sensitive",
      });

      expect(shouldOfferRequireReview(reviewSensitiveOffer)).toBe(true);
    });

    it("should not require review for high_trust offers", () => {
      const highTrustOffer = createMockOffer({
        trust_score: 0.85,
        trust_band: "high_trust",
      });

      expect(shouldOfferRequireReview(highTrustOffer)).toBe(false);
    });

    it("should not require review for medium_trust offers", () => {
      const mediumTrustOffer = createMockOffer({
        trust_score: 0.65,
        trust_band: "medium_trust",
      });

      expect(shouldOfferRequireReview(mediumTrustOffer)).toBe(false);
    });
  });

  describe("Trust Score Edge Cases", () => {
    it("should handle edge case of exactly 0.8 trust (high_trust boundary)", () => {
      const rawPrice = 100;
      const adjustedPrice = calculateTrustAdjustedPrice(rawPrice, 0.8);
      
      // At 0.8 trust: penalty = (0.2)^1.5 ≈ 0.089
      // Adjusted = 100 * (1 + 0.089) ≈ 108.9
      expect(adjustedPrice).toBeGreaterThan(105);
      expect(adjustedPrice).toBeLessThan(115);
    });

    it("should handle edge case of exactly 0.4 trust (review_sensitive boundary)", () => {
      const rawPrice = 100;
      const adjustedPrice = calculateTrustAdjustedPrice(rawPrice, 0.4);
      
      // At 0.4 trust: penalty = (0.6)^1.5 ≈ 0.465
      // Adjusted = 100 * (1 + 0.465) ≈ 146.5
      expect(adjustedPrice).toBeGreaterThan(140);
      expect(adjustedPrice).toBeLessThan(155);
    });
  });
});
