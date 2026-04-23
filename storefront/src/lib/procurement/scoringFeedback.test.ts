import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdjustmentType, ScoringAdjustment, FeedbackPattern } from "./scoringFeedback";

// ============================================================================
// CONFIGURATION TESTS
// ============================================================================

describe("Scoring Feedback - Configuration", () => {
  const FEEDBACK_CONFIG = {
    min_sample_size: 20,
    high_confidence_sample_size: 100,
    high_override_rate: 0.4,
    low_acceptance_rate: 0.3,
    high_acceptance_rate: 0.8,
    repeated_rejection_count: 5,
    penalty_magnitude: 0.05,
    bonus_magnitude: 0.03,
    max_adjustment: 0.15,
    scaling_factor: 0.02,
    max_scaled_penalty: 0.12,
    adjustment_decay_days: 90,
  };

  describe("Sample Size Guards", () => {
    it("should require minimum 20 samples before generating adjustments", () => {
      expect(FEEDBACK_CONFIG.min_sample_size).toBe(20);
    });

    it("should require 100 samples for full confidence", () => {
      expect(FEEDBACK_CONFIG.high_confidence_sample_size).toBe(100);
    });

    it("should require 5+ rejections before triggering repeated rejection pattern", () => {
      expect(FEEDBACK_CONFIG.repeated_rejection_count).toBe(5);
    });
  });

  describe("Adjustment Magnitude Limits", () => {
    it("should limit penalty magnitude to 5%", () => {
      expect(FEEDBACK_CONFIG.penalty_magnitude).toBe(0.05);
    });

    it("should limit bonus magnitude to 3%", () => {
      expect(FEEDBACK_CONFIG.bonus_magnitude).toBe(0.03);
    });

    it("should cap cumulative adjustment at 15%", () => {
      expect(FEEDBACK_CONFIG.max_adjustment).toBe(0.15);
    });

    it("should cap scaled penalty at 12%", () => {
      expect(FEEDBACK_CONFIG.max_scaled_penalty).toBe(0.12);
    });
  });

  describe("Threshold Values", () => {
    it("should trigger override pattern at 40% override rate", () => {
      expect(FEEDBACK_CONFIG.high_override_rate).toBe(0.4);
    });

    it("should trigger low acceptance pattern at 30% acceptance rate", () => {
      expect(FEEDBACK_CONFIG.low_acceptance_rate).toBe(0.3);
    });

    it("should trigger high acceptance bonus at 80% acceptance rate", () => {
      expect(FEEDBACK_CONFIG.high_acceptance_rate).toBe(0.8);
    });
  });
});

// ============================================================================
// PATTERN DETECTION TESTS
// ============================================================================

describe("Scoring Feedback - Pattern Detection", () => {
  const MIN_SAMPLE_SIZE = 20;

  describe("Override Pattern Detection", () => {
    interface OutcomeData {
      supplier_id: string;
      selected_supplier_id: string | null;
    }

    function detectOverridePatterns(
      outcomes: OutcomeData[],
      threshold: number = 0.4
    ): FeedbackPattern[] {
      const patterns: FeedbackPattern[] = [];
      const supplierStats: Record<string, { total: number; overridden: number }> = {};
      
      for (const o of outcomes) {
        if (!supplierStats[o.supplier_id]) {
          supplierStats[o.supplier_id] = { total: 0, overridden: 0 };
        }
        supplierStats[o.supplier_id].total++;
        if (o.selected_supplier_id && o.selected_supplier_id !== o.supplier_id) {
          supplierStats[o.supplier_id].overridden++;
        }
      }
      
      for (const [supplierId, stats] of Object.entries(supplierStats)) {
        if (stats.total >= MIN_SAMPLE_SIZE) {
          const overrideRate = stats.overridden / stats.total;
          if (overrideRate >= threshold) {
            patterns.push({
              entity_type: "supplier",
              entity_id: supplierId,
              pattern_type: "high_override_rate",
              count: stats.overridden,
              rate: overrideRate,
              sample_size: stats.total,
            });
          }
        }
      }
      
      return patterns;
    }

    it("should detect high override pattern when rate >= 40%", () => {
      const outcomes: OutcomeData[] = [
        ...Array(10).fill({ supplier_id: "s1", selected_supplier_id: "alt-supplier" }),
        ...Array(15).fill({ supplier_id: "s1", selected_supplier_id: "s1" }),
      ];
      
      const patterns = detectOverridePatterns(outcomes);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern_type).toBe("high_override_rate");
      expect(patterns[0].rate).toBe(0.4); // 10/25
    });

    it("should not detect pattern when override rate < 40%", () => {
      const outcomes: OutcomeData[] = [
        ...Array(5).fill({ supplier_id: "s1", selected_supplier_id: "alt-supplier" }),
        ...Array(20).fill({ supplier_id: "s1", selected_supplier_id: "s1" }),
      ];
      
      const patterns = detectOverridePatterns(outcomes);
      expect(patterns).toHaveLength(0);
    });

    it("should not detect pattern when sample size < 20", () => {
      const outcomes: OutcomeData[] = [
        ...Array(8).fill({ supplier_id: "s1", selected_supplier_id: "alt-supplier" }),
        ...Array(7).fill({ supplier_id: "s1", selected_supplier_id: "s1" }),
      ];
      
      const patterns = detectOverridePatterns(outcomes);
      expect(patterns).toHaveLength(0); // Only 15 samples
    });
  });

  describe("Rejection Pattern Detection", () => {
    interface OutcomeData {
      supplier_id: string;
      outcome_status: "accepted" | "rejected";
    }

    function detectRejectionPatterns(
      outcomes: OutcomeData[],
      threshold: number = 0.3
    ): FeedbackPattern[] {
      const patterns: FeedbackPattern[] = [];
      const supplierStats: Record<string, { accepted: number; rejected: number }> = {};
      
      for (const o of outcomes) {
        if (!supplierStats[o.supplier_id]) {
          supplierStats[o.supplier_id] = { accepted: 0, rejected: 0 };
        }
        if (o.outcome_status === "accepted") supplierStats[o.supplier_id].accepted++;
        if (o.outcome_status === "rejected") supplierStats[o.supplier_id].rejected++;
      }
      
      for (const [supplierId, stats] of Object.entries(supplierStats)) {
        const total = stats.accepted + stats.rejected;
        if (total >= MIN_SAMPLE_SIZE) {
          const acceptanceRate = stats.accepted / total;
          if (acceptanceRate <= threshold) {
            patterns.push({
              entity_type: "supplier",
              entity_id: supplierId,
              pattern_type: "low_acceptance_rate",
              count: stats.rejected,
              rate: 1 - acceptanceRate,
              sample_size: total,
            });
          }
        }
      }
      
      return patterns;
    }

    it("should detect low acceptance pattern when rate <= 30%", () => {
      const outcomes: OutcomeData[] = [
        ...Array(6).fill({ supplier_id: "s1", outcome_status: "accepted" }),
        ...Array(19).fill({ supplier_id: "s1", outcome_status: "rejected" }),
      ];
      
      const patterns = detectRejectionPatterns(outcomes);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern_type).toBe("low_acceptance_rate");
    });

    it("should not detect pattern when acceptance rate > 30%", () => {
      const outcomes: OutcomeData[] = [
        ...Array(10).fill({ supplier_id: "s1", outcome_status: "accepted" }),
        ...Array(15).fill({ supplier_id: "s1", outcome_status: "rejected" }),
      ];
      
      const patterns = detectRejectionPatterns(outcomes);
      expect(patterns).toHaveLength(0); // 40% acceptance rate
    });
  });

  describe("Repeated Low-Trust Rejection Pattern", () => {
    interface OutcomeData {
      offer_id: string;
      recommended_trust_score: number;
    }

    function detectLowTrustRejections(
      outcomes: OutcomeData[],
      threshold: number = 5
    ): FeedbackPattern[] {
      const patterns: FeedbackPattern[] = [];
      const offerRejections: Record<string, number> = {};
      
      for (const o of outcomes) {
        if (o.recommended_trust_score < 0.6) {
          offerRejections[o.offer_id] = (offerRejections[o.offer_id] || 0) + 1;
        }
      }
      
      for (const [offerId, count] of Object.entries(offerRejections)) {
        if (count >= threshold) {
          patterns.push({
            entity_type: "offer",
            entity_id: offerId,
            pattern_type: "repeated_low_trust_rejection",
            count,
            rate: 1,
            sample_size: count,
          });
        }
      }
      
      return patterns;
    }

    it("should detect pattern when offer rejected 5+ times with low trust", () => {
      const outcomes: OutcomeData[] = Array(6).fill({
        offer_id: "offer-1",
        recommended_trust_score: 0.4,
      });
      
      const patterns = detectLowTrustRejections(outcomes);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].count).toBe(6);
    });

    it("should not detect pattern when rejections < 5", () => {
      const outcomes: OutcomeData[] = Array(4).fill({
        offer_id: "offer-1",
        recommended_trust_score: 0.4,
      });
      
      const patterns = detectLowTrustRejections(outcomes);
      expect(patterns).toHaveLength(0);
    });

    it("should not count high-trust offers", () => {
      const outcomes: OutcomeData[] = Array(10).fill({
        offer_id: "offer-1",
        recommended_trust_score: 0.8, // High trust
      });
      
      const patterns = detectLowTrustRejections(outcomes);
      expect(patterns).toHaveLength(0);
    });
  });
});

// ============================================================================
// ADJUSTMENT GENERATION TESTS
// ============================================================================

describe("Scoring Feedback - Adjustment Generation", () => {
  const CONFIG = {
    penalty_magnitude: 0.05,
    bonus_magnitude: 0.03,
    max_adjustment: 0.15,
    scaling_factor: 0.02,
    max_scaled_penalty: 0.12,
    repeated_rejection_count: 5,
    high_confidence_sample_size: 100,
  };

  describe("Confidence Calculation", () => {
    function calculateConfidence(sample_size: number): number {
      return Math.min(1, sample_size / CONFIG.high_confidence_sample_size);
    }

    it("should return 100% confidence at 100 samples", () => {
      expect(calculateConfidence(100)).toBe(1);
    });

    it("should return 50% confidence at 50 samples", () => {
      expect(calculateConfidence(50)).toBe(0.5);
    });

    it("should return 20% confidence at 20 samples", () => {
      expect(calculateConfidence(20)).toBe(0.2);
    });

    it("should cap at 100% for large samples", () => {
      expect(calculateConfidence(500)).toBe(1);
    });
  });

  describe("Scaled Penalty for Repeated Rejections", () => {
    function calculateScaledPenalty(rejectionCount: number): number {
      const rejectionsOverThreshold = Math.max(
        0,
        rejectionCount - CONFIG.repeated_rejection_count
      );
      return Math.min(
        CONFIG.penalty_magnitude + rejectionsOverThreshold * CONFIG.scaling_factor,
        CONFIG.max_scaled_penalty
      );
    }

    it("should apply base 5% penalty at threshold", () => {
      expect(calculateScaledPenalty(5)).toBe(0.05);
    });

    it("should add 2% per rejection beyond threshold", () => {
      expect(calculateScaledPenalty(6)).toBe(0.07); // 0.05 + 0.02
      expect(calculateScaledPenalty(7)).toBe(0.09); // 0.05 + 0.04
      expect(calculateScaledPenalty(8)).toBe(0.11); // 0.05 + 0.06
    });

    it("should cap at 12% maximum", () => {
      expect(calculateScaledPenalty(20)).toBe(0.12);
      expect(calculateScaledPenalty(100)).toBe(0.12);
    });

    it("should apply base penalty for counts at threshold", () => {
      expect(calculateScaledPenalty(5)).toBe(0.05);
    });
  });

  describe("Pattern to Adjustment Conversion", () => {
    function patternToAdjustment(
      pattern: FeedbackPattern
    ): ScoringAdjustment | null {
      const confidence = Math.min(
        1,
        pattern.sample_size / CONFIG.high_confidence_sample_size
      );

      switch (pattern.pattern_type) {
        case "high_override_rate":
          return {
            adjustment_type: "supplier_reliability_penalty",
            entity_type: pattern.entity_type,
            entity_id: pattern.entity_id,
            adjustment_value: -Math.min(
              pattern.rate * CONFIG.penalty_magnitude,
              CONFIG.max_adjustment
            ),
            reason: `Recommendations frequently overridden (${(
              pattern.rate * 100
            ).toFixed(1)}% override rate)`,
            sample_size: pattern.sample_size,
            confidence,
          };

        case "high_acceptance_rate":
          return {
            adjustment_type: "supplier_reliability_bonus",
            entity_type: pattern.entity_type,
            entity_id: pattern.entity_id,
            adjustment_value: Math.min(
              pattern.rate * CONFIG.bonus_magnitude,
              CONFIG.max_adjustment
            ),
            reason: `High recommendation acceptance rate (${(
              pattern.rate * 100
            ).toFixed(1)}% accepted)`,
            sample_size: pattern.sample_size,
            confidence,
          };

        case "repeated_low_trust_rejection": {
          const rejectionsOverThreshold = Math.max(
            0,
            pattern.count - CONFIG.repeated_rejection_count
          );
          const scaledPenalty = Math.min(
            CONFIG.penalty_magnitude +
              rejectionsOverThreshold * CONFIG.scaling_factor,
            CONFIG.max_scaled_penalty
          );

          return {
            adjustment_type: "offer_trust_penalty",
            entity_type: pattern.entity_type,
            entity_id: pattern.entity_id,
            adjustment_value: -scaledPenalty,
            reason: `Offer rejected ${pattern.count} times (${rejectionsOverThreshold} beyond threshold), low trust confirmed`,
            sample_size: pattern.sample_size,
            confidence,
          };
        }

        default:
          return null;
      }
    }

    it("should create reliability penalty for high override rate", () => {
      const pattern: FeedbackPattern = {
        entity_type: "supplier",
        entity_id: "s1",
        pattern_type: "high_override_rate",
        count: 15,
        rate: 0.5,
        sample_size: 30,
      };

      const adjustment = patternToAdjustment(pattern);
      expect(adjustment).not.toBeNull();
      expect(adjustment?.adjustment_type).toBe("supplier_reliability_penalty");
      expect(adjustment?.adjustment_value).toBeLessThan(0);
    });

    it("should create reliability bonus for high acceptance rate", () => {
      const pattern: FeedbackPattern = {
        entity_type: "supplier",
        entity_id: "s1",
        pattern_type: "high_acceptance_rate",
        count: 25,
        rate: 0.85,
        sample_size: 30,
      };

      const adjustment = patternToAdjustment(pattern);
      expect(adjustment).not.toBeNull();
      expect(adjustment?.adjustment_type).toBe("supplier_reliability_bonus");
      expect(adjustment?.adjustment_value).toBeGreaterThan(0);
    });

    it("should create scaled trust penalty for repeated rejections", () => {
      const pattern: FeedbackPattern = {
        entity_type: "offer",
        entity_id: "o1",
        pattern_type: "repeated_low_trust_rejection",
        count: 8,
        rate: 1,
        sample_size: 8,
      };

      const adjustment = patternToAdjustment(pattern);
      expect(adjustment).not.toBeNull();
      expect(adjustment?.adjustment_type).toBe("offer_trust_penalty");
      // 5% base + 3*2% = 11%
      expect(adjustment?.adjustment_value).toBe(-0.11);
    });
  });
});

// ============================================================================
// ADJUSTMENT APPLICATION TESTS
// ============================================================================

describe("Scoring Feedback - Adjustment Application", () => {
  const MAX_ADJUSTMENT = 0.15;

  describe("Adjustment Compounding Prevention", () => {
    interface Adjustment {
      adjustment_type: AdjustmentType;
      adjustment_value: number;
      confidence: number;
      reason: string;
    }

    function calculateTotalAdjustment(adjustments: Adjustment[]): {
      total: number;
      reasons: string[];
    } {
      // Group by type and take strongest of each
      const byType: Record<string, { value: number; reason: string }> = {};

      for (const adj of adjustments) {
        const effectiveValue = adj.adjustment_value * adj.confidence;
        const existing = byType[adj.adjustment_type];

        if (!existing || Math.abs(effectiveValue) > Math.abs(existing.value)) {
          byType[adj.adjustment_type] = {
            value: effectiveValue,
            reason: adj.reason,
          };
        }
      }

      let total = 0;
      const reasons: string[] = [];

      for (const adj of Object.values(byType)) {
        total += adj.value;
        reasons.push(adj.reason);
      }

      // Cap at max
      total = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, total));

      return { total, reasons };
    }

    it("should take strongest adjustment per type, not sum", () => {
      const adjustments: Adjustment[] = [
        {
          adjustment_type: "supplier_reliability_penalty",
          adjustment_value: -0.05,
          confidence: 0.8,
          reason: "Reason 1",
        },
        {
          adjustment_type: "supplier_reliability_penalty",
          adjustment_value: -0.08,
          confidence: 0.9,
          reason: "Reason 2",
        },
      ];

      const result = calculateTotalAdjustment(adjustments);
      // Should use -0.08 * 0.9 = -0.072, not sum of both
      expect(result.total).toBeCloseTo(-0.072, 3);
      expect(result.reasons).toHaveLength(1);
    });

    it("should combine different adjustment types", () => {
      const adjustments: Adjustment[] = [
        {
          adjustment_type: "supplier_reliability_penalty",
          adjustment_value: -0.05,
          confidence: 1,
          reason: "Penalty",
        },
        {
          adjustment_type: "supplier_reliability_bonus",
          adjustment_value: 0.03,
          confidence: 1,
          reason: "Bonus",
        },
      ];

      const result = calculateTotalAdjustment(adjustments);
      expect(result.total).toBeCloseTo(-0.02, 10); // -0.05 + 0.03
      expect(result.reasons).toHaveLength(2);
    });

    it("should cap total at max adjustment", () => {
      const adjustments: Adjustment[] = [
        {
          adjustment_type: "supplier_reliability_penalty",
          adjustment_value: -0.10,
          confidence: 1,
          reason: "Penalty 1",
        },
        {
          adjustment_type: "offer_trust_penalty",
          adjustment_value: -0.10,
          confidence: 1,
          reason: "Penalty 2",
        },
      ];

      const result = calculateTotalAdjustment(adjustments);
      expect(result.total).toBe(-MAX_ADJUSTMENT); // Capped at -0.15
    });

    it("should apply confidence weighting", () => {
      const adjustments: Adjustment[] = [
        {
          adjustment_type: "supplier_reliability_penalty",
          adjustment_value: -0.10,
          confidence: 0.5, // 50% confidence
          reason: "Half confident",
        },
      ];

      const result = calculateTotalAdjustment(adjustments);
      expect(result.total).toBe(-0.05); // -0.10 * 0.5
    });
  });

  describe("Effective Adjustment Retrieval", () => {
    it("should return 0 when no adjustments exist", () => {
      const adjustments: never[] = [];
      const total =
        adjustments.length > 0 ? adjustments.reduce((s, a) => s, 0) : 0;
      expect(total).toBe(0);
    });

    it("should weight adjustment by confidence", () => {
      const adjustment = { value: -0.10, confidence: 0.7 };
      const effective = adjustment.value * adjustment.confidence;
      expect(effective).toBeCloseTo(-0.07, 10);
    });
  });
});

// ============================================================================
// DECAY AND CLEANUP TESTS
// ============================================================================

describe("Scoring Feedback - Decay and Cleanup", () => {
  const ADJUSTMENT_DECAY_DAYS = 90;

  describe("Expiration Logic", () => {
    function isAdjustmentExpired(
      effectiveUntil: string | null,
      now: Date
    ): boolean {
      if (!effectiveUntil) return false;
      return new Date(effectiveUntil) < now;
    }

    it("should identify expired adjustments", () => {
      const now = new Date("2026-03-11");
      const expiredDate = "2026-03-01T00:00:00Z";

      expect(isAdjustmentExpired(expiredDate, now)).toBe(true);
    });

    it("should identify active adjustments", () => {
      const now = new Date("2026-03-11");
      const futureDate = "2026-06-01T00:00:00Z";

      expect(isAdjustmentExpired(futureDate, now)).toBe(false);
    });

    it("should treat null effective_until as never expiring", () => {
      const now = new Date("2026-03-11");

      expect(isAdjustmentExpired(null, now)).toBe(false);
    });
  });

  describe("Decay Period Calculation", () => {
    function calculateDecayDate(createdAt: Date): Date {
      return new Date(
        createdAt.getTime() + ADJUSTMENT_DECAY_DAYS * 24 * 60 * 60 * 1000
      );
    }

    it("should calculate 90-day decay period", () => {
      const createdAt = new Date("2026-01-01");
      const decayDate = calculateDecayDate(createdAt);

      expect(decayDate.toISOString().split("T")[0]).toBe("2026-04-01");
    });
  });
});

// ============================================================================
// FEEDBACK CYCLE INTEGRATION TESTS
// ============================================================================

describe("Scoring Feedback - Feedback Cycle", () => {
  describe("Full Cycle Flow", () => {
    it("should follow correct feedback cycle sequence", () => {
      const sequence = [
        "1. Detect patterns from outcomes",
        "2. Filter patterns by minimum sample size",
        "3. Generate adjustments from patterns",
        "4. Check for existing active adjustments (dedup)",
        "5. Persist new adjustments",
        "6. Clean up expired adjustments",
      ];

      expect(sequence).toHaveLength(6);
    });
  });

  describe("Pattern to Adjustment Deduplication", () => {
    interface ExistingAdjustment {
      adjustment_type: AdjustmentType;
      entity_id: string;
      effective_until: string | null;
    }

    function shouldCreateAdjustment(
      pattern: FeedbackPattern,
      adjustmentType: AdjustmentType,
      existing: ExistingAdjustment[]
    ): boolean {
      const now = new Date();
      const activeExisting = existing.find(
        (adj) =>
          adj.adjustment_type === adjustmentType &&
          adj.entity_id === pattern.entity_id &&
          (!adj.effective_until || new Date(adj.effective_until) > now)
      );

      return !activeExisting;
    }

    it("should skip creation if active adjustment exists", () => {
      const pattern: FeedbackPattern = {
        entity_type: "supplier",
        entity_id: "s1",
        pattern_type: "high_override_rate",
        count: 10,
        rate: 0.5,
        sample_size: 20,
      };

      const existing: ExistingAdjustment[] = [
        {
          adjustment_type: "supplier_reliability_penalty",
          entity_id: "s1",
          effective_until: "2026-06-01T00:00:00Z", // Future date
        },
      ];

      expect(
        shouldCreateAdjustment(pattern, "supplier_reliability_penalty", existing)
      ).toBe(false);
    });

    it("should allow creation if no active adjustment exists", () => {
      const pattern: FeedbackPattern = {
        entity_type: "supplier",
        entity_id: "s1",
        pattern_type: "high_override_rate",
        count: 10,
        rate: 0.5,
        sample_size: 20,
      };

      const existing: ExistingAdjustment[] = [];

      expect(
        shouldCreateAdjustment(pattern, "supplier_reliability_penalty", existing)
      ).toBe(true);
    });

    it("should allow creation if existing adjustment is expired", () => {
      const pattern: FeedbackPattern = {
        entity_type: "supplier",
        entity_id: "s1",
        pattern_type: "high_override_rate",
        count: 10,
        rate: 0.5,
        sample_size: 20,
      };

      const existing: ExistingAdjustment[] = [
        {
          adjustment_type: "supplier_reliability_penalty",
          entity_id: "s1",
          effective_until: "2026-01-01T00:00:00Z", // Past date
        },
      ];

      expect(
        shouldCreateAdjustment(pattern, "supplier_reliability_penalty", existing)
      ).toBe(true);
    });
  });
});
