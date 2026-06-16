import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 1C-ops slice 3 — users BFF", () => {
  it("GET users requires operator and calls Express", () => {
    const s = read("route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("fetchAdminUsersFromExpress");
    expect(s).toContain("users_list");
    const lib = readFileSync(join(__dirname, "../../../../lib/admin/admin-users-express.ts"), "utf8");
    expect(lib).toContain("/api/admin/users");
  });

  it("PUT user requires operator and proxies Express PUT", () => {
    const s = read("[userId]/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("expressAdminFetch");
    expect(s).toContain('method: "PUT"');
    expect(s).toContain("user_update");
    expect(s).not.toContain("localStorage");
  });

  it("users page and row actions use BFF", () => {
    const page = readFileSync(join(__dirname, "../../users/page.tsx"), "utf8");
    expect(page).toContain("fetchAdminUsersFromExpress");
    const row = readFileSync(join(__dirname, "../../users/UserRowActions.tsx"), "utf8");
    expect(row).toContain("/admin/api/users/");
  });
});
