import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 1C-ops slice 2 — inventory BFF", () => {
  it("GET inventory requires operator and calls Express list", () => {
    const s = read("route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("fetchAdminInventoryFromExpress");
    expect(s).toContain("inventory_list");
  });

  it("POST adjust requires operator and proxies Express adjust", () => {
    const s = read("adjust/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("/api/admin/inventory/adjust");
    expect(s).toContain("inventory_adjust");
    expect(s).not.toContain("localStorage");
  });

  it("inventory page uses server-side Express fetch; adjust uses BFF", () => {
    const page = readFileSync(join(__dirname, "../../inventory/page.tsx"), "utf8");
    expect(page).toContain("fetchAdminInventoryFromExpress");
    const panel = readFileSync(join(__dirname, "../../inventory/InventoryAdjustPanel.tsx"), "utf8");
    expect(panel).toContain("/admin/api/inventory/adjust");
  });
});
