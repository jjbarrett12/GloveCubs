import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Next password reset routes", () => {
  it("forgot password page renders client form", () => {
    const page = read("app/login/forgot-password/page.tsx");
    const client = read("app/login/forgot-password/ForgotPasswordClient.tsx");
    expect(page).toContain("ForgotPasswordClient");
    expect(client).toContain("resetPasswordForEmail");
    expect(client).toContain("buildPasswordRecoveryRedirectUrl");
  });

  it("login page links to forgot password", () => {
    const login = read("app/login/LoginClient.tsx");
    expect(login).toContain('href="/login/forgot-password"');
    expect(login).toContain("Forgot password?");
    expect(login).toContain('href="/signup"');
  });

  it("reset page calls updateUser and validates passwords", () => {
    const client = read("app/login/reset/ResetPasswordClient.tsx");
    expect(client).toContain("updateUser");
    expect(client).toContain("validateNewPasswordPair");
    expect(client).toContain("getSession");
  });

  it("auth callback exchanges code and avoids admin open redirects", () => {
    const route = read("app/auth/callback/route.ts");
    expect(route).toContain("exchangeCodeForSession");
    expect(route).toContain("safeAuthCallbackNextPath");
    expect(route).not.toContain("express");
  });

  it("does not use legacy Express password reset routes", () => {
    const forgot = read("app/login/forgot-password/ForgotPasswordClient.tsx");
    const reset = read("app/login/reset/ResetPasswordClient.tsx");
    expect(forgot).not.toMatch(/\/api\/auth\/reset|express/i);
    expect(reset).not.toMatch(/\/api\/auth\/reset|express/i);
  });

  it("forgot password shows neutral success copy", () => {
    const client = read("app/login/forgot-password/ForgotPasswordClient.tsx");
    expect(client).toContain("If an account exists");
    expect(client).toContain("classifyPasswordResetRequestResult");
  });

  it("missing public env is deployment error on forgot password", () => {
    const client = read("app/login/forgot-password/ForgotPasswordClient.tsx");
    expect(client).toContain("deployment");
    expect(client).not.toContain("no_membership");
  });

  it("admin add buyer copy points to forgot password", () => {
    const form = read("app/admin/companies/CompanyAddMemberForm.tsx");
    expect(form).toContain("Forgot password");
    expect(form).not.toContain("Supabase dashboard");
  });
});
