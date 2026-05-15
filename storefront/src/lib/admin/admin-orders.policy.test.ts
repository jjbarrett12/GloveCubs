import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const banned = ["revenue", "margin", "profit", "gmv"] as const;

function read(relFromStorefront: string): string {
  return readFileSync(join(__dirname, relFromStorefront), "utf8");
}

describe("Phase 2a admin orders (read-only, honest copy)", () => {
  it("admin order list page avoids finance-truth language", () => {
    const s = read("../../app/admin/orders/page.tsx").toLowerCase();
    for (const w of banned) {
      expect(s).not.toContain(w);
    }
    expect(s).toContain("order records");
    expect(s).toContain("canonical");
  });

  it("admin order detail page avoids finance-truth language", () => {
    const s = read("../../app/admin/orders/[orderId]/page.tsx").toLowerCase();
    for (const w of banned) {
      expect(s).not.toContain(w);
    }
    expect(s).toContain("read-only");
  });

  it("admin orders read model stays schema-read-only", () => {
    const s = read("admin-orders-read-model.ts");
    expect(s).toContain('.schema("gc_commerce")');
    expect(s).toContain('.from("orders")');
    expect(s).toContain('from("order_lines")');
    expect(s).toContain('from("legacy_order_map")');
    expect(s).not.toMatch(/\.insert\(/);
    expect(s).not.toMatch(/\.update\(/);
    expect(s).not.toMatch(/\.upsert\(/);
  });
});

describe("Phase 2a buyer orders read model (tenant isolation)", () => {
  it("scopes list and detail queries by company_id from gate", () => {
    const s = read("../account/buyer-orders-read-model.ts");
    const matches = s.match(/\.eq\("company_id", companyId\)/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("exposes feature flag helper for server gating", () => {
    const s = read("../account/buyer-orders-read-model.ts");
    expect(s).toContain("FEATURE_GC_ORDER_HISTORY");
    expect(s).toContain("isGcOrderHistoryEnabled");
  });
});

describe("Phase 2a buyer account orders UI", () => {
  it("shell route documents unavailable state without fake rows", () => {
    const s = read("../../app/account/orders/page.tsx");
    expect(s).toContain("isGcOrderHistoryEnabled");
    expect(s).toContain("Order history is not available yet");
    expect(s).not.toMatch(/mock|fixture|sample order/i);
  });

  it("detail route re-checks company membership and order id shape", () => {
    const s = read("../../app/account/orders/[orderId]/page.tsx");
    expect(s).toContain("assertCustomerCompanyAccess");
    expect(s).toContain("fetchBuyerOrderDetailForCompany");
    expect(s).toContain("UUID_RE");
  });
});
