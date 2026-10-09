/**
 * Source/unit coverage for CatalogOS admin action gate used by onboarding signing.
 */
import { describe, expect, it } from "vitest";
import { evaluateCatalogosAdminAuth } from "@/lib/auth/catalogos-admin-auth";

describe("onboarding file signing auth prerequisites", () => {
  it("rejects missing credentials in production-like runtime", () => {
    const d = evaluateCatalogosAdminAuth({
      secret: "secret",
      bearer: "",
      cookieToken: "",
      apiKey: "",
      productionLike: true,
      allowInsecureDev: false,
      internalKey: null,
    });
    expect(d.ok).toBe(false);
  });

  it("accepts catalogos_admin cookie secret", () => {
    const d = evaluateCatalogosAdminAuth({
      secret: "secret",
      bearer: "",
      cookieToken: "secret",
      apiKey: "",
      productionLike: true,
      allowInsecureDev: false,
      internalKey: null,
    });
    expect(d.ok).toBe(true);
  });
});
