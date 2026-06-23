import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("warehouse inventory module", () => {
  it("inventory page uses tabbed variant warehouse view", () => {
    const s = read("page.tsx");
    expect(s).toContain("fetchAdminWarehouseInventory");
    expect(s).toContain("InventoryModuleClient");
  });

  it("adjust route accepts catalog_variant_id with required reason", () => {
    const s = read("../api/inventory/adjust/route.ts");
    expect(s).toContain("catalog_variant_id");
    expect(s).toContain("adjustAdminVariantInventory");
    expect(s).toContain("reason: z.string().min(1)");
  });

  it("receive route uses shipment atomic RPC fields", () => {
    const s = read("../api/purchase-orders/[poId]/receive/route.ts");
    expect(s).toContain("catalog_variant_id");
    expect(s).toContain("idempotency_key");
  });

  it("PO row actions link to receive screen", () => {
    const s = read("../purchase-orders/PoRowActions.tsx");
    expect(s).toContain("/admin/purchase-orders/");
    expect(s).toContain("Receive warehouse shipment");
    expect(s).not.toContain('run("receive")');
  });
});
