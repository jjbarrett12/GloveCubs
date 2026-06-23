import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_DIR = __dirname;

function read(rel: string): string {
  return readFileSync(join(ADMIN_DIR, rel), "utf8");
}

const PHASE_6A_PAGES = [
  "leads/page.tsx",
  "opportunities/page.tsx",
  "procurement/page.tsx",
  "orders/page.tsx",
  "purchase-orders/page.tsx",
  "inventory/page.tsx",
  "users/page.tsx",
  "net-terms/page.tsx",
  "messages/page.tsx",
  "analytics/page.tsx",
  "catalog/page.tsx",
];

const PHASE_6A_HELPERS = [
  "leads/LeadsTable.tsx",
  "procurement/ProcurementTable.tsx",
  "purchase-orders/PurchaseOrdersTable.tsx",
  "purchase-orders/PoRowActions.tsx",
  "inventory/InventoryAdjustPanel.tsx",
  "users/UserRowActions.tsx",
  "net-terms/NetTermsActions.tsx",
];

const BANNED_LIGHT_PATTERNS = [
  /\bbg-white\b/,
  /\bbg-slate-50\b/,
  /\bborder-slate-200\b/,
  /\btext-gray-500\b/,
  /\bbg-red-50\b/,
  /\bbg-yellow-50\b/,
  /\bbg-green-50\b/,
];

const EXPRESS_PAGES: string[] = [];

const MODULE_LINKS = [
  "/admin/leads",
  "/admin/opportunities",
  "/admin/procurement",
  "/admin/orders",
  "/admin/purchase-orders",
  "/admin/inventory",
  "/admin/users",
  "/admin/net-terms",
  "/admin/messages",
  "/admin/analytics",
];

describe("Admin Phase 6A module page consistency", () => {
  for (const page of PHASE_6A_PAGES) {
    it(`${page} avoids banned light-only surface patterns`, () => {
      const s = read(page);
      for (const pattern of BANNED_LIGHT_PATTERNS) {
        expect(s, `${page} ${String(pattern)}`).not.toMatch(pattern);
      }
    });
  }

  for (const helper of PHASE_6A_HELPERS) {
    it(`${helper} avoids banned light-only surface patterns`, () => {
      const s = read(helper);
      for (const pattern of BANNED_LIGHT_PATTERNS) {
        expect(s, `${helper} ${String(pattern)}`).not.toMatch(pattern);
      }
    });
  }

  for (const page of EXPRESS_PAGES) {
    it(`${page} does not render JWT_SECRET or NEXT_PUBLIC_GLOVECUBS_API`, () => {
      const s = read(page);
      expect(s).not.toContain("JWT_SECRET");
      expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
      expect(s).toContain("ModuleUnavailableState");
    });
  }

  it("target module routes exist in admin shell navigation", () => {
    const shell = read("_components/AdminShell.tsx");
    for (const href of MODULE_LINKS) {
      expect(shell).toContain(href);
    }
  });

  it("leads page uses DataTable via LeadsTable", () => {
    const page = read("leads/page.tsx");
    expect(page).toContain("LeadsTable");
    expect(page).toContain("EmptyState");
    expect(page).toContain("ErrorState");
  });

  it("procurement page uses DataTable via ProcurementTable", () => {
    expect(read("procurement/page.tsx")).toContain("ProcurementTable");
  });

  it("purchase-orders page uses DataTable when data is available", () => {
    expect(read("purchase-orders/page.tsx")).toContain("PurchaseOrdersTable");
  });
});
