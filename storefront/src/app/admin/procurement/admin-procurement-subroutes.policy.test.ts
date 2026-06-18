import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PROCUREMENT_DIR = join(__dirname);

function read(rel: string): string {
  return readFileSync(join(PROCUREMENT_DIR, rel), "utf8");
}

const PHASE_6B_FILES = [
  "company/[companyId]/page.tsx",
  "company/[companyId]/queue/page.tsx",
  "company/[companyId]/blocked/page.tsx",
  "company/[companyId]/spend/page.tsx",
  "company/[companyId]/suppliers/page.tsx",
  "company/[companyId]/reorder/page.tsx",
  "opportunity/[opportunityId]/page.tsx",
  "ReviewQueueRow.tsx",
  "ApprovedReorderRow.tsx",
  "ReorderMemoryRow.tsx",
  "_ProcurementTableShell.tsx",
  "_ProcurementDetailUi.tsx",
];

const BANNED_LIGHT_PATTERNS = [
  /\bbg-white\b/,
  /\bbg-slate-50\b/,
  /\bborder-slate-200\b/,
  /\btext-gray-500\b/,
  /\bbg-red-50\b/,
  /\bbg-yellow-50\b/,
  /\bbg-green-50\b/,
  /\bbg-amber-50\b/,
  /\bbg-emerald-50\b/,
];

describe("Admin Phase 6B procurement sub-routes", () => {
  for (const file of PHASE_6B_FILES) {
    it(`${file} avoids banned light-only surface patterns`, () => {
      const s = read(file);
      for (const pattern of BANNED_LIGHT_PATTERNS) {
        expect(s, `${file} ${String(pattern)}`).not.toMatch(pattern);
      }
    });
  }

  it("procurement company hub links to sub-routes", () => {
    const hub = read("company/[companyId]/page.tsx");
    expect(hub).toContain("/queue");
    expect(hub).toContain("/blocked");
    expect(hub).toContain("/spend");
    expect(hub).toContain("/suppliers");
    expect(hub).toContain("/reorder");
  });

  it("review queue row links to opportunity spine route", () => {
    const row = read("ReviewQueueRow.tsx");
    expect(row).toContain("/admin/procurement/opportunity/");
  });

  it("procurement UI does not expose JWT_SECRET or NEXT_PUBLIC_GLOVECUBS_API", () => {
    for (const file of PHASE_6B_FILES) {
      const s = read(file);
      expect(s, file).not.toContain("JWT_SECRET");
      expect(s, file).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
    }
  });

  it("opportunity detail uses tokenized section card and events table", () => {
    const page = read("opportunity/[opportunityId]/page.tsx");
    expect(page).toContain("PremiumSectionCard");
    expect(page).toContain("ProcurementEventsTable");
    expect(page).toContain("ErrorState");
  });
});
