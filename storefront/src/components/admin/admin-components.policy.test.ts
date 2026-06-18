import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminStatusBadgeClasses, adminStatusTone } from "./admin-theme-utils";

const COMPONENTS_DIR = __dirname;

function readComponent(name: string): string {
  return readFileSync(join(COMPONENTS_DIR, name), "utf8");
}

const LIGHT_ONLY_PATTERNS = [
  /\bbg-white\b/,
  /\bbg-slate-50\b/,
  /\bbg-gray-50\b/,
  /\btext-slate-900\b/,
  /\btext-gray-500\b/,
  /\bborder-slate-200\b/,
];

const PASTEL_BADGE_PATTERNS = [
  /\bbg-red-50\b/,
  /\bbg-green-50\b/,
  /\bbg-yellow-50\b/,
  /\bbg-emerald-50\b/,
  /\bbg-amber-50\b/,
  /\btext-red-700\b/,
];

describe("Admin shared components theme policy", () => {
  it("DataTable uses admin semantic table tokens, not light-only shell classes", () => {
    const s = readComponent("DataTable.tsx");
    expect(s).toContain("adminTableShell");
    expect(s).toContain("adminTableHead");
    expect(s).toContain("adminTableBody");
    expect(s).toContain("adminCardSurface");
    expect(s).not.toMatch(/\bbg-white\b/);
    expect(s).not.toMatch(/\bbg-gray-50\b/);
    expect(s).not.toMatch(/\btext-gray-500\b/);
    expect(s).not.toMatch(/\bborder-slate-200\b/);
    expect(s).not.toMatch(/\bhover:bg-blue-50\b/);
  });

  it("StatusBadge uses semantic admin status tokens, not pastel light-only colors", () => {
    const s = readComponent("StatusBadge.tsx");
    expect(s).toContain("adminStatusBadgeClasses");
    expect(s).toContain("adminStatusTone");
    for (const pattern of PASTEL_BADGE_PATTERNS) {
      expect(s).not.toMatch(pattern);
    }
  });

  it("PremiumSectionCard renders theme-safe surface and text tokens", () => {
    const s = readComponent("PremiumSectionCard.tsx");
    expect(s).toContain("adminCardSurface");
    expect(s).toContain("text-admin-primary");
    expect(s).toContain("border-admin-border-subtle");
    expect(s).not.toMatch(/\bbg-white\b/);
    expect(s).not.toMatch(/\bborder-slate-200\b/);
  });

  it("PlaceholderPanel renders theme-safe muted panel tokens", () => {
    const s = readComponent("PlaceholderPanel.tsx");
    expect(s).toContain("adminMutedPanel");
    expect(s).toContain("text-admin-muted");
    expect(s).not.toMatch(/\bbg-slate-50\b/);
    expect(s).not.toMatch(/\bborder-slate-200\b/);
  });

  it("admin-theme-utils exposes table and badge helpers", () => {
    const s = readComponent("admin-theme-utils.ts");
    expect(s).toContain("adminTableShell");
    expect(s).toContain("adminStatusBadgeClasses");
    expect(s).toContain("adminStatusTone");
    expect(s).toContain("adminMutedPanel");
    expect(s).toContain("adminAlertSurface");
  });
});

describe("adminStatusTone mapping", () => {
  it("maps common operational statuses to semantic categories", () => {
    expect(adminStatusTone("completed")).toBe("success");
    expect(adminStatusTone("approved")).toBe("success");
    expect(adminStatusTone("paid")).toBe("success");
    expect(adminStatusTone("active")).toBe("success");

    expect(adminStatusTone("pending")).toBe("warning");
    expect(adminStatusTone("draft")).toBe("warning");
    expect(adminStatusTone("open")).toBe("warning");

    expect(adminStatusTone("failed")).toBe("danger");
    expect(adminStatusTone("rejected")).toBe("danger");
    expect(adminStatusTone("error")).toBe("danger");
    expect(adminStatusTone("cancelled")).toBe("neutral");

    expect(adminStatusTone("running")).toBe("info");
    expect(adminStatusTone("processing")).toBe("info");
    expect(adminStatusTone("blocked")).toBe("info");

    expect(adminStatusTone("unknown_status")).toBe("neutral");
  });

  it("adminStatusBadgeClasses returns translucent semantic ring styles", () => {
    expect(adminStatusBadgeClasses("success")).toContain("bg-admin-success/15");
    expect(adminStatusBadgeClasses("warning")).toContain("text-admin-warning");
    expect(adminStatusBadgeClasses("danger")).toContain("ring-admin-danger/30");
    expect(adminStatusBadgeClasses("info")).toContain("bg-admin-info/15");
    expect(adminStatusBadgeClasses("neutral")).toContain("bg-admin-surface-muted");
  });
});
