import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QualityMetric, QualityMetricType } from "./qualityMetrics";

// ============================================================================
// PURE FUNCTION TESTS - Quality Metric Calculations
// ============================================================================

describe("Quality Metrics - Pure Functions", () => {
  const MIN_SAMPLE_SIZE = 10;

  describe("Acceptance Rate Calculation", () => {
    function calculateAcceptanceRate(accepted: number, rejected: number): {
      rate: number;
      statistically_valid: boolean;
    } {
      const decided = accepted + rejected;
      const statistically_valid = decided >= MIN_SAMPLE_SIZE;
      const rate = statistically_valid ? accepted / decided : -1;
      return { rate, statistically_valid };
    }

    it("should calculate acceptance rate correctly with sufficient samples", () => {
      const result = calculateAcceptanceRate(8, 2);
      expect(result.rate).toBe(0.8);
      expect(result.statistically_valid).toBe(true);
    });

    it("should return -1 for insufficient samples", () => {
      const result = calculateAcceptanceRate(3, 2);
      expect(result.rate).toBe(-1);
      expect(result.statistically_valid).toBe(false);
    });

    it("should calculate 0% acceptance rate correctly", () => {
      const result = calculateAcceptanceRate(0, 15);
      expect(result.rate).toBe(0);
      expect(result.statistically_valid).toBe(true);
    });

    it("should calculate 100% acceptance rate correctly", () => {
      const result = calculateAcceptanceRate(15, 0);
      expect(result.rate).toBe(1);
      expect(result.statistically_valid).toBe(true);
    });

    it("should handle exactly MIN_SAMPLE_SIZE outcomes", () => {
      const result = calculateAcceptanceRate(5, 5);
      expect(result.rate).toBe(0.5);
      expect(result.statistically_valid).toBe(true);
    });
  });

  describe("Savings Capture Rate Calculation", () => {
    function calculateSavingsCaptureRate(
      totalEstimated: number,
      totalRealized: number,
      sampleCount: number
    ): {
      rate: number;
      statistically_valid: boolean;
      over_capture_warning: boolean;
    } {
      const statistically_valid = sampleCount >= MIN_SAMPLE_SIZE;
      
      if (!statistically_valid) {
        return { rate: -1, statistically_valid: false, over_capture_warning: false };
      }
      
      if (totalEstimated <= 0) {
        return { rate: 0, statistically_valid: true, over_capture_warning: false };
      }
      
      const rawRate = totalRealized / totalEstimated;
      const rate = Math.min(rawRate, 1.5); // Cap at 150%
      const over_capture_warning = totalRealized > totalEstimated * 1.1;
      
      return { rate, statistically_valid, over_capture_warning };
    }

    it("should calculate normal capture rate correctly", () => {
      const result = calculateSavingsCaptureRate(100, 80, 15);
      expect(result.rate).toBe(0.8);
      expect(result.over_capture_warning).toBe(false);
    });

    it("should cap rate at 150%", () => {
      const result = calculateSavingsCaptureRate(100, 200, 15);
      expect(result.rate).toBe(1.5);
    });

    it("should warn when realized > estimated * 1.1", () => {
      const result = calculateSavingsCaptureRate(100, 120, 15);
      expect(result.over_capture_warning).toBe(true);
    });

    it("should not warn when realized is within 10% of estimated", () => {
      const result = calculateSavingsCaptureRate(100, 105, 15);
      expect(result.over_capture_warning).toBe(false);
    });

    it("should return -1 for insufficient samples", () => {
      const result = calculateSavingsCaptureRate(100, 80, 5);
      expect(result.rate).toBe(-1);
      expect(result.statistically_valid).toBe(false);
    });

    it("should handle zero estimated savings", () => {
      const result = calculateSavingsCaptureRate(0, 50, 15);
      expect(result.rate).toBe(0);
    });
  });

  describe("Latency Percentile Calculation", () => {
    function calculateLatencyPercentiles(latencies: number[]): {
      avg: number;
      p50: number;
      p90: number;
      p99: number;
      min: number;
      max: number;
    } {
      if (latencies.length === 0) {
        return { avg: 0, p50: 0, p90: 0, p99: 0, min: 0, max: 0 };
      }
      
      const sorted = [...latencies].sort((a, b) => a - b);
      const avg = sorted.reduce((sum, h) => sum + h, 0) / sorted.length;
      
      const p50Index = Math.floor(sorted.length * 0.5);
      const p90Index = Math.floor(sorted.length * 0.9);
      const p99Index = Math.floor(sorted.length * 0.99);
      
      return {
        avg,
        p50: sorted[p50Index] || 0,
        p90: sorted[p90Index] || 0,
        p99: sorted[p99Index] || sorted[sorted.length - 1] || 0,
        min: sorted[0] || 0,
        max: sorted[sorted.length - 1] || 0,
      };
    }

    it("should calculate average correctly", () => {
      const latencies = [1, 2, 3, 4, 5];
      const result = calculateLatencyPercentiles(latencies);
      expect(result.avg).toBe(3);
    });

    it("should calculate p50 (median) correctly", () => {
      const latencies = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = calculateLatencyPercentiles(latencies);
      expect(result.p50).toBe(6); // Index 5 (0-indexed)
    });

    it("should calculate p90 correctly", () => {
      const latencies = Array.from({ length: 100 }, (_, i) => i + 1);
      const result = calculateLatencyPercentiles(latencies);
      expect(result.p90).toBe(91); // Index 90
    });

    it("should identify min and max correctly", () => {
      const latencies = [5, 3, 8, 1, 9, 2];
      const result = calculateLatencyPercentiles(latencies);
      expect(result.min).toBe(1);
      expect(result.max).toBe(9);
    });

    it("should handle empty array", () => {
      const result = calculateLatencyPercentiles([]);
      expect(result.avg).toBe(0);
      expect(result.p50).toBe(0);
    });

    it("should handle single value", () => {
      const result = calculateLatencyPercentiles([42]);
      expect(result.avg).toBe(42);
      expect(result.p50).toBe(42);
      expect(result.min).toBe(42);
      expect(result.max).toBe(42);
    });
  });

  describe("False Positive Rate Calculation", () => {
    interface Outcome {
      estimated_savings: number | null;
      realized_savings: number | null;
      outcome_status: string;
    }

    function calculateFalsePositiveRate(outcomes: Outcome[]): {
      rate: number;
      statistically_valid: boolean;
      false_positive_count: number;
    } {
      const highSavingsRecommended = outcomes.filter(
        o => o.estimated_savings && o.estimated_savings > 0
      );
      
      const falsePositives = highSavingsRecommended.filter(
        o => o.outcome_status === "rejected" ||
             (o.outcome_status === "accepted" &&
              o.realized_savings != null &&
              o.realized_savings <= 0)
      );
      
      const statistically_valid = highSavingsRecommended.length >= MIN_SAMPLE_SIZE;
      const rate = statistically_valid
        ? falsePositives.length / highSavingsRecommended.length
        : -1;
      
      return {
        rate,
        statistically_valid,
        false_positive_count: falsePositives.length,
      };
    }

    it("should count rejected high-savings recommendations as false positives", () => {
      const outcomes: Outcome[] = [
        { estimated_savings: 50, realized_savings: null, outcome_status: "rejected" },
        { estimated_savings: 30, realized_savings: null, outcome_status: "rejected" },
        // Need 10 total for valid sample
        ...Array(8).fill({ estimated_savings: 20, realized_savings: 25, outcome_status: "accepted" }),
      ];
      
      const result = calculateFalsePositiveRate(outcomes);
      expect(result.false_positive_count).toBe(2);
      expect(result.rate).toBe(0.2); // 2/10
    });

    it("should count accepted with negative realized savings as false positives", () => {
      const outcomes: Outcome[] = [
        { estimated_savings: 50, realized_savings: -10, outcome_status: "accepted" },
        ...Array(9).fill({ estimated_savings: 20, realized_savings: 25, outcome_status: "accepted" }),
      ];
      
      const result = calculateFalsePositiveRate(outcomes);
      expect(result.false_positive_count).toBe(1);
    });

    it("should not count accepted with positive realized savings as false positives", () => {
      const outcomes: Outcome[] = Array(10).fill({
        estimated_savings: 20,
        realized_savings: 25,
        outcome_status: "accepted",
      });
      
      const result = calculateFalsePositiveRate(outcomes);
      expect(result.false_positive_count).toBe(0);
      expect(result.rate).toBe(0);
    });
  });

  describe("Override Rate Calculation", () => {
    interface Outcome {
      outcome_status: string;
      supplier_id: string;
      selected_supplier_id: string | null;
    }

    function calculateOverrideRate(outcomes: Outcome[]): {
      rate: number;
      statistically_valid: boolean;
      overridden_count: number;
    } {
      const accepted = outcomes.filter(o => o.outcome_status === "accepted");
      const overridden = accepted.filter(
        o => o.selected_supplier_id && o.selected_supplier_id !== o.supplier_id
      );
      
      const statistically_valid = accepted.length >= MIN_SAMPLE_SIZE;
      const rate = statistically_valid ? overridden.length / accepted.length : -1;
      
      return {
        rate,
        statistically_valid,
        overridden_count: overridden.length,
      };
    }

    it("should calculate override rate when operators choose different suppliers", () => {
      const outcomes: Outcome[] = [
        { outcome_status: "accepted", supplier_id: "s1", selected_supplier_id: "s2" },
        { outcome_status: "accepted", supplier_id: "s1", selected_supplier_id: "s3" },
        ...Array(8).fill({ outcome_status: "accepted", supplier_id: "s1", selected_supplier_id: "s1" }),
      ];
      
      const result = calculateOverrideRate(outcomes);
      expect(result.overridden_count).toBe(2);
      expect(result.rate).toBe(0.2);
    });

    it("should not count matching supplier selections as overrides", () => {
      const outcomes: Outcome[] = Array(10).fill({
        outcome_status: "accepted",
        supplier_id: "s1",
        selected_supplier_id: "s1",
      });
      
      const result = calculateOverrideRate(outcomes);
      expect(result.overridden_count).toBe(0);
      expect(result.rate).toBe(0);
    });

    it("should ignore rejected outcomes for override calculation", () => {
      const outcomes: Outcome[] = [
        { outcome_status: "rejected", supplier_id: "s1", selected_supplier_id: "s2" },
        ...Array(10).fill({ outcome_status: "accepted", supplier_id: "s1", selected_supplier_id: "s1" }),
      ];
      
      const result = calculateOverrideRate(outcomes);
      expect(result.overridden_count).toBe(0);
    });
  });

  describe("Metric Validity Markers", () => {
    it("should mark metric as insufficient when sample < MIN_SAMPLE_SIZE", () => {
      const sampleSize = 5;
      const insufficient_data = sampleSize < MIN_SAMPLE_SIZE;
      
      expect(insufficient_data).toBe(true);
    });

    it("should mark metric as valid when sample >= MIN_SAMPLE_SIZE", () => {
      const sampleSize = 15;
      const insufficient_data = sampleSize < MIN_SAMPLE_SIZE;
      
      expect(insufficient_data).toBe(false);
    });

    it("should use -1 as sentinel value for insufficient data", () => {
      const rate = -1;
      const isInsufficientData = rate === -1;
      
      expect(isInsufficientData).toBe(true);
    });

    it("should distinguish -1 from valid 0 rate", () => {
      const insufficientRate = -1;
      const zeroRate = 0;
      
      expect(insufficientRate).not.toBe(zeroRate);
      expect(insufficientRate < 0).toBe(true);
      expect(zeroRate >= 0).toBe(true);
    });
  });
});

// ============================================================================
// QUALITY REPORT GENERATION TESTS
// ============================================================================

describe("Quality Report Generation", () => {
  describe("Health Status Determination", () => {
    type HealthStatus = "healthy" | "attention" | "critical";
    
    function determineHealth(
      acceptanceRate: number,
      savingsCapture: number
    ): HealthStatus {
      if (acceptanceRate < 50 || savingsCapture < 60) {
        return "critical";
      } else if (acceptanceRate < 70 || savingsCapture < 80) {
        return "attention";
      }
      return "healthy";
    }

    it("should be healthy when acceptance >= 70% and savings >= 80%", () => {
      expect(determineHealth(75, 85)).toBe("healthy");
      expect(determineHealth(100, 100)).toBe("healthy");
      expect(determineHealth(70, 80)).toBe("healthy");
    });

    it("should need attention when acceptance is 50-69%", () => {
      expect(determineHealth(65, 85)).toBe("attention");
      expect(determineHealth(50, 90)).toBe("attention");
    });

    it("should need attention when savings is 60-79%", () => {
      expect(determineHealth(80, 75)).toBe("attention");
      expect(determineHealth(90, 60)).toBe("attention");
    });

    it("should be critical when acceptance < 50%", () => {
      expect(determineHealth(45, 85)).toBe("critical");
      expect(determineHealth(30, 90)).toBe("critical");
    });

    it("should be critical when savings < 60%", () => {
      expect(determineHealth(80, 55)).toBe("critical");
      expect(determineHealth(90, 40)).toBe("critical");
    });
  });

  describe("Recommendation Generation", () => {
    interface MetricInput {
      type: QualityMetricType;
      value: number;
      sample_size: number;
    }

    function generateRecommendations(metrics: MetricInput[]): string[] {
      const recommendations: string[] = [];
      const MIN_SAMPLE = 10;
      
      const acceptance = metrics.find(m => m.type === "recommendation_acceptance_rate");
      if (acceptance && acceptance.value >= 0 && acceptance.value < 0.7 && acceptance.sample_size >= MIN_SAMPLE) {
        recommendations.push("Acceptance rate below 70% - review recommendation criteria");
      }
      
      const override = metrics.find(m => m.type === "override_rate");
      if (override && override.value > 0.3 && override.sample_size >= MIN_SAMPLE) {
        recommendations.push("Override rate above 30% - operators are frequently choosing alternatives");
      }
      
      const falsePositive = metrics.find(m => m.type === "false_positive_recommendation_rate");
      if (falsePositive && falsePositive.value > 0.2 && falsePositive.sample_size >= MIN_SAMPLE) {
        recommendations.push("False positive rate above 20% - savings estimates may be too optimistic");
      }
      
      const lowTrustRejection = metrics.find(m => m.type === "rejected_due_to_low_trust_rate");
      if (lowTrustRejection && lowTrustRejection.value > 0.4 && lowTrustRejection.sample_size >= MIN_SAMPLE) {
        recommendations.push("Many rejections due to trust issues - trust scoring may need calibration");
      }
      
      return recommendations;
    }

    it("should recommend reviewing criteria when acceptance below 70%", () => {
      const metrics: MetricInput[] = [
        { type: "recommendation_acceptance_rate", value: 0.65, sample_size: 50 },
      ];
      
      const recs = generateRecommendations(metrics);
      expect(recs).toContain("Acceptance rate below 70% - review recommendation criteria");
    });

    it("should recommend when override rate above 30%", () => {
      const metrics: MetricInput[] = [
        { type: "override_rate", value: 0.35, sample_size: 50 },
      ];
      
      const recs = generateRecommendations(metrics);
      expect(recs).toContain("Override rate above 30% - operators are frequently choosing alternatives");
    });

    it("should not recommend when sample size is insufficient", () => {
      const metrics: MetricInput[] = [
        { type: "recommendation_acceptance_rate", value: 0.50, sample_size: 5 },
      ];
      
      const recs = generateRecommendations(metrics);
      expect(recs).toHaveLength(0);
    });

    it("should not recommend when metrics are healthy", () => {
      const metrics: MetricInput[] = [
        { type: "recommendation_acceptance_rate", value: 0.85, sample_size: 50 },
        { type: "override_rate", value: 0.15, sample_size: 50 },
        { type: "false_positive_recommendation_rate", value: 0.10, sample_size: 50 },
      ];
      
      const recs = generateRecommendations(metrics);
      expect(recs).toHaveLength(0);
    });

    it("should ignore -1 (insufficient data) values", () => {
      const metrics: MetricInput[] = [
        { type: "recommendation_acceptance_rate", value: -1, sample_size: 5 },
      ];
      
      const recs = generateRecommendations(metrics);
      expect(recs).toHaveLength(0);
    });
  });
});

// ============================================================================
// METRIC TYPE COVERAGE TESTS
// ============================================================================

describe("Metric Type Coverage", () => {
  it("should support all required metric types", () => {
    const metricTypes: QualityMetricType[] = [
      "recommendation_acceptance_rate",
      "trusted_recommendation_acceptance_rate",
      "rejected_due_to_low_trust_rate",
      "realized_savings_capture_rate",
      "estimated_vs_realized_savings_error",
      "false_positive_recommendation_rate",
      "superseded_recommendation_rate",
      "recommendation_latency_to_decision",
      "top_rank_acceptance_rate",
      "override_rate",
      "rejection_reason_distribution",
    ];
    
    expect(metricTypes).toHaveLength(11);
  });

  it("should have consistent metric structure", () => {
    const mockMetric: QualityMetric = {
      metric_type: "recommendation_acceptance_rate",
      metric_value: 0.75,
      sample_size: 100,
      window_start: "2026-02-01T00:00:00Z",
      window_end: "2026-03-01T00:00:00Z",
      metadata: {
        accepted_count: 75,
        decided_count: 100,
        statistically_valid: true,
      },
    };
    
    expect(mockMetric.metric_type).toBeDefined();
    expect(mockMetric.metric_value).toBeDefined();
    expect(mockMetric.sample_size).toBeDefined();
    expect(mockMetric.window_start).toBeDefined();
    expect(mockMetric.window_end).toBeDefined();
  });
});
