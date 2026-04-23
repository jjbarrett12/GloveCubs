import { describe, it, expect } from "vitest";
import { validateUuidParam, validateOfferAdminPatch } from "./commerce-validation";

describe("commerce-validation", () => {
  describe("validateUuidParam", () => {
    it("accepts valid UUID", () => {
      expect(validateUuidParam("offer_id", "550e8400-e29b-41d4-a716-446655440000")).toBeNull();
    });
    it("rejects invalid", () => {
      expect(validateUuidParam("product_id", "not-a-uuid")).toMatch(/Invalid product_id/);
    });
  });

  describe("validateOfferAdminPatch", () => {
    it("accepts empty patch", () => {
      expect(validateOfferAdminPatch({})).toEqual({ ok: true });
    });
    it("rejects bad cost", () => {
      expect(validateOfferAdminPatch({ cost: -1 }).ok).toBe(false);
      expect(validateOfferAdminPatch({ cost: NaN }).ok).toBe(false);
    });
    it("accepts null sell_price", () => {
      expect(validateOfferAdminPatch({ sell_price: null })).toEqual({ ok: true });
    });
    it("rejects fractional lead_time_days", () => {
      expect(validateOfferAdminPatch({ lead_time_days: 1.5 }).ok).toBe(false);
    });
  });
});
