import { describe, it, expect, vi, beforeEach } from "vitest";

const sbMocks = vi.hoisted(() => {
  const from = vi.fn();
  const client = { from };
  return { from, client };
});

vi.mock("../jobs/supabase", () => ({
  supabaseAdmin: sbMocks.client,
  getSupabaseCatalogos: vi.fn(() => sbMocks.client),
}));

// Mock offerTrust
vi.mock("./offerTrust", () => ({
  calculateOfferTrustScore: vi.fn(),
  calculateTrustAdjustedPrice: vi.fn((price, trust) => price * (1 + Math.pow(1 - trust, 1.5))),
}));

import { supabaseAdmin } from "../jobs/supabase";
import { calculateOfferTrustScore } from "./offerTrust";

const mockFrom = sbMocks.from as ReturnType<typeof vi.fn>;
const mockCalculateTrust = calculateOfferTrustScore as ReturnType<typeof vi.fn>;

function createChainableMock(data: unknown) {
  const result = { data, error: null };
  const mock: Record<string, unknown> & {
    then: typeof Promise.prototype.then;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
    then: ((onFulfilled?: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled as never, onRejected)) as typeof Promise.prototype.then,
  };
  for (const k of ["select", "eq", "gte", "lt", "in", "or", "order", "limit"]) {
    (mock[k] as ReturnType<typeof vi.fn>).mockImplementation(() => mock);
  }
  (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (mock.insert as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
  return mock;
}

describe("Margin Opportunity Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Pack Size Validation", () => {
    it("should block opportunity when pack sizes are inconsistent", async () => {
      const { calculateMarginOpportunity } = await import("./marginOpportunity");

      // Offers with wildly different pack sizes
      const offers = [
        { id: "offer-1", supplier_id: "sup-1", price: 50, units_per_case: 100, updated_at: new Date().toISOString(), is_active: true },
        { id: "offer-2", supplier_id: "sup-2", price: 45, units_per_case: 1000, updated_at: new Date().toISOString(), is_active: true },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "ai_feedback") {
          return createChainableMock([]);
        }
        if (table === "products") {
          return createChainableMock({ categories: { slug: "exam_gloves" } });
        }
        if (table === "margin_opportunities") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      // Both offers have high trust
      mockCalculateTrust.mockImplementation((offerId: string) => Promise.resolve({
        offer_id: offerId,
        trust_score: 0.8,
        trust_band: "high_trust",
        factors: {},
      }));

      const result = await calculateMarginOpportunity("product-1");

      // Incompatible pack sizes: filtered set has <2 offers → no-opportunity path (before factor collection)
      expect(result.opportunity_band).toBe("none");
      expect(result.reasoning).toMatch(/Pack size mismatch/i);
    });

    it("should allow opportunity when pack sizes are within 20% variance", async () => {
      const { calculateMarginOpportunity } = await import("./marginOpportunity");

      // Offers with similar pack sizes (within 20%)
      const offers = [
        { id: "offer-1", supplier_id: "sup-1", price: 100, units_per_case: 1000, updated_at: new Date().toISOString(), is_active: true },
        { id: "offer-2", supplier_id: "sup-2", price: 80, units_per_case: 1100, updated_at: new Date().toISOString(), is_active: true },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "ai_feedback") {
          return createChainableMock([]);
        }
        if (table === "products") {
          return createChainableMock({ categories: { slug: "exam_gloves" } });
        }
        if (table === "margin_opportunities") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      mockCalculateTrust.mockImplementation((offerId: string) => Promise.resolve({
        offer_id: offerId,
        trust_score: 0.8,
        trust_band: "high_trust",
        factors: {},
      }));

      const result = await calculateMarginOpportunity("product-2");

      // Pack sizes within variance - should calculate opportunity
      expect(result.factors.pack_normalization_risk).toBe(false);
      expect(result.opportunity_band).not.toBe("none");
    });
  });

  describe("Suspicious Cheap Offer Filtering", () => {
    it("should exclude low-trust offers from opportunity calculation", async () => {
      const { calculateMarginOpportunity } = await import("./marginOpportunity");

      const offers = [
        { id: "offer-high", supplier_id: "sup-1", price: 100, units_per_case: 1000, updated_at: new Date().toISOString(), is_active: true },
        { id: "offer-low-trust", supplier_id: "sup-2", price: 50, units_per_case: 1000, updated_at: new Date().toISOString(), is_active: true },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "ai_feedback") {
          return createChainableMock([]);
        }
        if (table === "products") {
          return createChainableMock({ categories: { slug: "exam_gloves" } });
        }
        if (table === "margin_opportunities") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      // One high-trust, one very low-trust offer
      mockCalculateTrust.mockImplementation((offerId: string) => {
        if (offerId === "offer-low-trust") {
          return Promise.resolve({
            offer_id: offerId,
            trust_score: 0.2, // Below MIN_TRUST_FOR_COMPARISON (0.3)
            trust_band: "low_trust",
            factors: {},
          });
        }
        return Promise.resolve({
          offer_id: offerId,
          trust_score: 0.8,
          trust_band: "high_trust",
          factors: {},
        });
      });

      const result = await calculateMarginOpportunity("product-3");

      // The low-trust "cheap" offer should be excluded
      // Only the high-trust offer should be considered
      // This means no real savings opportunity
      expect(result.best_offer_id).toBe("offer-high");
    });

    it("should not show fake savings from suspicious offers", async () => {
      const { calculateMarginOpportunity } = await import("./marginOpportunity");

      const offers = [
        { id: "offer-trusted", supplier_id: "sup-1", price: 100, units_per_case: 1000, updated_at: new Date().toISOString(), is_active: true },
        { id: "offer-suspicious", supplier_id: "sup-2", price: 30, units_per_case: 1000, updated_at: new Date().toISOString(), is_active: true },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "ai_pricing_analysis") {
          // The cheap offer has anomaly history
          return createChainableMock([
            { is_suspicious: true, canonical_product_id: "product-4" },
            { is_suspicious: true, canonical_product_id: "product-4" },
          ]);
        }
        if (table === "ai_feedback") {
          return createChainableMock([]);
        }
        if (table === "products") {
          return createChainableMock({ categories: { slug: "exam_gloves" } });
        }
        if (table === "margin_opportunities") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      mockCalculateTrust.mockImplementation((offerId: string) => {
        if (offerId === "offer-suspicious") {
          return Promise.resolve({
            offer_id: offerId,
            trust_score: 0.25, // Very low trust due to anomalies
            trust_band: "low_trust",
            factors: {},
          });
        }
        return Promise.resolve({
          offer_id: offerId,
          trust_score: 0.85,
          trust_band: "high_trust",
          factors: {},
        });
      });

      const result = await calculateMarginOpportunity("product-4");

      // Should not report 70% savings from suspicious offer
      if (result.estimated_savings_percent != null) {
        // If savings are reported, they should be reasonable
        expect(result.estimated_savings_percent).toBeLessThan(50);
      }
      // And it should require review or flag anomaly
      expect(result.requires_review || result.factors.anomaly_pattern_detected).toBe(true);
    });
  });

  describe("Opportunity Scoring", () => {
    it("should flag requires_review when best offer has low trust", async () => {
      const { calculateMarginOpportunity } = await import("./marginOpportunity");

      const offers = [
        { id: "offer-review-needed", supplier_id: "sup-1", price: 80, units_per_case: 1000, updated_at: new Date().toISOString(), is_active: true },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_offers") {
          return createChainableMock(offers);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "ai_feedback") {
          return createChainableMock([]);
        }
        if (table === "products") {
          return createChainableMock({ categories: { slug: "exam_gloves" } });
        }
        if (table === "margin_opportunities") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      mockCalculateTrust.mockResolvedValue({
        offer_id: "offer-review-needed",
        trust_score: 0.45,
        trust_band: "review_sensitive",
        factors: {},
      });

      const result = await calculateMarginOpportunity("product-5");

      expect(result.requires_review).toBe(true);
    });
  });
});
