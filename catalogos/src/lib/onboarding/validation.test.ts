import { describe, it, expect } from "vitest";
import { validateReadyForReview, validateCanCreateSupplier } from "./validation";
import type { SupplierOnboardingRequestRow } from "./types";

describe("onboarding validation", () => {
  const baseRequest: SupplierOnboardingRequestRow = {
    id: "id",
    company_name: "Acme",
    website: "https://acme.com",
    contact_info: {},
    feed_type: "url",
    feed_url: "https://acme.com/feed.csv",
    feed_config: {},
    pricing_basis_hints: null,
    packaging_hints: null,
    categories_supplied: [],
    notes: null,
    status: "initiated",
    source_lead_id: null,
    assigned_owner_id: null,
    created_supplier_id: null,
    created_feed_id: null,
    created_at: "",
    updated_at: "",
  };

  describe("validateReadyForReview", () => {
    it("valid when company_name and feed_url present", () => {
      const r = validateReadyForReview(baseRequest);
      expect(r.valid).toBe(true);
      expect(r.missing).toHaveLength(0);
    });

    it("invalid when company_name missing", () => {
      const r = validateReadyForReview({ ...baseRequest, company_name: "" });
      expect(r.valid).toBe(false);
      expect(r.missing).toContain("company_name");
    });

    it("invalid when feed_url and feed_config.url missing", () => {
      const r = validateReadyForReview({ ...baseRequest, feed_url: null, feed_config: {} });
      expect(r.valid).toBe(false);
      expect(r.missing).toContain("feed_url or feed config");
    });

    it("valid when feed_config has url", () => {
      const r = validateReadyForReview({
        ...baseRequest,
        feed_url: null,
        feed_config: { url: "https://example.com/feed.csv" },
      });
      expect(r.valid).toBe(true);
    });
  });

  describe("validateCanCreateSupplier", () => {
    it("valid when status approved and company_name present", () => {
      const r = validateCanCreateSupplier({ ...baseRequest, status: "approved" });
      expect(r.valid).toBe(true);
    });

    it("valid when already has created_supplier_id", () => {
      const r = validateCanCreateSupplier({
        ...baseRequest,
        status: "created_supplier",
        created_supplier_id: "sup-1",
      });
      expect(r.valid).toBe(true);
    });

    it("invalid when status not approved", () => {
      const r = validateCanCreateSupplier({ ...baseRequest, status: "initiated" });
      expect(r.valid).toBe(false);
      expect(r.missing.some((m) => m.includes("status"))).toBe(true);
    });
  });
});
