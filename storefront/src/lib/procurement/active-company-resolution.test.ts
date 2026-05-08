import { describe, expect, it } from "vitest";
import { computeActiveCompanyResolution } from "@/lib/procurement/repo-active-company-resolve";

describe("computeActiveCompanyResolution", () => {
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("single membership bootstraps when no stored active", () => {
    const r = computeActiveCompanyResolution({
      membershipIdsSorted: [a],
      storedActive: null,
    });
    expect(r.companyId).toBe(a);
    expect(r.requiresSelection).toBe(false);
    expect(r.bootstrapCompanyId).toBe(a);
  });

  it("single membership does not bootstrap when stored matches", () => {
    const r = computeActiveCompanyResolution({
      membershipIdsSorted: [a],
      storedActive: a,
    });
    expect(r.companyId).toBe(a);
    expect(r.bootstrapCompanyId).toBe(null);
  });

  it("multi membership requires selection when no stored", () => {
    const r = computeActiveCompanyResolution({
      membershipIdsSorted: [c, a, b],
      storedActive: null,
    });
    expect(r.companyId).toBe(null);
    expect(r.requiresSelection).toBe(true);
    expect(r.reason).toBe("requires_company_selection");
    expect(r.memberships).toEqual([a, b, c]);
  });

  it("multi membership resolves when stored is valid", () => {
    const r = computeActiveCompanyResolution({
      membershipIdsSorted: [a, b],
      storedActive: b,
    });
    expect(r.companyId).toBe(b);
    expect(r.requiresSelection).toBe(false);
  });

  it("ignores invalid stored for single membership and bootstraps active", () => {
    const r = computeActiveCompanyResolution({
      membershipIdsSorted: [a],
      storedActive: b,
    });
    expect(r.companyId).toBe(a);
    expect(r.bootstrapCompanyId).toBe(a);
  });

  it("no membership", () => {
    const r = computeActiveCompanyResolution({
      membershipIdsSorted: [],
      storedActive: null,
    });
    expect(r.companyId).toBe(null);
    expect(r.reason).toBe("no_membership");
  });
});
