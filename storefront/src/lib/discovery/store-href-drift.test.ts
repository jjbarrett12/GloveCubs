import { describe, expect, it } from "vitest";
import { DISCOVERY_INTENTS } from "@/config/intents";
import { FOOTER_TOP_BRANDS } from "@/config/footerLinks";
import { HOME_BRAND_LIST } from "@/config/homeBrands";
import { getStoreHrefForBrandNav, getStoreHrefForIntent } from "@/lib/discovery/intent-routes";

const FORBIDDEN = ["industry=", "collection=", "powderFree=", "latexFree="] as const;

function assertStoreHrefClean(href: string) {
  if (!href.startsWith("/store")) return;
  for (const f of FORBIDDEN) {
    expect(href.includes(f), `${href} must not contain ${f}`).toBe(false);
  }
}

describe("store href drift — forbidden legacy query keys", () => {
  it("store intents from DISCOVERY_INTENTS", () => {
    for (const [id, def] of Object.entries(DISCOVERY_INTENTS)) {
      if (!def.store || Object.keys(def.store).length === 0) continue;
      assertStoreHrefClean(getStoreHrefForIntent(id));
    }
  });

  it("footer top brand links", () => {
    for (const b of FOOTER_TOP_BRANDS) {
      assertStoreHrefClean(b.href);
    }
  });

  it("home brand nav helper", () => {
    for (const name of HOME_BRAND_LIST) {
      assertStoreHrefClean(getStoreHrefForBrandNav(name));
    }
  });

  it("explicit catalogBrandId uses brand facet not forbidden keys", () => {
    assertStoreHrefClean(getStoreHrefForBrandNav("PIP", "00000000-0000-4000-8000-000000000001"));
  });
});
