import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("POST /admin/api/companies/[companyId]/members", () => {
  it("requires admin, validates input, writes gc_commerce.company_members only", () => {
    const routePath = join(__dirname, "route.ts");
    const writePath = join(process.cwd(), "src/lib/admin/admin-company-member-write.ts");
    const route = readFileSync(routePath, "utf8");
    const write = readFileSync(writePath, "utf8");

    expect(route).toContain("getAdminUser");
    expect(route).toContain("401");
    expect(route).toContain("isSupabaseConfigured");
    expect(route).toContain("missing_supabase_env");
    expect(route).toContain("addCompanyMemberForAdmin");
    expect(route).toContain("password_setup_required");
    expect(route).not.toContain("NEXT_PUBLIC_SUPABASE");
    expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(route).not.toContain("public.users");
    expect(route).not.toContain("Express");

    expect(write).toContain('schema("gc_commerce")');
    expect(write).toContain('from("company_members")');
    expect(write).toContain("auth.admin.createUser");
    expect(write).toContain("auth.admin.listUsers");
    expect(write).toContain("already_member");
    expect(write).toContain("quote_requests.gc_company_id");
    expect(write).not.toMatch(/from\(["']users["']\)/);
    expect(write).not.toContain("console.log");
    expect(write).toContain("randomBytes");
  });
});

describe("CompanyAddMemberForm", () => {
  it("posts to admin members API and refreshes on success", () => {
    const p = join(process.cwd(), "src/app/admin/companies/CompanyAddMemberForm.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("/admin/api/companies/${companyId}/members");
    expect(s).toContain("router.refresh()");
    expect(s).toContain("password_setup_required");
    expect(s).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
