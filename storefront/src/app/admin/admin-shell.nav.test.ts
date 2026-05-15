import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("AdminShell navigation", () => {
  it("includes core IA routes", () => {
    const p = join(__dirname, "_components/AdminShell.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('href: "/admin"');
    expect(s).toContain('href: "/admin/products"');
    expect(s).not.toContain('href: "/admin/imports"');
    expect(s).not.toContain('href: "/admin/catalog"');
    expect(s).toContain('href: "/admin/leads"');
    expect(s).toContain('href: "/admin/orders"');
    expect(s).toContain('href: "/admin/companies"');
    expect(s).toContain('href: "/admin/settings"');
  });
});
