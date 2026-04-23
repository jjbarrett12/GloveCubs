import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseAdmin before importing
vi.mock("../jobs/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "../jobs/supabase";

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

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

describe("Procurement Metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Sample Size Validation", () => {
    it("should flag metrics as unreliable when sample size is below minimum", async () => {
      const { collectProcurementMetrics } = await import("./metrics");

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_reliability_leaderboard") {
          // Only 5 suppliers (below MIN_SAMPLE_SIZE_FOR_METRICS = 20)
          return createChainableMock([
            { reliability_score: 0.8, reliability_band: "stable", sample_size: 10 },
            { reliability_score: 0.7, reliability_band: "stable", sample_size: 15 },
            { reliability_score: 0.6, reliability_band: "watch", sample_size: 8 },
            { reliability_score: 0.9, reliability_band: "trusted", sample_size: 5 },
            { reliability_score: 0.5, reliability_band: "watch", sample_size: 3 },
          ]);
        }
        if (table === "offer_trust_scores") {
          return createChainableMock([]);
        }
        if (table === "margin_opportunities") {
          return createChainableMock([]);
        }
        if (table === "procurement_alerts") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        if (table === "procurement_intelligence_metrics") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const metrics = await collectProcurementMetrics();

      const reliabilityMetric = metrics.find(m => m.metric_type === "avg_supplier_reliability");
      expect(reliabilityMetric).toBeDefined();
      expect(reliabilityMetric?.metadata?.is_reliable).toBe(false);
    });

    it("should mark reliability accuracy as measuring validated suppliers", async () => {
      const { collectProcurementMetrics } = await import("./metrics");

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_reliability_leaderboard") {
          // Mix of validated and non-validated suppliers
          return createChainableMock([
            { reliability_score: 0.85, reliability_band: "trusted", sample_size: 100 },
            { reliability_score: 0.8, reliability_band: "stable", sample_size: 50 },
            { reliability_score: 0.7, reliability_band: "stable", sample_size: 10 }, // Below threshold
            { reliability_score: 0.6, reliability_band: "watch", sample_size: 5 },   // Below threshold
          ]);
        }
        if (table === "offer_trust_scores") {
          return createChainableMock([]);
        }
        if (table === "margin_opportunities") {
          return createChainableMock([]);
        }
        if (table === "procurement_alerts") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        if (table === "procurement_intelligence_metrics") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const metrics = await collectProcurementMetrics();

      const accuracyMetric = metrics.find(m => m.metric_type === "supplier_reliability_accuracy");
      expect(accuracyMetric).toBeDefined();
      // Should indicate this measures validated suppliers
      expect(accuracyMetric?.metadata?.note).toContain("sufficient data");
      // 2 out of 4 have sufficient sample size
      expect(accuracyMetric?.metadata?.validated_count).toBe(2);
    });
  });

  describe("Recommendation Acceptance Rate", () => {
    it("should use actual acceptance data when available", async () => {
      const { collectProcurementMetrics } = await import("./metrics");

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_recommendations") {
          // Sufficient acceptance tracking data
          return createChainableMock([
            { recommendation_band: "strong_recommendation", recommended_rank: 1, was_accepted: true },
            { recommendation_band: "strong_recommendation", recommended_rank: 1, was_accepted: true },
            { recommendation_band: "acceptable", recommended_rank: 1, was_accepted: false },
            { recommendation_band: "strong_recommendation", recommended_rank: 1, was_accepted: true },
            { recommendation_band: "acceptable", recommended_rank: 1, was_accepted: true },
            { recommendation_band: "strong_recommendation", recommended_rank: 1, was_accepted: false },
            { recommendation_band: "caution", recommended_rank: 1, was_accepted: false },
            { recommendation_band: "strong_recommendation", recommended_rank: 1, was_accepted: true },
            { recommendation_band: "acceptable", recommended_rank: 1, was_accepted: true },
            { recommendation_band: "strong_recommendation", recommended_rank: 1, was_accepted: true },
          ]);
        }
        if (table === "supplier_reliability_leaderboard") {
          return createChainableMock([]);
        }
        if (table === "offer_trust_scores") {
          return createChainableMock([]);
        }
        if (table === "margin_opportunities") {
          return createChainableMock([]);
        }
        if (table === "procurement_alerts") {
          return createChainableMock([]);
        }
        if (table === "procurement_intelligence_metrics") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const metrics = await collectProcurementMetrics();

      const acceptanceMetric = metrics.find(m => m.metric_type === "recommendation_acceptance_rate");
      expect(acceptanceMetric).toBeDefined();
      expect(acceptanceMetric?.metadata?.is_actual_rate).toBe(true);
      // 6 accepted out of 10
      expect(acceptanceMetric?.metric_value).toBeCloseTo(0.6, 1);
    });

    it("should mark as proxy metric when insufficient feedback data", async () => {
      const { collectProcurementMetrics } = await import("./metrics");

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_recommendations") {
          // Not enough acceptance tracking data
          return createChainableMock([
            { recommendation_band: "strong_recommendation", recommended_rank: 1, was_accepted: null },
            { recommendation_band: "strong_recommendation", recommended_rank: 1, was_accepted: null },
            { recommendation_band: "acceptable", recommended_rank: 1, was_accepted: true },
            { recommendation_band: "strong_recommendation", recommended_rank: 1, was_accepted: null },
          ]);
        }
        if (table === "supplier_reliability_leaderboard") {
          return createChainableMock([]);
        }
        if (table === "offer_trust_scores") {
          return createChainableMock([]);
        }
        if (table === "margin_opportunities") {
          return createChainableMock([]);
        }
        if (table === "procurement_alerts") {
          return createChainableMock([]);
        }
        if (table === "procurement_intelligence_metrics") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const metrics = await collectProcurementMetrics();

      const acceptanceMetric = metrics.find(m => m.metric_type === "recommendation_acceptance_rate");
      expect(acceptanceMetric).toBeDefined();
      expect(acceptanceMetric?.metadata?.is_actual_rate).toBe(false);
      expect(acceptanceMetric?.metadata?.note).toContain("PROXY METRIC");
    });
  });

  describe("Alert Precision Calculation", () => {
    it("should use historical data for precision calculation", async () => {
      const { collectProcurementMetrics } = await import("./metrics");

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          const mock = createChainableMock([]);
          // First call: recent alerts
          mock.gte.mockImplementation((field: string) => {
            if (field === "created_at") {
              mock.limit.mockResolvedValueOnce({
                data: [
                  { severity: "high", status: "open" },
                  { severity: "critical", status: "open" },
                ],
                error: null,
              });
            }
            return mock;
          });
          // Second call: historical alerts
          mock.in.mockImplementation(() => {
            mock.limit.mockResolvedValueOnce({
              data: [
                { severity: "high", status: "resolved", resolved_at: new Date().toISOString() },
                { severity: "high", status: "resolved", resolved_at: new Date().toISOString() },
                { severity: "normal", status: "resolved", resolved_at: new Date().toISOString() },
                { severity: "high", status: "dismissed", resolved_at: new Date().toISOString() },
                { severity: "normal", status: "dismissed", resolved_at: new Date().toISOString() },
                { severity: "high", status: "resolved", resolved_at: new Date().toISOString() },
                { severity: "normal", status: "resolved", resolved_at: new Date().toISOString() },
                { severity: "high", status: "resolved", resolved_at: new Date().toISOString() },
                { severity: "normal", status: "dismissed", resolved_at: new Date().toISOString() },
                { severity: "high", status: "resolved", resolved_at: new Date().toISOString() },
              ],
              error: null,
            });
            return mock;
          });
          return mock;
        }
        if (table === "supplier_reliability_leaderboard") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        if (table === "offer_trust_scores") {
          return createChainableMock([]);
        }
        if (table === "margin_opportunities") {
          return createChainableMock([]);
        }
        if (table === "procurement_intelligence_metrics") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const metrics = await collectProcurementMetrics();

      const precisionMetric = metrics.find(m => m.metric_type === "alert_precision");
      expect(precisionMetric).toBeDefined();
      // Should use 30-day window
      expect(precisionMetric?.metadata?.window_days).toBe(30);
      expect(precisionMetric?.metadata?.is_reliable).toBe(true);
    });

    it("should mark precision as unreliable with insufficient historical data", async () => {
      const { collectProcurementMetrics } = await import("./metrics");

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          const mock = createChainableMock([]);
          mock.in.mockImplementation(() => {
            // Only 3 historical alerts (below MIN_SAMPLE_SIZE_FOR_RATES = 10)
            mock.limit.mockResolvedValueOnce({
              data: [
                { severity: "high", status: "resolved", resolved_at: new Date().toISOString() },
                { severity: "high", status: "dismissed", resolved_at: new Date().toISOString() },
                { severity: "normal", status: "resolved", resolved_at: new Date().toISOString() },
              ],
              error: null,
            });
            return mock;
          });
          return mock;
        }
        if (table === "supplier_reliability_leaderboard") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        if (table === "offer_trust_scores") {
          return createChainableMock([]);
        }
        if (table === "margin_opportunities") {
          return createChainableMock([]);
        }
        if (table === "procurement_intelligence_metrics") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const metrics = await collectProcurementMetrics();

      const precisionMetric = metrics.find(m => m.metric_type === "alert_precision");
      expect(precisionMetric).toBeDefined();
      expect(precisionMetric?.metadata?.is_reliable).toBe(false);
      expect(precisionMetric?.metadata?.note).toContain("Insufficient data");
    });
  });

  describe("False Alert Rate", () => {
    it("should calculate false alert rate from historical dismissals", async () => {
      const { collectProcurementMetrics } = await import("./metrics");

      mockFrom.mockImplementation((table: string) => {
        if (table === "procurement_alerts") {
          const mock = createChainableMock([]);
          mock.in.mockImplementation(() => {
            // 20 historical alerts: 15 resolved, 5 dismissed
            mock.limit.mockResolvedValueOnce({
              data: [
                ...Array(15).fill({ status: "resolved", severity: "high", resolved_at: new Date().toISOString() }),
                ...Array(5).fill({ status: "dismissed", severity: "normal", resolved_at: new Date().toISOString() }),
              ],
              error: null,
            });
            return mock;
          });
          return mock;
        }
        if (table === "supplier_reliability_leaderboard") {
          return createChainableMock([]);
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([]);
        }
        if (table === "offer_trust_scores") {
          return createChainableMock([]);
        }
        if (table === "margin_opportunities") {
          return createChainableMock([]);
        }
        if (table === "procurement_intelligence_metrics") {
          return createChainableMock(null);
        }
        return createChainableMock([]);
      });

      const metrics = await collectProcurementMetrics();

      const falseRateMetric = metrics.find(m => m.metric_type === "false_alert_rate");
      expect(falseRateMetric).toBeDefined();
      // 5 dismissed out of 20 = 25%
      expect(falseRateMetric?.metric_value).toBeCloseTo(0.25, 1);
      expect(falseRateMetric?.metadata?.is_reliable).toBe(true);
    });
  });

  describe("Metrics Summary", () => {
    it("should aggregate all metrics correctly", async () => {
      const { getMetricsSummary } = await import("./metrics");

      mockFrom.mockImplementation((table: string) => {
        if (table === "supplier_reliability_leaderboard") {
          return createChainableMock([
            { reliability_score: 0.85, reliability_band: "trusted" },
            { reliability_score: 0.75, reliability_band: "stable" },
            { reliability_score: 0.45, reliability_band: "watch" },
          ]);
        }
        if (table === "offer_trust_scores") {
          return createChainableMock([
            { trust_score: 0.9, trust_band: "high_trust" },
            { trust_score: 0.35, trust_band: "low_trust" },
          ]);
        }
        if (table === "margin_opportunities") {
          return createChainableMock([
            { opportunity_band: "major", estimated_savings_per_case: 20 },
            { opportunity_band: "meaningful", estimated_savings_per_case: 10 },
          ]);
        }
        if (table === "procurement_alerts") {
          const mock = createChainableMock([]);
          mock.eq.mockImplementation((field: string, value: string) => {
            if (value === "open") {
              mock.limit.mockResolvedValueOnce({
                data: [
                  { severity: "critical", status: "open" },
                  { severity: "high", status: "open" },
                ],
                error: null,
              });
            }
            return mock;
          });
          return mock;
        }
        if (table === "supplier_recommendations") {
          return createChainableMock([
            { recommendation_band: "strong_recommendation" },
            { recommendation_band: "acceptable" },
          ]);
        }
        return createChainableMock([]);
      });

      const summary = await getMetricsSummary();

      expect(summary.reliability.trusted_count).toBe(1);
      expect(summary.reliability.risky_count).toBe(1); // watch counts as risky
      expect(summary.trust.high_trust_count).toBe(1);
      expect(summary.trust.low_trust_count).toBe(1);
      expect(summary.opportunities.major_count).toBe(1);
    });
  });
});
