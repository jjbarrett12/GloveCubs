import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 1C-ops slice 3 — net terms BFF", () => {
  it("GET applications requires operator and calls Express", () => {
    const s = read("applications/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("fetchAdminNetTermsApplicationsFromExpress");
    expect(s).toContain("net_terms_list");
    const lib = readFileSync(join(__dirname, "../../../../lib/admin/admin-net-terms-express.ts"), "utf8");
    expect(lib).toContain("/api/admin/net-terms/applications");
  });

  it("PATCH application proxies Express with action", () => {
    const s = read("applications/[applicationId]/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain('method: "PATCH"');
    expect(s).toContain("net_terms_patch");
    expect(s).toContain("approve");
    expect(s).toContain("deny");
  });

  it("net-terms page uses Express fetch helper", () => {
    const page = readFileSync(join(__dirname, "../../net-terms/page.tsx"), "utf8");
    expect(page).toContain("fetchAdminNetTermsApplicationsFromExpress");
  });
});
