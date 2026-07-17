import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 2b — inventory BFF (Supabase-native)", () => {
  it("GET inventory requires operator and uses native list", () => {
    const s = read("route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("fetchAdminInventory");
    expect(s).toContain("inventory_list");
    expect(s).not.toContain("fetchAdminInventoryFromExpress");
    expect(s).not.toContain("expressAdminFetch");
  });

  it("POST adjust requires operator and uses native variant adjust", () => {
    const s = read("adjust/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("adjustAdminVariantInventory");
    expect(s).toContain("adjustAdminInventory");
    expect(s).toContain("inventory_adjust");
    expect(s).not.toContain("expressAdminFetch");
    expect(s).not.toContain("localStorage");
  });

  it("inventory page uses variant warehouse fetch; adjust modal uses BFF", () => {
    const page = readFileSync(join(__dirname, "../../inventory/page.tsx"), "utf8");
    expect(page).toContain("fetchAdminWarehouseInventory");
    expect(page).not.toContain("fetchAdminInventoryFromExpress");
    expect(page).not.toContain("JWT_SECRET");
    expect(page).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
    const modal = readFileSync(join(__dirname, "../../inventory/InventoryAdjustModal.tsx"), "utf8");
    expect(modal).toContain("/admin/api/inventory/adjust");
    expect(modal).toContain("catalog_variant_id");
  });
});
