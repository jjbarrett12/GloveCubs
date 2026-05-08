import { describe, expect, it } from "vitest";
import { getCanonicalStoreHrefIfNeeded } from "@/lib/catalog/store-legacy-url";

function sp(obj: Record<string, string>): Record<string, string | string[] | undefined> {
  return obj;
}

describe("getCanonicalStoreHrefIfNeeded", () => {
  it("returns null for a clean /store?q= only URL", () => {
    expect(getCanonicalStoreHrefIfNeeded(sp({ q: "nitrile" }))).toBeNull();
  });

  it("strips dead industry param with 308 target via buildStoreCatalogHref", () => {
    const href = getCanonicalStoreHrefIfNeeded(sp({ q: "nitrile", industry: "hospitality" }));
    expect(href).toBe("/store?q=nitrile");
  });

  it("strips unknown params", () => {
    const href = getCanonicalStoreHrefIfNeeded(sp({ q: "foo", evil: "nope" } as Record<string, string>));
    expect(href).toBe("/store?q=foo");
  });

  it("does not redirect when already canonical (no loop)", () => {
    const clean = sp({ q: "nitrile", category: "nitrile-gloves" });
    expect(getCanonicalStoreHrefIfNeeded(clean)).toBeNull();
  });

  it("drops compliance_certifications from the visible URL (merged into certifications)", () => {
    const href = getCanonicalStoreHrefIfNeeded(sp({ compliance_certifications: "foo" }));
    expect(href).toBeTruthy();
    expect(href).not.toContain("compliance_certifications");
  });
});
