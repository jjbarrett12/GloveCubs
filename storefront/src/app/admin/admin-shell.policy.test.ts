import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminShell Phase 3 policy", () => {
  const shellPath = join(__dirname, "_components/AdminShell.tsx");
  const s = readFileSync(shellPath, "utf8");

  it("uses admin semantic theme classes", () => {
    expect(s).toContain("bg-admin-canvas");
    expect(s).toContain("bg-admin-canvas-raised");
    expect(s).toContain("text-admin-primary");
    expect(s).toContain("border-admin-border");
    expect(s).toContain("bg-admin-accent-soft");
    expect(s).toContain("text-admin-accent");
  });

  it("avoids legacy light-only shell surfaces", () => {
    expect(s).not.toContain("bg-slate-50");
    expect(s).not.toMatch(/\bbg-white\b/);
    expect(s).not.toContain("text-slate-900");
  });

  it("includes AdminThemeToggle in the shell header", () => {
    expect(s).toContain("AdminThemeToggle");
    expect(s).toContain('variant="compact"');
  });

  it("includes Admin Health pill linking to settings", () => {
    expect(s).toContain("/admin/settings#health");
    expect(s).toContain("getAdminHealthShellDisplay");
    expect(s).not.toContain("JWT_SECRET");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("keeps nav group labels", () => {
    expect(s).toContain('title="Procurement"');
    expect(s).toContain('title="Fulfillment"');
    expect(s).toContain('title="Catalog"');
    expect(s).toContain('title="Customers"');
    expect(s).toContain('title="System"');
  });

  it("preserves isActive route matching", () => {
    expect(s).toContain("function isActive");
    expect(s).toContain('href === "/admin"');
  });
});
