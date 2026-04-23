import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseAdmin before importing
vi.mock("../jobs/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// Mock dependencies
vi.mock("./supplierReliability", () => ({
  getSupplierReliability: vi.fn(),
}));

vi.mock("./offerTrust", () => ({
  calculateOfferTrustScore: vi.fn(),
}));

import { supabaseAdmin } from "../jobs/supabase";
import { getSupplierReliability } from "./supplierReliability";
import { calculateOfferTrustScore } from "./offerTrust";

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockGetReliability = getSupplierReliability as ReturnType<typeof vi.fn>;
const mockCalculateTrust = calculateOfferTrustScore as ReturnType<typeof vi.fn>;

function createChainableMock(data: unknown) {
  const mock = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  mock.limit.mockResolvedValue({ data, error: null });
  return mock;
}

describe("Supplier Recommendation Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Low-Trust Offer Suppression", () => {
    it("should demote low-trust offers even if cheapest", async () => {
      const { rankSuppliersForProduct } = await import("./supplierRecommendation");

      const offers = [
        { id: "cheap-low-trust", supplier_id: "sup-cheap", price: 70, lead_time_days: 3, updated_at: new Date().toISOString() },
        { id: "expensive-high-trust", supplier_id: "sup-trusted", price: 100, lead_time_days: 3, updated_at: new Date().toISOString() },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      mockGetReliability.mockImplementation((supplierId: string) => {
        if (supplierId === "sup-cheap") {
          return Promise.resolve({ reliability_score: 0.4, reliability_band: "watch" });
        }
        return Promise.resolve({ reliability_score: 0.85, reliability_band: "trusted" });
      });

      mockCalculateTrust.mockImplementation((offerId: string) => {
        if (offerId === "cheap-low-trust") {
          return Promise.resolve({
            offer_id: offerId,
            trust_score: 0.35,
            trust_band: "low_trust",
            anomaly_penalty: 0.2,
            override_penalty: 0.1,
          });
        }
        return Promise.resolve({
          offer_id: offerId,
          trust_score: 0.85,
          trust_band: "high_trust",
          anomaly_penalty: 0,
          override_penalty: 0,
        });
      });

      const results = await rankSuppliersForProduct("product-1");

      // High-trust expensive offer should be rank 1
      expect(results[0].offer_id).toBe("expensive-high-trust");
      expect(results[0].recommended_rank).toBe(1);

      // Low-trust cheap offer should be rank 2
      expect(results[1].offer_id).toBe("cheap-low-trust");
      expect(results[1].recommended_rank).toBe(2);
    });

    it("should require 25%+ price advantage for low-trust to win", async () => {
      const { rankSuppliersForProduct } = await import("./supplierRecommendation");

      const offers = [
        // 20% cheaper - should NOT win (below 25% threshold)
        { id: "cheap-20pct", supplier_id: "sup-cheap", price: 80, lead_time_days: 3, updated_at: new Date().toISOString() },
        { id: "trusted", supplier_id: "sup-trusted", price: 100, lead_time_days: 3, updated_at: new Date().toISOString() },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      mockGetReliability.mockResolvedValue({ reliability_score: 0.7, reliability_band: "stable" });

      mockCalculateTrust.mockImplementation((offerId: string) => {
        if (offerId === "cheap-20pct") {
          return Promise.resolve({
            offer_id: offerId,
            trust_score: 0.45,
            trust_band: "review_sensitive",
            anomaly_penalty: 0.1,
            override_penalty: 0.05,
          });
        }
        return Promise.resolve({
          offer_id: offerId,
          trust_score: 0.85,
          trust_band: "high_trust",
          anomaly_penalty: 0,
          override_penalty: 0,
        });
      });

      const results = await rankSuppliersForProduct("product-2");

      // Trusted offer should win despite 20% higher price
      expect(results[0].offer_id).toBe("trusted");
      expect(results[0].why_not_first).toBeNull();
      expect(results[1].why_not_first).toContain("Demoted");
    });

    it("should allow low-trust to win with 30%+ price advantage", async () => {
      const { rankSuppliersForProduct } = await import("./supplierRecommendation");

      const offers = [
        // 30% cheaper - should win (above 25% threshold)
        { id: "cheap-30pct", supplier_id: "sup-cheap", price: 70, lead_time_days: 3, updated_at: new Date().toISOString() },
        { id: "trusted", supplier_id: "sup-trusted", price: 100, lead_time_days: 3, updated_at: new Date().toISOString() },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      mockGetReliability.mockResolvedValue({ reliability_score: 0.7, reliability_band: "stable" });

      mockCalculateTrust.mockImplementation((offerId: string) => {
        if (offerId === "cheap-30pct") {
          return Promise.resolve({
            offer_id: offerId,
            trust_score: 0.5,
            trust_band: "review_sensitive",
            anomaly_penalty: 0.1,
            override_penalty: 0.05,
          });
        }
        return Promise.resolve({
          offer_id: offerId,
          trust_score: 0.85,
          trust_band: "high_trust",
          anomaly_penalty: 0,
          override_penalty: 0,
        });
      });

      const results = await rankSuppliersForProduct("product-3");

      // Cheap offer should win due to material price advantage
      // Note: this depends on whether it's truly low_trust vs review_sensitive
      // For review_sensitive with 30% advantage, should be allowed
      expect(results[0].review_required).toBe(true);
    });
  });

  describe("Recommendation Reasoning Persistence", () => {
    it("should include reasoning in persisted recommendations", async () => {
      const { rankSuppliersForProduct } = await import("./supplierRecommendation");

      const offers = [
        { id: "offer-1", supplier_id: "sup-1", price: 100, lead_time_days: 3, updated_at: new Date().toISOString() },
      ];

      let persistedData: any = null;
      
      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "supplier_recommendations") {
          return {
            insert: vi.fn((data) => {
              persistedData = data;
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        return createChainableMock([]);
      });

      mockGetReliability.mockResolvedValue({ reliability_score: 0.8, reliability_band: "stable" });
      mockCalculateTrust.mockResolvedValue({
        offer_id: "offer-1",
        trust_score: 0.75,
        trust_band: "medium_trust",
        anomaly_penalty: 0,
        override_penalty: 0,
      });

      await rankSuppliersForProduct("product-4");

      // Check that reasoning was persisted
      expect(persistedData).not.toBeNull();
      expect(persistedData.recommendation_reasoning).toBeDefined();
      expect(typeof persistedData.recommendation_reasoning).toBe("string");
      expect(persistedData.recommendation_reasoning.length).toBeGreaterThan(0);
    });
  });

  describe("Review Required Flag", () => {
    it("should set review_required for low-trust suppliers", async () => {
      const { rankSuppliersForProduct } = await import("./supplierRecommendation");

      const offers = [
        { id: "offer-risky", supplier_id: "sup-risky", price: 80, lead_time_days: 2, updated_at: new Date().toISOString() },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      mockGetReliability.mockResolvedValue({ reliability_score: 0.4, reliability_band: "risky" });
      mockCalculateTrust.mockResolvedValue({
        offer_id: "offer-risky",
        trust_score: 0.4,
        trust_band: "review_sensitive",
        anomaly_penalty: 0.2,
        override_penalty: 0.1,
      });

      const results = await rankSuppliersForProduct("product-5");

      expect(results[0].review_required).toBe(true);
    });

    it("should not set review_required for high-trust suppliers", async () => {
      const { rankSuppliersForProduct } = await import("./supplierRecommendation");

      const offers = [
        { id: "offer-trusted", supplier_id: "sup-trusted", price: 100, lead_time_days: 2, updated_at: new Date().toISOString() },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      mockGetReliability.mockResolvedValue({ reliability_score: 0.9, reliability_band: "trusted" });
      mockCalculateTrust.mockResolvedValue({
        offer_id: "offer-trusted",
        trust_score: 0.9,
        trust_band: "high_trust",
        anomaly_penalty: 0,
        override_penalty: 0,
      });

      const results = await rankSuppliersForProduct("product-6");

      expect(results[0].review_required).toBe(false);
    });
  });

  describe("Recommendation Band Assignment", () => {
    it("should never assign strong_recommendation to low_trust offers", async () => {
      const { rankSuppliersForProduct } = await import("./supplierRecommendation");

      const offers = [
        { id: "offer-low", supplier_id: "sup-low", price: 50, lead_time_days: 1, updated_at: new Date().toISOString() },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      mockGetReliability.mockResolvedValue({ reliability_score: 0.5, reliability_band: "watch" });
      mockCalculateTrust.mockResolvedValue({
        offer_id: "offer-low",
        trust_score: 0.3,
        trust_band: "low_trust",
        anomaly_penalty: 0.3,
        override_penalty: 0.1,
      });

      const results = await rankSuppliersForProduct("product-7");

      // Low trust = do_not_prefer regardless of other factors
      expect(results[0].recommendation_band).toBe("do_not_prefer");
      expect(results[0].recommendation_band).not.toBe("strong_recommendation");
    });

    it("should cap risky suppliers at caution band", async () => {
      const { rankSuppliersForProduct } = await import("./supplierRecommendation");

      const offers = [
        { id: "offer-risky-sup", supplier_id: "sup-risky", price: 60, lead_time_days: 1, updated_at: new Date().toISOString() },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      // Medium trust offer but risky supplier
      mockGetReliability.mockResolvedValue({ reliability_score: 0.35, reliability_band: "risky" });
      mockCalculateTrust.mockResolvedValue({
        offer_id: "offer-risky-sup",
        trust_score: 0.65,
        trust_band: "medium_trust",
        anomaly_penalty: 0.1,
        override_penalty: 0.05,
      });

      const results = await rankSuppliersForProduct("product-8");

      // Risky supplier = caution at best
      expect(["caution", "do_not_prefer"]).toContain(results[0].recommendation_band);
    });
  });
});
