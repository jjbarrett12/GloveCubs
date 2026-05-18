/**
 * Storefront pricing honesty — no client-side unit×case or tier math in contract hydrators.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const CONTRACTS = path.resolve(__dirname, "variant-pricing-contracts.ts");

describe("store pricing honesty — contract hydrators", () => {
  it("does not multiply unit price by pack qty in TypeScript", () => {
    const text = readFileSync(CONTRACTS, "utf8");
    expect(text).not.toMatch(/listUnitPriceMajor\s*\*/);
    expect(text).not.toMatch(/list_unit_price_major\s*\*/);
    expect(text).not.toMatch(/\(100\s*-\s*discount/);
    expect(text).not.toMatch(/discount_percent\s*\//);
  });
});
