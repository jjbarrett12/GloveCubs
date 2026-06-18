import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPANY_NOT_ACTIVE_BUYER_MESSAGE,
  filterActiveMembershipCompanyIds,
  isPortalActiveCompanyStatus,
} from "./customer-procurement-company-gate";
import { computeActiveCompanyResolution } from "@/lib/procurement/repo-active-company-resolve";
import { redirectsToAccountHub } from "./customer-procurement-session";

const activeCo = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const suspendedCo = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const archivedCo = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const missingCo = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("isPortalActiveCompanyStatus", () => {
  it("accepts active only", () => {
    expect(isPortalActiveCompanyStatus("active")).toBe(true);
    expect(isPortalActiveCompanyStatus("ACTIVE")).toBe(true);
  });

  it("rejects suspended, archived, and other statuses", () => {
    expect(isPortalActiveCompanyStatus("suspended")).toBe(false);
    expect(isPortalActiveCompanyStatus("archived")).toBe(false);
    expect(isPortalActiveCompanyStatus("inactive")).toBe(false);
    expect(isPortalActiveCompanyStatus("disabled")).toBe(false);
    expect(isPortalActiveCompanyStatus("pending")).toBe(false);
    expect(isPortalActiveCompanyStatus(null)).toBe(false);
  });
});

describe("filterActiveMembershipCompanyIds", () => {
  it("passes when membership is active", () => {
    const r = filterActiveMembershipCompanyIds([activeCo], [{ id: activeCo, status: "active" }]);
    expect(r.activeIds).toEqual([activeCo]);
    expect(r.allInactiveOrMissing).toBe(false);
  });

  it("fails when membership is suspended", () => {
    const r = filterActiveMembershipCompanyIds([suspendedCo], [{ id: suspendedCo, status: "suspended" }]);
    expect(r.activeIds).toEqual([]);
    expect(r.allInactiveOrMissing).toBe(true);
  });

  it("fails when membership is archived", () => {
    const r = filterActiveMembershipCompanyIds([archivedCo], [{ id: archivedCo, status: "archived" }]);
    expect(r.allInactiveOrMissing).toBe(true);
  });

  it("fails when company record is missing", () => {
    const r = filterActiveMembershipCompanyIds([missingCo], []);
    expect(r.hasMembership).toBe(true);
    expect(r.allInactiveOrMissing).toBe(true);
  });

  it("prefers active company when multiple memberships exist", () => {
    const r = filterActiveMembershipCompanyIds(
      [suspendedCo, activeCo],
      [
        { id: suspendedCo, status: "suspended" },
        { id: activeCo, status: "active" },
      ],
    );
    expect(r.activeIds).toEqual([activeCo]);
    expect(r.allInactiveOrMissing).toBe(false);
  });

  it("fails when multiple memberships are all non-active", () => {
    const r = filterActiveMembershipCompanyIds(
      [suspendedCo, archivedCo],
      [
        { id: suspendedCo, status: "suspended" },
        { id: archivedCo, status: "archived" },
      ],
    );
    expect(r.allInactiveOrMissing).toBe(true);
  });

  it("no membership stays non-membership at filter layer", () => {
    const r = filterActiveMembershipCompanyIds([], []);
    expect(r.hasMembership).toBe(false);
    expect(r.allInactiveOrMissing).toBe(false);
  });
});

describe("portal resolution with active-only memberships", () => {
  it("single active membership resolves ready", () => {
    const r = computeActiveCompanyResolution({
      membershipIdsSorted: [activeCo],
      storedActive: null,
    });
    expect(r.companyId).toBe(activeCo);
    expect(r.requiresSelection).toBe(false);
  });

  it("multiple active memberships require selection", () => {
    const r = computeActiveCompanyResolution({
      membershipIdsSorted: [activeCo, suspendedCo],
      storedActive: null,
    });
    expect(r.requiresSelection).toBe(true);
  });
});

describe("redirectsToAccountHub", () => {
  it("includes company_not_active distinct from ready", () => {
    expect(
      redirectsToAccountHub({ kind: "company_not_active", userId: "user-1" }),
    ).toBe(true);
    expect(
      redirectsToAccountHub({ kind: "no_membership", userId: "user-1" }),
    ).toBe(true);
    expect(
      redirectsToAccountHub({
        kind: "ready",
        session: { userId: "user-1", companyId: activeCo },
      }),
    ).toBe(false);
  });
});

describe("buyer messaging", () => {
  it("uses safe inactive-company copy", () => {
    expect(COMPANY_NOT_ACTIVE_BUYER_MESSAGE).toContain("not active");
    expect(COMPANY_NOT_ACTIVE_BUYER_MESSAGE).not.toContain("suspended");
  });
});

describe("customer-procurement-session policy", () => {
  it("gate module enforces company status before ready", () => {
    const src = readFileSyncSafe("src/lib/procurement/customer-procurement-session.ts");
    expect(src).toContain("company_not_active");
    expect(src).toContain("filterActiveMembershipCompanyIds");
    expect(src).toContain("isPortalActiveCompanyStatus");
    expect(src).not.toContain("is_approved");
  });

  it("post-login only sends buyers with ready gate to quote history", () => {
    const route = readFileSyncSafe("src/app/api/auth/post-login-destination/route.ts");
    expect(route).toContain('gate.kind === "ready"');
    expect(route).toContain("resolveCustomerProcurementGate");
  });

  it("login distinguishes company_inactive from no_membership", () => {
    const login = readFileSyncSafe("src/app/login/LoginClient.tsx");
    expect(login).toContain("company_inactive");
    expect(login).toContain("no_membership");
  });
});

function readFileSyncSafe(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}
