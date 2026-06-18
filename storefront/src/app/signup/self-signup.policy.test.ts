import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("public self-signup routes", () => {
  it("signup page renders SignupClient", () => {
    const page = read("app/signup/page.tsx");
    const client = read("app/signup/SignupClient.tsx");
    expect(page).toContain("SignupClient");
    expect(client).toContain("signUp");
    expect(client).toContain("/api/auth/self-signup/finalize");
    expect(client).toContain("Create an account to shop gloves and submit quote requests");
    expect(client).toMatch(/href="\/request-pricing"/);
  });

  it("login page links to signup", () => {
    const login = read("app/login/LoginClient.tsx");
    expect(login).toContain('href="/signup"');
    expect(login).toContain("Create an account");
    expect(login).toContain("shop gloves and submit quote requests");
  });

  it("header account CTA links to signup for anonymous users", () => {
    const header = read("components/home/SiteHeader.tsx");
    expect(header).toContain('href="/signup"');
    expect(header).toContain("Create account");
    expect(header).toContain('href="/request-pricing"');
  });

  it("finalize route uses authenticated session and gc_commerce writes only", () => {
    const route = read("app/api/auth/self-signup/finalize/route.ts");
    const lib = read("lib/auth/self-signup.ts");
    const form = read("lib/auth/self-signup-form.ts");
    expect(route).toContain("resolveUserForPostLoginDestination");
    expect(route).toContain("finalizeSelfSignupForUser");
    expect(route).toContain("getSupabaseAdmin");
    expect(route).toContain("company_id");
    expect(route).not.toContain("console.log");
    expect(lib).toContain('schema("gc_commerce")');
    expect(lib).toContain("createCompany");
    expect(lib).toContain('from("company_members")');
    expect(lib).toContain('status: "active"');
    expect(lib).toContain('role: "owner"');
    expect(form).toContain("onboarding_source");
    expect(form).not.toMatch(/from\(["']users["']\)/);
    expect(lib).not.toMatch(/from\(["']users["']\)/);
  });

  it("signup complete page finalizes after email confirmation", () => {
    const page = read("app/signup/complete/page.tsx");
    const client = read("app/signup/complete/SignupCompleteClient.tsx");
    expect(page).toContain("SignupCompleteClient");
    expect(client).toContain("/api/auth/self-signup/finalize");
    expect(client).toContain("SELF_SIGNUP_DEFAULT_REDIRECT");
    expect(client).not.toContain("/request-pricing");
  });

  it("auth callback allows signup complete next path", () => {
    const reset = read("lib/auth/password-reset.ts");
    expect(reset).toContain("/signup/complete");
  });

  it("post-signup destination is account not request-pricing", () => {
    const client = read("app/signup/SignupClient.tsx");
    const complete = read("app/signup/complete/SignupCompleteClient.tsx");
    expect(client).toContain("SELF_SIGNUP_DEFAULT_REDIRECT");
    expect(client).not.toMatch(/assign\(["']\/request-pricing/);
    expect(complete).not.toMatch(/assign\(["']\/request-pricing/);
  });

  it("missing env shows deployment error on signup", () => {
    const client = read("app/signup/SignupClient.tsx");
    expect(client).toContain("env_error");
    expect(client).toContain("deployment");
  });
});

describe("admin visibility for self-signup companies", () => {
  it("self-signup uses same gc_commerce tables as admin company directory", () => {
    const lib = read("lib/auth/self-signup.ts");
    const adminWrite = read("lib/admin/admin-company-write.ts");
    expect(lib).toContain("createCompany");
    expect(adminWrite).toContain('from("companies")');
  });
});
