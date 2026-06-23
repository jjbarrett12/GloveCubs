import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 1 — users admin (native Supabase)", () => {
  it("GET users requires operator and uses native admin-users service", () => {
    const s = read("route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("fetchAdminUsers");
    expect(s).toContain("users_list");
    expect(s).not.toContain("fetchAdminUsersFromExpress");
    expect(s).not.toContain("expressAdminFetch");

    const lib = readFileSync(join(__dirname, "../../../../lib/admin/admin-users.ts"), "utf8");
    expect(lib).toContain('.from("users")');
    expect(lib).not.toContain("JWT_SECRET");
    expect(lib).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("PUT user requires operator and uses native updateAdminUser", () => {
    const s = read("[userId]/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("updateAdminUser");
    expect(s).toContain("z.enum(DISCOUNT_TIERS)");
    expect(s).toContain("user_update");
    expect(s).not.toContain("expressAdminFetch");
    expect(s).not.toContain("localStorage");
  });

  it("users page and row actions use BFF without Express bridge", () => {
    const page = readFileSync(join(__dirname, "../../users/page.tsx"), "utf8");
    expect(page).toContain("fetchAdminUsers");
    expect(page).not.toContain("fetchAdminUsersFromExpress");
    expect(page).not.toContain("JWT_SECRET");
    expect(page).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");

    const row = readFileSync(join(__dirname, "../../users/UserRowActions.tsx"), "utf8");
    expect(row).toContain("/admin/api/users/");
  });
});
