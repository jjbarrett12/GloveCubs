import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin import redirects", () => {
  it("redirects /admin/imports to /admin/products/import", () => {
    const p = join(__dirname, "imports/page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('redirect("/admin/products/import")');
  });

  it("redirects /admin/product-import to /admin/products/import", () => {
    const p = join(__dirname, "product-import/page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('redirect("/admin/products/import")');
  });
});
