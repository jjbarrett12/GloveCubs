import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 2a — net terms admin (native Supabase)", () => {
  it("GET applications requires operator and uses native admin-net-terms service", () => {
    const s = read("applications/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("fetchAdminNetTermsApplications");
    expect(s).toContain("net_terms_list");
    expect(s).not.toContain("fetchAdminNetTermsApplicationsFromExpress");
    expect(s).not.toContain("expressAdminFetch");

    const lib = readFileSync(join(__dirname, "../../../../lib/admin/admin-net-terms.ts"), "utf8");
    expect(lib).toContain('.from("net_terms_applications")');
    expect(lib).not.toContain("JWT_SECRET");
    expect(lib).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("PATCH application requires operator and uses applyAdminNetTermsDecision", () => {
    const s = read("applications/[applicationId]/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("applyAdminNetTermsDecision");
    expect(s).toContain("net_terms_patch");
    expect(s).toContain("approve");
    expect(s).toContain("deny");
    expect(s).not.toContain("expressAdminFetch");
    expect(s).not.toContain("localStorage");
  });

  it("net-terms page uses native fetch without Express bridge", () => {
    const page = readFileSync(join(__dirname, "../../net-terms/page.tsx"), "utf8");
    expect(page).toContain("fetchAdminNetTermsApplications");
    expect(page).not.toContain("fetchAdminNetTermsApplicationsFromExpress");
    expect(page).not.toContain("JWT_SECRET");
    expect(page).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });
});
