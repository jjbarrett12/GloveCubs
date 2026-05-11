import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("admin products module auth posture", () => {
  it("products grid does not use shared-secret query params", () => {
    const s = readFileSync(join(__dirname, "products/page.tsx"), "utf8");
    expect(s).not.toMatch(/ADMIN_.*SECRET/);
    expect(s).not.toMatch(/x-gc-internal-secret/i);
  });

  it("product detail rejects non-UUID ids via ADMIN_PRODUCT_UUID_RE", () => {
    const s = readFileSync(join(__dirname, "products/[productId]/page.tsx"), "utf8");
    expect(s).toContain("ADMIN_PRODUCT_UUID_RE");
    expect(s).toContain("notFound()");
  });
});
