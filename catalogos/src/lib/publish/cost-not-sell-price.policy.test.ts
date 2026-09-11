import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../../");
const OFFER_SERVICE = path.resolve(ROOT, "catalogos/src/lib/ingestion/offer-service.ts");
const STAGING = path.resolve(ROOT, "catalogos/src/lib/services/publish/publish-staging-catalogos.ts");
const VARIANT_GROUP = path.resolve(ROOT, "catalogos/src/lib/publish/publish-variant-group.ts");
const PUBLISH = path.resolve(ROOT, "catalogos/src/lib/publish/publish-service.ts");
const MANUAL = path.resolve(ROOT, "storefront/src/lib/admin/product-write-manual-post-active.ts");
const REVIEW = path.resolve(ROOT, "catalogos/src/app/actions/review.ts");
const DISCONTINUED = path.resolve(ROOT, "catalogos/src/lib/catalog-expansion/discontinued-service.ts");

describe("ingest/publish must not copy cost into sell_price", () => {
  it("offer-service omits ingest sell_price instead of copying cost", () => {
    const src = readFileSync(OFFER_SERVICE, "utf8");
    expect(src).toContain("omitUnapprovedSellPriceFromOfferWrite");
    expect(src).not.toMatch(/sell_price:\s*input\.cost/);
  });

  it("staging publish omits sell_price and does not persist computeSellPrice", () => {
    const src = readFileSync(STAGING, "utf8");
    expect(src).toContain("omitUnapprovedSellPriceFromOfferWrite");
    expect(src).not.toMatch(/sell_price:\s*cost/);
    expect(src).not.toContain("computeSellPrice");
  });

  it("variant-group publish omits sell_price instead of copying cost", () => {
    const src = readFileSync(VARIANT_GROUP, "utf8");
    expect(src).toContain("omitUnapprovedSellPriceFromOfferWrite");
    expect(src).not.toMatch(/sell_price:\s*Number\.isFinite\(cost\)/);
  });

  it("publish-service does not fall back sell_price to supplier_cost", () => {
    const src = readFileSync(PUBLISH, "utf8");
    expect(src).toContain("omitUnapprovedSellPriceFromOfferWrite");
    expect(src).not.toMatch(/overrideSellPrice\s*\?\?\s*input\.stagedContent\.supplier_cost/);
    expect(src).not.toMatch(/sell_price:\s*Number\.isFinite\(sellPrice\)/);
  });

  it("manual post-active does not copy casePrice into sell_price", () => {
    const src = readFileSync(MANUAL, "utf8");
    expect(src).toContain("omitUnapprovedSellPriceFromOfferWrite");
    expect(src).not.toMatch(/sell_price:\s*args\.casePrice/);
  });

  it("review offer patch does not fill null sell_price from cost", () => {
    const src = readFileSync(REVIEW, "utf8");
    expect(src).not.toMatch(/:\s*nextCost;\s*\n\s*const base[\s\S]*sell_price:\s*nextSell/);
    expect(src).not.toMatch(/const nextSell = r\.sell_price != null \? Number\(r\.sell_price\) : nextCost/);
  });

  it("discontinue does not fill null sell_price from cost", () => {
    const src = readFileSync(DISCONTINUED, "utf8");
    expect(src).not.toMatch(/const nextSell = r\.sell_price != null \? Number\(r\.sell_price\) : nextCost/);
  });
});
