import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseAdmin before importing the module
vi.mock("../jobs/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "../jobs/supabase";

// Import after mocking
const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

// Helper to create chainable mock
function createChainableMock(data: unknown, count?: number) {
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
  // For non-single queries
  mock.limit.mockResolvedValue({ data, error: null, count });
  return mock;
}

describe("Supplier Reliability Scoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Sample Size Validation", () => {
    it("should apply confidence discount for suppliers with small sample sizes", async () => {
      // Import dynamically to get fresh module with mocks
      const { calculateSupplierReliabilityScore } = await import("./supplierReliability");

      // Mock supplier with only 5 products (below MIN_SAMPLE_SIZE_FOR_SCORING = 20)
      const smallSampleProducts = Array(5).fill({
        material: "nitrile",
        size: "M",
        units_per_box: 100,
        supplier_sku: "SKU-1",
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_products") {
          const mock = createChainableMock(smallSampleProducts, 5);
          return mock;
        }
        if (table === "supplier_offers") {
          return createChainableMock([
            { updated_at: new Date().toISOString() },
          ]);
        }
        if (table === "ai_extraction_results") {
          return createChainableMock([]);
        }
        if (table === "price_history") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "ai_feedback") {
          return createChainableMock([]);
        }
        if (table === "job_runs") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_reliability_scores") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const result = await calculateSupplierReliabilityScore("supplier-small");

      // With sample size 5 (25% of minimum 20), score should be pulled toward 0.5
      // Score = 0.5 + (raw_score - 0.5) * (5/20)
      expect(result.sample_size).toBe(5);
      // The score should be closer to 0.5 due to confidence discount
      expect(result.reliability_score).toBeGreaterThanOrEqual(0.4);
      expect(result.reliability_score).toBeLessThanOrEqual(0.65);
    });

    it("should not allow 'trusted' band for suppliers below MIN_SAMPLE_SIZE_FOR_TRUSTED", async () => {
      const { calculateSupplierReliabilityScore } = await import("./supplierReliability");

      // Mock supplier with 30 products (above 20 min, but below 50 for trusted)
      const mediumSampleProducts = Array(30).fill({
        material: "nitrile",
        size: "M",
        units_per_box: 100,
        supplier_sku: "SKU-1",
      });

      // Mock perfect data that would normally result in "trusted"
      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_products") {
          const mock = createChainableMock(mediumSampleProducts, 30);
          return mock;
        }
        if (table === "supplier_offers") {
          // Very fresh offers
          return createChainableMock([
            { updated_at: new Date().toISOString() },
            { updated_at: new Date().toISOString() },
          ]);
        }
        if (table === "ai_extraction_results") {
          // High confidence extractions
          return createChainableMock([
            { overall_confidence: 0.95, human_feedback: "confirmed" },
            { overall_confidence: 0.92, human_feedback: "confirmed" },
          ]);
        }
        if (table === "price_history") {
          // Stable prices
          return createChainableMock([
            { price: 100, recorded_at: new Date().toISOString() },
            { price: 100, recorded_at: new Date().toISOString() },
          ]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "ai_feedback") {
          return createChainableMock([]);
        }
        if (table === "job_runs") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_reliability_scores") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const result = await calculateSupplierReliabilityScore("supplier-medium");

      // Even with excellent metrics, cannot be "trusted" without 50+ samples
      expect(result.sample_size).toBe(30);
      expect(result.reliability_band).not.toBe("trusted");
      expect(["stable", "watch"]).toContain(result.reliability_band);
    });
  });

  describe("Stale Data Penalty", () => {
    it("should heavily penalize suppliers with stale pricing data (30+ days)", async () => {
      const { calculateSupplierReliabilityScore } = await import("./supplierReliability");

      const thirtyDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_products") {
          return createChainableMock(
            Array(50).fill({ material: "nitrile", size: "M", units_per_box: 100, supplier_sku: "SKU" }),
            50
          );
        }
        if (table === "supplier_offers") {
          // All offers are stale (35 days old)
          return createChainableMock([
            { updated_at: thirtyDaysAgo.toISOString() },
            { updated_at: thirtyDaysAgo.toISOString() },
          ]);
        }
        if (table === "ai_extraction_results") {
          return createChainableMock([
            { overall_confidence: 0.9, human_feedback: "confirmed" },
          ]);
        }
        if (table === "price_history") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "ai_feedback") {
          return createChainableMock([]);
        }
        if (table === "job_runs") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_reliability_scores") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const result = await calculateSupplierReliabilityScore("supplier-stale");

      // Freshness should be very low (0.05 for 30+ day old data)
      expect(result.freshness_score).toBeLessThanOrEqual(0.1);
      // Overall reliability should be impacted
      expect(result.reliability_score).toBeLessThan(0.7);
    });

    it("should give high freshness score for recently updated offers", async () => {
      const { calculateSupplierReliabilityScore } = await import("./supplierReliability");

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_products") {
          return createChainableMock(
            Array(50).fill({ material: "nitrile", size: "M", units_per_box: 100, supplier_sku: "SKU" }),
            50
          );
        }
        if (table === "supplier_offers") {
          // Fresh offers (today)
          return createChainableMock([
            { updated_at: new Date().toISOString() },
            { updated_at: new Date().toISOString() },
          ]);
        }
        if (table === "ai_extraction_results") {
          return createChainableMock([]);
        }
        if (table === "price_history") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "ai_feedback") {
          return createChainableMock([]);
        }
        if (table === "job_runs") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_reliability_scores") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const result = await calculateSupplierReliabilityScore("supplier-fresh");

      expect(result.freshness_score).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe("Correction Penalty", () => {
    it("should heavily penalize suppliers with high correction rates", async () => {
      const { calculateSupplierReliabilityScore } = await import("./supplierReliability");

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_products") {
          return createChainableMock(
            Array(50).fill({ material: "nitrile", size: "M", units_per_box: 100, supplier_sku: "SKU" }),
            50
          );
        }
        if (table === "supplier_offers") {
          return createChainableMock([{ updated_at: new Date().toISOString() }]);
        }
        if (table === "ai_extraction_results") {
          // High rejection rate
          return createChainableMock([
            { overall_confidence: 0.5, human_feedback: "rejected" },
            { overall_confidence: 0.5, human_feedback: "rejected" },
            { overall_confidence: 0.6, human_feedback: "corrected" },
            { overall_confidence: 0.7, human_feedback: "confirmed" },
          ]);
        }
        if (table === "price_history") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "ai_feedback") {
          // Many overrides
          return createChainableMock([
            { was_correct: false },
            { was_correct: false },
            { was_correct: true },
          ]);
        }
        if (table === "job_runs") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          // High rejection rate
          return createChainableMock([
            { status: "rejected" },
            { status: "rejected" },
            { status: "approved" },
          ]);
        }
        if (table === "supplier_reliability_scores") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const result = await calculateSupplierReliabilityScore("supplier-corrections");

      // High correction rate should significantly impact score
      expect(result.factors.correction_rate).toBeGreaterThan(0.3);
      expect(result.reliability_score).toBeLessThan(0.6);
    });
  });
});
