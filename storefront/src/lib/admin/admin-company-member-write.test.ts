import { describe, expect, it } from "vitest";
import {
  COMPANY_MEMBER_ROLES,
  normalizeBuyerEmail,
  normalizeMemberRole,
} from "./admin-company-member-write";

describe("admin-company-member-write validators", () => {
  it("accepts valid email", () => {
    expect(normalizeBuyerEmail(" Buyer@Example.COM ")).toBe("buyer@example.com");
  });

  it("rejects invalid email", () => {
    expect(() => normalizeBuyerEmail("not-an-email")).toThrow("invalid_email");
    expect(() => normalizeBuyerEmail("   ")).toThrow("invalid_email");
  });

  it("defaults role to member", () => {
    expect(normalizeMemberRole(undefined)).toBe("member");
  });

  it("rejects unsupported role", () => {
    expect(() => normalizeMemberRole("superadmin")).toThrow("invalid_role");
  });

  it("accepts supported roles", () => {
    for (const role of COMPANY_MEMBER_ROLES) {
      expect(normalizeMemberRole(role)).toBe(role);
    }
  });
});
