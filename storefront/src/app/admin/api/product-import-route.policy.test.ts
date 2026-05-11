import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("admin product-import API", () => {
  it("keeps POST disabled with 410", () => {
    const p = join(__dirname, "product-import/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toMatch(/status:\s*410/);
    expect(s).toContain("export async function POST");
  });
});
