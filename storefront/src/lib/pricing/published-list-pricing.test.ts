import { describe, expect, it } from "vitest";
import {
  grossMarginVsCost,
  isApprovedPublishedList,
  minimumSafePublishedList,
  paV2TierPricesFromList,
  publishedListApprovalInputValue,
  requireApprovedListToMap,
  usdMajorToCents,
  validatePublishedListApproval,
} from "@/lib/pricing/published-list-pricing";

describe("published list approval", () => {
  it("treats populated unverified sell_price as unpublished", () => {
    expect(isApprovedPublishedList({ sellPrice: 85, verifiedAt: null })).toBe(false);
    expect(isApprovedPublishedList({ sellPrice: 85, verifiedAt: "" })).toBe(false);
    expect(isApprovedPublishedList({ sellPrice: null, verifiedAt: "2026-09-11T00:00:00Z" })).toBe(false);
    expect(isApprovedPublishedList({ sellPrice: 0, verifiedAt: "2026-09-11T00:00:00Z" })).toBe(false);
    expect(isApprovedPublishedList({ sellPrice: 85, verifiedAt: "2026-09-11T00:00:00Z" })).toBe(true);
  });

  it("blocks MAP until list is approved", () => {
    expect(requireApprovedListToMap({ sellPrice: 85, verifiedAt: null })).toEqual({
      ok: false,
      reason: "list_unapproved",
    });
    expect(requireApprovedListToMap({ sellPrice: 151.79, verifiedAt: "2026-09-11T00:00:00Z" })).toEqual({
      ok: true,
    });
  });

  it("keeps Cub/Grizzly/Kodiak at 10/20/30 off list", () => {
    expect(paV2TierPricesFromList(100)).toEqual({ cub: 90, grizzly: 80, kodiak: 70 });
  });

  it("ceils the Kodiak 20% floor in cents so displayed min is approvable", () => {
    expect(minimumSafePublishedList(85)).toBe(151.79);
    expect(usdMajorToCents(151.79)).toBe(15179);
    expect(grossMarginVsCost(100, 40)).toEqual({ dollars: 60, percent: 60 });
  });
});

describe("validatePublishedListApproval (cost 85)", () => {
  it("rejects list 100 (below Kodiak 20% floor)", () => {
    const r = validatePublishedListApproval({ cost: 85, sellPrice: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("below_minimum_margin");
  });

  it("rejects list 85 (historical cost copy)", () => {
    const r = validatePublishedListApproval({ cost: 85, sellPrice: 85 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("below_minimum_margin");
  });

  it("rejects 151.78 (one cent under ceiled floor) and allows 151.79", () => {
    expect(validatePublishedListApproval({ cost: 85, sellPrice: 151.78 }).ok).toBe(false);
    const ok = validatePublishedListApproval({ cost: 85, sellPrice: 151.79 });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.minimumSafeList).toBe(151.79);
      expect(ok.kodiak).toBe(106.25);
    }
  });

  it("rejects missing, zero, and invalid landed cost", () => {
    expect(validatePublishedListApproval({ cost: null, sellPrice: 200 }).ok).toBe(false);
    expect(validatePublishedListApproval({ cost: 0, sellPrice: 200 }).ok).toBe(false);
    expect(validatePublishedListApproval({ cost: Number.NaN, sellPrice: 200 }).ok).toBe(false);
    for (const r of [
      validatePublishedListApproval({ cost: null, sellPrice: 200 }),
      validatePublishedListApproval({ cost: 0, sellPrice: 200 }),
      validatePublishedListApproval({ cost: Number.NaN, sellPrice: 200 }),
    ]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("landed_cost_required");
    }
  });

  it("rejects invalid list when cost is present", () => {
    const r = validatePublishedListApproval({ cost: 85, sellPrice: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("list_invalid");
  });
});

describe("approval input prefill", () => {
  it("does not prefill unverified sell_price as the approval draft", () => {
    const v = publishedListApprovalInputValue({ sellPrice: 85, verifiedAt: null, cost: 85 });
    expect(v.unverifiedExistingList).toBe(85);
    expect(v.input).toBe("151.79");
    expect(v.input).not.toBe("85");
  });

  it("shows an already-approved list in the input; re-approve still needs the floor", () => {
    const v = publishedListApprovalInputValue({
      sellPrice: 151.79,
      verifiedAt: "2026-09-11T00:00:00Z",
      cost: 85,
    });
    expect(v.unverifiedExistingList).toBeNull();
    expect(v.input).toBe("151.79");
    expect(validatePublishedListApproval({ cost: 85, sellPrice: Number(v.input) }).ok).toBe(true);
    expect(validatePublishedListApproval({ cost: 85, sellPrice: 100 }).ok).toBe(false);
  });
});
