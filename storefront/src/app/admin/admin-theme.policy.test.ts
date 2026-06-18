import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Admin theme foundation", () => {
  it("AdminThemeProvider applies data-admin-theme from resolved theme", () => {
    const s = read("_components/AdminThemeProvider.tsx");
    expect(s).toContain('data-admin-theme={resolved}');
    expect(s).toContain("ADMIN_THEME_STORAGE_KEY");
    expect(s).not.toContain("document.documentElement");
  });

  it("admin layout imports admin-theme.css only in admin tree", () => {
    const s = read("layout.tsx");
    expect(s).toContain("./admin-theme.css");
    expect(s).toContain("AdminThemeProvider");
  });

  it("admin-theme.css defines dark and light scoped tokens", () => {
    const s = read("admin-theme.css");
    expect(s).toContain('[data-admin-theme="dark"]');
    expect(s).toContain('[data-admin-theme="light"]');
    expect(s).toContain("--admin-canvas");
    expect(s).toContain("--admin-accent");
  });

  it("admin layout passes health summary to AdminShell", () => {
    const s = read("layout.tsx");
    expect(s).toContain("resolveAdminHealth");
    expect(s).toContain("health={{");
  });

  it("settings page includes Admin Health and Appearance sections", () => {
    const s = readFileSync(join(__dirname, "settings/page.tsx"), "utf8");
    expect(s).toContain('id="health"');
    expect(s).toContain("AdminThemeAppearanceSection");
    expect(s).toContain("Admin Health");
  });

  it("settings page avoids banned light-only surface patterns", () => {
    const s = readFileSync(join(__dirname, "settings/page.tsx"), "utf8");
    const banned = [
      /\bbg-white\b/,
      /\bbg-gray-50\b/,
      /\bbg-slate-50\b/,
      /\bbg-amber-50\b/,
      /\bborder-slate-200\b/,
      /\btext-gray-500\b/,
      /\btext-red-700\b/,
      /\btext-amber-700\b/,
      /\btext-green-700\b/,
    ];
    for (const pattern of banned) {
      expect(s, String(pattern)).not.toMatch(pattern);
    }
  });

  it("settings page does not expose JWT_SECRET or NEXT_PUBLIC_GLOVECUBS_API", () => {
    const s = readFileSync(join(__dirname, "settings/page.tsx"), "utf8");
    expect(s).not.toContain("JWT_SECRET");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("ModuleUnavailableState still does not render JWT_SECRET or NEXT_PUBLIC_GLOVECUBS_API", () => {
    const s = readFileSync(join(__dirname, "../../components/admin/ModuleUnavailableState.tsx"), "utf8");
    expect(s).not.toContain("JWT_SECRET");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });
});
