import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("admin leads & opportunities auth", () => {
  it("leads page does not use ADMIN_LEADS_SECRET", () => {
    const s = readFileSync(join(__dirname, "leads/page.tsx"), "utf8");
    expect(s).not.toContain("ADMIN_LEADS_SECRET");
  });

  it("opportunities page does not use ADMIN_LEADS_SECRET", () => {
    const s = readFileSync(join(__dirname, "opportunities/page.tsx"), "utf8");
    expect(s).not.toContain("ADMIN_LEADS_SECRET");
  });
});
