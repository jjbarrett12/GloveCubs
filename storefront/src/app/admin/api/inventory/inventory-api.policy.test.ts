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

  it("POST adjust requires operator and uses native adjust", () => {
    const s = read("adjust/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("adjustAdminInventory");
    expect(s).toContain("inventory_adjust");
    expect(s).not.toContain("expressAdminFetch");
    expect(s).not.toContain("localStorage");
  });

  it("inventory page uses server-side Supabase fetch; adjust uses BFF", () => {
    const page = readFileSync(join(__dirname, "../../inventory/page.tsx"), "utf8");
    expect(page).toContain("fetchAdminInventory");
    expect(page).not.toContain("fetchAdminInventoryFromExpress");
    expect(page).not.toContain("JWT_SECRET");
    expect(page).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
    const panel = readFileSync(join(__dirname, "../../inventory/InventoryAdjustPanel.tsx"), "utf8");
    expect(panel).toContain("/admin/api/inventory/adjust");
  });
});
