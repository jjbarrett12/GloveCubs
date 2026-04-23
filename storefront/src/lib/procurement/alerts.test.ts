import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseAdmin before importing
vi.mock("../jobs/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// Mock dependencies
vi.mock("./marginOpportunity", () => ({
  getTopMarginOpportunities: vi.fn(),
}));

vi.mock("./supplierReliability", () => ({
  getRiskySuppliers: vi.fn(),
}));

vi.mock("./offerTrust", () => ({
  getLowTrustWinners: vi.fn(),
}));

import { supabaseAdmin } from "../jobs/supabase";
import { getTopMarginOpportunities } from "./marginOpportunity";
import { getRiskySuppliers } from "./supplierReliability";
import { getLowTrustWinners } from "./offerTrust";

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockGetOpportunities = getTopMarginOpportunities as ReturnType<typeof vi.fn>;
const mockGetRiskySuppliers = getRiskySuppliers as ReturnType<typeof vi.fn>;
const mockGetLowTrustWinners = getLowTrustWinners as ReturnType<typeof vi.fn>;

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
    insert: vi.fn().mockResolvedValue({ data: { id: "alert-new" }, error: null }),
  };
  mock.limit.mockResolvedValue({ data, error: null });
  return mock;
}

describe("Procurement Alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOpportunities.mockResolvedValue([]);
    mockGetRiskySuppliers.mockResolvedValue([]);
    mockGetLowTrustWinners.mockResolvedValue([]);
  });

  describe("Alert Deduplication", () => {
    it("should not create duplicate alerts for same entity", async () => {
      const { generateProcurementAlerts } = await import("./alerts");

      mockGetOpportunities.mockResolvedValue([
        {
          product_id: "prod-1",
          opportunity_band: "major",
          estimated_savings_percent: 20,
          estimated_savings_per_case: 10,
          requires_review: false,
          reasoning: "Test",
          opportunity_score: 0.8,
          factors: { best_offer_trust: 0.8 },
        },
      ]);

      let insertCount = 0;

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({
              data: [
                // Already exists an open alert for this product
                { alert_type: "margin_opportunity", entity_type: "product", entity_id: "prod-1", status: "open" },
              ],
              error: null,
            }),
            insert: vi.fn(() => {
              insertCount++;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "new" }, error: null }),
              };
            }),
          };
        }
        if (table === "supplier_offers") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        return createChainableMock([]);
      });

      await generateProcurementAlerts();

      // Should not insert because duplicate exists
      expect(insertCount).toBe(0);
    });

    it("should respect cooldown for recently dismissed alerts", async () => {
      const { generateProcurementAlerts } = await import("./alerts");

      mockGetOpportunities.mockResolvedValue([
        {
          product_id: "prod-2",
          opportunity_band: "major",
          estimated_savings_percent: 25,
          estimated_savings_per_case: 15,
          requires_review: false,
          reasoning: "Test",
          opportunity_score: 0.9,
          factors: { best_offer_trust: 0.85 },
        },
      ]);

      // Dismissed 24 hours ago (within 72-hour cooldown)
      const recentDismissal = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let insertCount = 0;

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({
              data: [
                // Recently dismissed alert for this product
                { 
                  alert_type: "margin_opportunity", 
                  entity_type: "product", 
                  entity_id: "prod-2", 
                  status: "dismissed",
                  resolved_at: recentDismissal,
                },
              ],
              error: null,
            }),
            insert: vi.fn(() => {
              insertCount++;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "new" }, error: null }),
              };
            }),
          };
        }
        if (table === "supplier_offers") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        return createChainableMock([]);
      });

      await generateProcurementAlerts();

      // Should not insert due to cooldown
      expect(insertCount).toBe(0);
    });

    it("should allow alert creation after cooldown expires", async () => {
      const { generateProcurementAlerts } = await import("./alerts");

      mockGetOpportunities.mockResolvedValue([
        {
          product_id: "prod-3",
          opportunity_band: "major",
          estimated_savings_percent: 30,
          estimated_savings_per_case: 20,
          requires_review: false,
          reasoning: "Test",
          opportunity_score: 0.9,
          factors: { best_offer_trust: 0.9 },
        },
      ]);

      // Dismissed 4 days ago (outside 72-hour cooldown)
      const oldDismissal = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();

      let insertCount = 0;

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({
              data: [
                // Old dismissed alert (outside cooldown)
                { 
                  alert_type: "margin_opportunity", 
                  entity_type: "product", 
                  entity_id: "prod-3", 
                  status: "dismissed",
                  resolved_at: oldDismissal,
                },
              ],
              error: null,
            }),
            insert: vi.fn(() => {
              insertCount++;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "new" }, error: null }),
              };
            }),
          };
        }
        if (table === "supplier_offers") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        return createChainableMock([]);
      });

      await generateProcurementAlerts();

      // Should insert - cooldown expired
      expect(insertCount).toBe(1);
    });
  });

  describe("Alert Severity Assignment", () => {
    it("should assign critical severity only for very high savings (25%+) with trusted offers", async () => {
      const { generateProcurementAlerts } = await import("./alerts");

      mockGetOpportunities.mockResolvedValue([
        {
          product_id: "prod-critical",
          opportunity_band: "major",
          estimated_savings_percent: 28,
          estimated_savings_per_case: 25,
          requires_review: false, // Trusted offer
          reasoning: "Test",
          opportunity_score: 0.95,
          factors: { best_offer_trust: 0.9 },
        },
      ]);

      let persistedSeverity: string | null = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn((data) => {
              persistedSeverity = data.severity;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "new" }, error: null }),
              };
            }),
          };
        }
        if (table === "supplier_offers") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        return createChainableMock([]);
      });

      await generateProcurementAlerts();

      expect(persistedSeverity).toBe("critical");
    });

    it("should assign high severity for 18-25% savings", async () => {
      const { generateProcurementAlerts } = await import("./alerts");

      mockGetOpportunities.mockResolvedValue([
        {
          product_id: "prod-high",
          opportunity_band: "major",
          estimated_savings_percent: 20,
          estimated_savings_per_case: 15,
          requires_review: false,
          reasoning: "Test",
          opportunity_score: 0.85,
          factors: { best_offer_trust: 0.85 },
        },
      ]);

      let persistedSeverity: string | null = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn((data) => {
              persistedSeverity = data.severity;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "new" }, error: null }),
              };
            }),
          };
        }
        if (table === "supplier_offers") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        return createChainableMock([]);
      });

      await generateProcurementAlerts();

      expect(persistedSeverity).toBe("high");
    });

    it("should assign low severity to stale offer alerts under 90 days", async () => {
      const { generateProcurementAlerts } = await import("./alerts");

      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn((data) => {
              if (data.alert_type === "stale_offer") {
                // Stale offers under 90 days should be low severity
                expect(data.severity).toBe("low");
              }
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "new" }, error: null }),
              };
            }),
          };
        }
        if (table === "supplier_offers") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                { id: "offer-stale", supplier_id: "sup-1", product_id: "prod-1", updated_at: sixtyDaysAgo, is_best_price: false },
              ],
              error: null,
            }),
          };
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        return createChainableMock([]);
      });

      await generateProcurementAlerts();
    });
  });

  describe("Alert Spam Prevention", () => {
    it("should limit margin opportunity alerts to MAX_ALERTS_PER_TYPE", async () => {
      const { generateProcurementAlerts } = await import("./alerts");

      // Generate 10 opportunities
      const opportunities = Array(10).fill(null).map((_, i) => ({
        product_id: `prod-${i}`,
        opportunity_band: "major",
        estimated_savings_percent: 15 + i,
        estimated_savings_per_case: 10,
        requires_review: false,
        reasoning: "Test",
        opportunity_score: 0.8,
        factors: { best_offer_trust: 0.8 },
      }));

      mockGetOpportunities.mockResolvedValue(opportunities);

      let insertCount = 0;

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn(() => {
              insertCount++;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "new" }, error: null }),
              };
            }),
          };
        }
        if (table === "supplier_offers") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        return createChainableMock([]);
      });

      const result = await generateProcurementAlerts();

      // Should be capped at 5 (MAX_ALERTS_PER_TYPE)
      expect(result.by_type.margin_opportunity).toBeLessThanOrEqual(5);
    });

    it("should skip low-trust opportunities from alert generation", async () => {
      const { generateProcurementAlerts } = await import("./alerts");

      mockGetOpportunities.mockResolvedValue([
        {
          product_id: "prod-low-trust",
          opportunity_band: "major",
          estimated_savings_percent: 30,
          estimated_savings_per_case: 25,
          requires_review: true,
          reasoning: "Test",
          opportunity_score: 0.7,
          factors: { best_offer_trust: 0.3 }, // Low trust
        },
      ]);

      let insertCount = 0;

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn(() => {
              insertCount++;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "new" }, error: null }),
              };
            }),
          };
        }
        if (table === "supplier_offers") {
          return createChainableMock([]);
        }
        if (table === "ai_pricing_analysis") {
          return createChainableMock([]);
        }
        if (table === "review_queue") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        return createChainableMock([]);
      });

      await generateProcurementAlerts();

      // Should not create alert for low-trust opportunity
      expect(insertCount).toBe(0);
    });
  });
});
