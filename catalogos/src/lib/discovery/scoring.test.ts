/**
 * Tests for lead scoring.
 */

import { describe, it, expect } from "vitest";
import { computeLeadScore } from "./scoring";
import type { RawLeadCandidate } from "./types";

describe("computeLeadScore", () => {
  it("returns 0 for empty candidate", () => {
    expect(computeLeadScore({ company_name: "X", discovery_method: "manual" })).toBe(0);
  });

  it("adds score for website/domain", () => {
    expect(computeLeadScore({ company_name: "Acme", website: "https://acme.com", discovery_method: "manual" })).toBeGreaterThanOrEqual(15);
  });

  it("adds score for api_signal", () => {
    const c: RawLeadCandidate = { company_name: "A", discovery_method: "manual", api_signal: true };
    expect(computeLeadScore(c)).toBe(20);
  });

  it("adds score for csv_signal and pdf_catalog_signal", () => {
    const c: RawLeadCandidate = {
      company_name: "B",
      website: "https://b.com",
      discovery_method: "manual",
      csv_signal: true,
      pdf_catalog_signal: true,
    };
    const s = computeLeadScore(c);
    expect(s).toBeGreaterThanOrEqual(15 + 15 + 15);
  });

  it("caps at 100", () => {
    const c: RawLeadCandidate = {
      company_name: "C",
      website: "https://c.com",
      discovery_method: "manual",
      api_signal: true,
      csv_signal: true,
      pdf_catalog_signal: true,
      product_categories: ["gloves", "ppe", "nitrile"],
      catalog_signals: [{ type: "catalog", url: "https://c.com/catalog" }, { type: "pdf" }],
    };
    expect(computeLeadScore(c)).toBeLessThanOrEqual(100);
  });
});
