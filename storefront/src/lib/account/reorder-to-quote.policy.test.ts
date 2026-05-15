import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 2b reorder-to-quote (policy)", () => {
  it("read-model validates order with company_id and does not write orders", () => {
    const s = read("reorder-to-quote-read-model.ts");
    expect(s).toContain('.eq("company_id", companyId)');
    expect(s).toContain('.eq("order_id", orderId)');
    expect(s).not.toMatch(/\.insert\(/);
    expect(s).not.toMatch(/\.update\(/);
    expect(s).not.toMatch(/\.upsert\(/);
    expect(s).toContain('from("orders")');
  });

  it("API route uses buyer gate and feature flag check", () => {
    const s = read("../../app/api/account/reorder-quote-lines/route.ts");
    expect(s).toContain("resolveCustomerProcurementGate");
    expect(s).toContain("assertCustomerCompanyAccess");
    expect(s).toContain("isGcReorderToQuoteEnabled");
    expect(s).not.toContain("checkout");
  });

  it("buyer reorder flag helper reads env vars", () => {
    const s = read("buyer-orders-read-model.ts");
    expect(s).toContain("FEATURE_GC_REORDER_TO_QUOTE");
    expect(s).toContain("isGcReorderToQuoteEnabled");
  });

  it("quote cart session key is display-only constant", () => {
    const s = read("../quote-cart/reorder-source-session.ts");
    expect(s).toContain("glovecubs-reorder-source-v1");
    expect(s).toContain("sessionStorage");
  });

  it("quote cart page mentions quote request not checkout for reorder banner", () => {
    const s = read("../../app/quote-cart/page.tsx").toLowerCase();
    expect(s).toContain("started from order");
    expect(s).not.toMatch(/checkout.*reorder|reorder.*checkout/);
    expect(s).toContain("quote request");
  });

  it("reorder API response shape avoids current price from historical minor", () => {
    const s = read("reorder-to-quote-read-model.ts");
    expect(s).toContain("historicalUnitPriceMinor");
    expect(s).toContain("ReorderQuoteCartLine");
    expect(s).not.toMatch(/unit_price_minor:\s*.*cart/);
  });
});
