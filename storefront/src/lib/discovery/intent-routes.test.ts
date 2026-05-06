import { describe, expect, it } from "vitest";
import { parseStoreCatalogParams } from "@/lib/catalog/store-url";
import { DISCOVERY_INTENTS } from "@/config/intents";
import { REQUEST_PRICING_QUERY_KEYS } from "@/lib/discovery/request-pricing-url";
import {
  getRequestPricingHrefForIntent,
  getStoreHrefForIntent,
  isKnownIntentId,
  resolveIntentToRfqParams,
  resolveIntentToStoreParams,
} from "@/lib/discovery/intent-routes";
import { buildRequestPricingHref } from "@/lib/discovery/request-pricing-url";

describe("intent-routes", () => {
  it("round-trips store intents through parseStoreCatalogParams", () => {
    for (const [intentId, def] of Object.entries(DISCOVERY_INTENTS)) {
      if (!def.store || Object.keys(def.store).length === 0) continue;
      const href = getStoreHrefForIntent(intentId);
      if (href === "/store") continue;
      const qs = href.startsWith("/store?") ? href.slice("/store".length) : "";
      const parsed = parseStoreCatalogParams(
        Object.fromEntries(new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs))
      );
      const { page: _p, limit: _l, sort: _s, ...minimal } = parsed;
      void _p;
      void _l;
      void _s;
      for (const [k, v] of Object.entries(def.store)) {
        expect((minimal as Record<string, unknown>)[k]).toEqual(v);
      }
    }
  });

  it("emits only allowed RFQ keys", () => {
    const href = getRequestPricingHrefForIntent("rfq.store.tile.nitrile_exam");
    const u = new URL(href, "https://example.com");
    const allowed = REQUEST_PRICING_QUERY_KEYS as readonly string[];
    for (const key of Array.from(u.searchParams.keys())) {
      expect(allowed.includes(key)).toBe(true);
    }
  });

  it("buildRequestPricingHref drops unknown keys", () => {
    const href = buildRequestPricingHref({
      industry: "healthcare",
      evil: "nope",
    } as Record<string, string>);
    expect(href).toContain("industry=healthcare");
    expect(href).not.toContain("evil");
  });

  it("unknown intent store href falls back to /store", () => {
    expect(isKnownIntentId("not-a-real-intent")).toBe(false);
    expect(getStoreHrefForIntent("not-a-real-intent")).toBe("/store");
    expect(resolveIntentToStoreParams("not-a-real-intent")).toEqual({});
  });

  it("resolves RFQ params for known intents", () => {
    expect(resolveIntentToRfqParams("rfq.store.tile.janitorial")).toEqual({ industry: "janitorial" });
  });
});
