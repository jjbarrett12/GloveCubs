import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 1C-ops slice 2 — purchase orders BFF", () => {
  it("GET purchase-orders requires operator and calls Express list", () => {
    const s = read("route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("fetchAdminPurchaseOrdersFromExpress");
    expect(s).toContain("purchase_orders_list");
  });

  it("send route proxies Express POST send", () => {
    const s = read("[poId]/send/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("/purchase-orders/");
    expect(s).toContain("/send");
    expect(s).toContain("purchase_order_send");
  });

  it("receive route proxies Express POST receive", () => {
    const s = read("[poId]/receive/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("/receive");
    expect(s).toContain("purchase_order_receive");
    expect(s).toContain("canonical_product_id");
  });

  it("PO actions use Next BFF only", () => {
    const s = readFileSync(join(__dirname, "../../purchase-orders/PoRowActions.tsx"), "utf8");
    expect(s).toContain("/admin/api/purchase-orders/");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });
});
