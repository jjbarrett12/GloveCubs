import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("middleware admin navigation policy", () => {
  it("does not gate /admin HTML with shared query secret", () => {
    const p = join(__dirname, "middleware.ts");
    const s = readFileSync(p, "utf8");
    expect(s).not.toContain("ADMIN_LEADS_SECRET");
    expect(s).not.toContain('searchParams.get("secret")');
    expect(s).not.toContain("relaxAdminPathGate");
  });
});
