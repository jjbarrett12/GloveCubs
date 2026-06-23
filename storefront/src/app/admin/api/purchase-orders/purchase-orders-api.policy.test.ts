import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 2c — purchase orders BFF (Supabase-native)", () => {
  it("GET purchase-orders requires operator and uses native list", () => {
    const s = read("route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("fetchAdminPurchaseOrders");
    expect(s).toContain("purchase_orders_list");
    expect(s).not.toContain("fetchAdminPurchaseOrdersFromExpress");
    expect(s).not.toContain("expressAdminFetch");
  });

  it("send route uses native send with operator gate", () => {
    const s = read("[poId]/send/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("sendAdminPurchaseOrder");
    expect(s).toContain("operator.id");
    expect(s).toContain("purchase_order_send");
    expect(s).not.toContain("expressAdminFetch");
  });

  it("receive route uses native receive with operator gate", () => {
    const s = read("[poId]/receive/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("receiveAdminPurchaseOrder");
    expect(s).toContain("operator.id");
    expect(s).toContain("purchase_order_receive");
    expect(s).toContain("code: result.code");
    expect(s).not.toContain("expressAdminFetch");
  });

  it("PO actions use Next BFF only", () => {
    const s = readFileSync(join(__dirname, "../../purchase-orders/PoRowActions.tsx"), "utf8");
    expect(s).toContain("/admin/api/purchase-orders/");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });
});
