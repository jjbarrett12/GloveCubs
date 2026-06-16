import { describe, it, expect } from "vitest";
import { resolvePostLoginRedirectPath } from "./post-login-path";

describe("resolvePostLoginRedirectPath", () => {
  it("respects explicit safe next for admins", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: true,
        safeNextPath: "/workspace/procurement",
        isActiveAdmin: true,
      }),
    ).toBe("/workspace/procurement");
  });

  it("sends active admins to /admin when explicit next is request-pricing (not buyer RFQ intent)", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: true,
        safeNextPath: "/request-pricing",
        isActiveAdmin: true,
      }),
    ).toBe("/admin");
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: true,
        safeNextPath: "/request-pricing?source=homepage_bulk_builder",
        isActiveAdmin: true,
      }),
    ).toBe("/admin");
  });

  it("keeps request-pricing for non-admin when explicit next is set", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: true,
        safeNextPath: "/request-pricing",
        isActiveAdmin: false,
      }),
    ).toBe("/request-pricing");
  });

  it("respects explicit safe next for non-admins", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: true,
        safeNextPath: "/quote-cart",
        isActiveAdmin: false,
      }),
    ).toBe("/quote-cart");
  });

  it("sends admins to /admin when no explicit next", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: false,
        safeNextPath: "/account",
        isActiveAdmin: true,
      }),
    ).toBe("/admin");
  });

  it("sends linked buyers to quote history when buyerDefaultPath is set", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: false,
        safeNextPath: "/account",
        isActiveAdmin: false,
        buyerDefaultPath: "/account/quotes",
      }),
    ).toBe("/account/quotes");
  });

  it("sends non-admins to /account when no explicit next and no buyerDefaultPath override", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: false,
        safeNextPath: "/account",
        isActiveAdmin: false,
      }),
    ).toBe("/account");
  });
});
