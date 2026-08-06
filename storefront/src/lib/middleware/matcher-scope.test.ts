import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { middlewareShouldRun, MIDDLEWARE_MATCHER } from "./matcher-scope";

describe("middleware matcher scope (emergency containment)", () => {
  it("does not match anonymous marketing / catalog / static paths", () => {
    for (const path of [
      "/",
      "/store",
      "/store/p/example",
      "/store?brand=x",
      "/industries",
      "/industries/healthcare",
      "/glove-finder",
      "/compare-wizard",
      "/invoice-savings",
      "/request-pricing",
      "/quote-cart",
      "/robots.txt",
      "/sitemap.xml",
      "/favicon.ico",
      "/_next/static/example.js",
      "/images/logo.png",
      "/api/gloves/recommend",
      "/api/contact",
      "/api/invoice/intake",
    ]) {
      expect(middlewareShouldRun(path), path).toBe(false);
    }
  });

  it("matches account, workspace, admin, and authenticated API prefixes", () => {
    for (const path of [
      "/account",
      "/account/settings",
      "/account/orders/abc",
      "/workspace",
      "/workspace/procurement",
      "/admin",
      "/admin/products",
      "/admin/api/products/export",
      "/api/account/shipping-addresses",
      "/api/auth/post-login-destination",
      "/api/customer/procurement/actions",
      "/api/workspace/procurement/active-company",
      "/api/internal/anything",
    ]) {
      expect(middlewareShouldRun(path), path).toBe(true);
    }
  });

  it("exports explicit Next matcher prefixes (no near-global catch-all)", () => {
    expect(MIDDLEWARE_MATCHER.some((m) => m.includes("(?!"))).toBe(false);
    expect(MIDDLEWARE_MATCHER).toContain("/account");
    expect(MIDDLEWARE_MATCHER).toContain("/account/:path*");
    expect(MIDDLEWARE_MATCHER).toContain("/workspace/:path*");
    expect(MIDDLEWARE_MATCHER).toContain("/admin/:path*");
    expect(MIDDLEWARE_MATCHER).toContain("/api/auth/:path*");
  });

  it("middleware.ts config.matcher stays in sync with MIDDLEWARE_MATCHER", () => {
    const raw = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");
    for (const entry of MIDDLEWARE_MATCHER) {
      expect(raw).toContain(`"${entry}"`);
    }
    expect(raw).not.toContain("(?!");
  });
});
