import { describe, it, expect } from "vitest";
import {
  envKeyStatus,
  resolveEffectiveLoginEnv,
  validateRequiredLoginEnv,
  formatLoginEnvReport,
  maskEnvValue,
  reportContainsSecretLeak,
  REQUIRED_LOGIN_ENV_KEYS,
} from "./env-file-utils.mjs";

const FAKE_URL = "https://example.supabase.co";
const FAKE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon.fake-key-value";
const FAKE_SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role.fake-secret";

function validProcessEnv(overrides = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: FAKE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON,
    SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE,
    ...overrides,
  };
}

describe("envKeyStatus", () => {
  it("treats valid values as ok", () => {
    expect(envKeyStatus(FAKE_URL)).toBe("ok");
  });

  it("treats missing values as missing", () => {
    expect(envKeyStatus(undefined)).toBe("missing");
    expect(envKeyStatus(null)).toBe("missing");
  });

  it("treats blank values as blank", () => {
    expect(envKeyStatus("")).toBe("blank");
    expect(envKeyStatus("   ")).toBe("blank");
    expect(envKeyStatus("\n")).toBe("blank");
  });
});

describe("validateRequiredLoginEnv", () => {
  it("passes with valid fake env", () => {
    const resolved = resolveEffectiveLoginEnv({
      processEnv: validProcessEnv(),
      envFilePaths: [],
      deployOnly: true,
    });
    expect(validateRequiredLoginEnv(resolved)).toEqual([]);
  });

  it("fails when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    const resolved = resolveEffectiveLoginEnv({
      processEnv: validProcessEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined }),
      envFilePaths: [],
      deployOnly: true,
    });
    const problems = validateRequiredLoginEnv(resolved);
    expect(problems.some((p) => p.key === "NEXT_PUBLIC_SUPABASE_URL" && p.status === "missing")).toBe(true);
  });

  it("fails when NEXT_PUBLIC_SUPABASE_URL is blank", () => {
    const resolved = resolveEffectiveLoginEnv({
      processEnv: validProcessEnv({ NEXT_PUBLIC_SUPABASE_URL: "" }),
      envFilePaths: [],
      deployOnly: true,
    });
    const problems = validateRequiredLoginEnv(resolved);
    expect(problems.some((p) => p.key === "NEXT_PUBLIC_SUPABASE_URL" && p.status === "blank")).toBe(true);
  });

  it("fails when NEXT_PUBLIC_SUPABASE_URL is whitespace-only", () => {
    const resolved = resolveEffectiveLoginEnv({
      processEnv: validProcessEnv({ NEXT_PUBLIC_SUPABASE_URL: "   \n" }),
      envFilePaths: [],
      deployOnly: true,
    });
    expect(validateRequiredLoginEnv(resolved).length).toBeGreaterThan(0);
  });

  it("fails when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing", () => {
    const resolved = resolveEffectiveLoginEnv({
      processEnv: validProcessEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }),
      envFilePaths: [],
      deployOnly: true,
    });
    expect(
      validateRequiredLoginEnv(resolved).some(
        (p) => p.key === "NEXT_PUBLIC_SUPABASE_ANON_KEY" && p.status === "missing",
      ),
    ).toBe(true);
  });

  it("fails when NEXT_PUBLIC_SUPABASE_ANON_KEY is blank", () => {
    const resolved = resolveEffectiveLoginEnv({
      processEnv: validProcessEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "" }),
      envFilePaths: [],
      deployOnly: true,
    });
    expect(
      validateRequiredLoginEnv(resolved).some(
        (p) => p.key === "NEXT_PUBLIC_SUPABASE_ANON_KEY" && p.status === "blank",
      ),
    ).toBe(true);
  });

  it("fails when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    const resolved = resolveEffectiveLoginEnv({
      processEnv: validProcessEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }),
      envFilePaths: [],
      deployOnly: true,
    });
    expect(
      validateRequiredLoginEnv(resolved).some(
        (p) => p.key === "SUPABASE_SERVICE_ROLE_KEY" && p.status === "missing",
      ),
    ).toBe(true);
  });

  it("fails when SUPABASE_SERVICE_ROLE_KEY is blank", () => {
    const resolved = resolveEffectiveLoginEnv({
      processEnv: validProcessEnv({ SUPABASE_SERVICE_ROLE_KEY: "  " }),
      envFilePaths: [],
      deployOnly: true,
    });
    expect(
      validateRequiredLoginEnv(resolved).some(
        (p) => p.key === "SUPABASE_SERVICE_ROLE_KEY" && p.status === "blank",
      ),
    ).toBe(true);
  });

  it("does not leak secret values in diagnostic output", () => {
    const resolved = resolveEffectiveLoginEnv({
      processEnv: validProcessEnv({ SUPABASE_SERVICE_ROLE_KEY: "" }),
      envFilePaths: [],
      deployOnly: true,
    });
    const problems = validateRequiredLoginEnv(resolved);
    const report = formatLoginEnvReport(problems, { ok: false, deployOnly: true });
    expect(report).not.toContain(FAKE_ANON);
    expect(report).not.toContain(FAKE_SERVICE);
    expect(reportContainsSecretLeak(report)).toBe(false);
    expect(maskEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", FAKE_ANON)).toContain("REDACTED");
    expect(maskEnvValue("SUPABASE_SERVICE_ROLE_KEY", FAKE_SERVICE)).toContain("REDACTED");
  });

  it("covers all required keys", () => {
    expect(REQUIRED_LOGIN_ENV_KEYS.map((k) => k.key)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });
});
