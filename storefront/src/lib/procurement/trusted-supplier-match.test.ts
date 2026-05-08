import { describe, expect, it } from "vitest";
import { isTrustedSupplierMatch } from "@/lib/procurement/trusted-supplier-match";

describe("isTrustedSupplierMatch", () => {
  it("returns false when supplier id missing", () => {
    expect(
      isTrustedSupplierMatch({
        review_status: "approved",
        decision_source: "operator",
        reviewed_at: "2026-01-01T00:00:00Z",
        reviewed_by: "u1",
        catalogos_supplier_id: null,
      })
    ).toBe(false);
  });

  it("returns false for machine supplier state", () => {
    expect(
      isTrustedSupplierMatch({
        review_status: "approved",
        decision_source: "system",
        reviewed_at: "2026-01-01T00:00:00Z",
        reviewed_by: "u1",
        catalogos_supplier_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      })
    ).toBe(false);
  });

  it("returns true only for strict operator-approved supplier", () => {
    expect(
      isTrustedSupplierMatch({
        review_status: "approved",
        decision_source: "operator",
        reviewed_at: "2026-01-01T00:00:00Z",
        reviewed_by: "u1",
        catalogos_supplier_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      })
    ).toBe(true);
  });
});
