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

  it("sends non-admins to /account when no explicit next", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: false,
        safeNextPath: "/account",
        isActiveAdmin: false,
      }),
    ).toBe("/account");
  });
});
