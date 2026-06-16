import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 1C-ops admin order BFF", () => {
  it("order PATCH route requires operator and proxies Express PUT", () => {
    const s = read("[orderId]/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("expressAdminFetch");
    expect(s).toContain("/api/admin/orders/");
    expect(s).toContain('method: "PUT"');
    expect(s).toContain("logAdminOrderMutation");
    expect(s).toContain("order_update");
    expect(s).not.toContain("localStorage");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("invoice-payment route proxies Express POST", () => {
    const s = read("[orderId]/invoice-payment/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("/invoice/payment");
    expect(s).toContain("invoice_payment");
  });

  it("create-po route proxies Express POST and forwards blocked_lines", () => {
    const s = read("[orderId]/create-po/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("/create-po");
    expect(s).toContain("blocked_lines");
    expect(s).toContain("create_po");
  });

  it("bridge mints JWT server-side only", () => {
    const s = readFileSync(join(__dirname, "../../../../lib/admin/express-admin-bridge.ts"), "utf8");
    expect(s).toContain("jwt.sign");
    expect(s).toContain("JWT_SECRET");
    expect(s).toContain("Authorization");
    expect(s).toContain("buildExpressCommerceApiUrl");
  });

  it("operator actions call Next BFF only", () => {
    const s = readFileSync(join(__dirname, "../../orders/[orderId]/OrderOperatorActions.tsx"), "utf8");
    expect(s).toContain("/admin/api/orders/");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
    expect(s).not.toContain("localStorage");
    expect(s).not.toMatch(/api\.glovecubs/i);
  });
});
