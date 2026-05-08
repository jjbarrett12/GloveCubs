import { describe, expect, it } from "vitest";
import { isTrustedProcurementLine } from "@/lib/procurement/trusted-procurement-line";

describe("isTrustedProcurementLine", () => {
  it("returns false for machine-only approved-looking rows", () => {
    expect(
      isTrustedProcurementLine({
        review_status: "approved",
        decision_source: "system",
        human_decided_at: null,
        human_decided_by: null,
        catalog_product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      })
    ).toBe(false);
  });

  it("returns false when catalog_product_id missing", () => {
    expect(
      isTrustedProcurementLine({
        review_status: "approved",
        decision_source: "operator",
        human_decided_at: "2026-01-01T00:00:00Z",
        human_decided_by: "user-1",
        catalog_product_id: null,
      })
    ).toBe(false);
  });

  it("returns true only when all strict fields satisfied", () => {
    expect(
      isTrustedProcurementLine({
        review_status: "approved",
        decision_source: "operator",
        human_decided_at: "2026-01-01T00:00:00Z",
        human_decided_by: "user-1",
        catalog_product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      })
    ).toBe(true);
  });

  it("returns false for operator no_match confirmations (no catalog id)", () => {
    expect(
      isTrustedProcurementLine({
        review_status: "no_match",
        decision_source: "operator",
        human_decided_at: "2026-01-01T00:00:00Z",
        human_decided_by: "user-1",
        catalog_product_id: null,
      })
    ).toBe(false);
  });
});
