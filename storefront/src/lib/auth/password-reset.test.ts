import { describe, expect, it } from "vitest";
import {
  buildPasswordRecoveryRedirectUrl,
  classifyPasswordResetRequestResult,
  classifyPasswordUpdateError,
  safeAuthCallbackNextPath,
  sanitizeAuthDiagnosticMessage,
} from "@/lib/auth/password-reset";

describe("buildPasswordRecoveryRedirectUrl", () => {
  it("uses auth callback with safe next path", () => {
    const url = buildPasswordRecoveryRedirectUrl("https://www.glovecubs.com");
    expect(url).toBe("https://www.glovecubs.com/auth/callback?next=%2Flogin%2Freset");
  });

  it("returns null when origin cannot be resolved", () => {
    expect(buildPasswordRecoveryRedirectUrl(undefined)).toBeNull();
  });
});

describe("classifyPasswordResetRequestResult", () => {
  it("returns neutral sent for unknown email errors", () => {
    expect(classifyPasswordResetRequestResult({ message: "User not found", status: 400 }).kind).toBe("sent");
  });

  it("surfaces rate limiting distinctly", () => {
    const out = classifyPasswordResetRequestResult({ message: "Too many requests", status: 429 });
    expect(out.kind).toBe("rate_limited");
  });
});

describe("safeAuthCallbackNextPath", () => {
  it("blocks admin destinations from email callback", () => {
    expect(safeAuthCallbackNextPath("/admin/settings")).toBe("/login/reset");
  });

  it("allows login reset path", () => {
    expect(safeAuthCallbackNextPath("/login/reset")).toBe("/login/reset");
  });

  it("allows signup complete path after email confirmation", () => {
    expect(safeAuthCallbackNextPath("/signup/complete")).toBe("/signup/complete");
  });
});

describe("classifyPasswordUpdateError", () => {
  it("marks expired recovery sessions", () => {
    const out = classifyPasswordUpdateError({ message: "Auth session missing!" });
    expect(out.expired).toBe(true);
  });
});

describe("sanitizeAuthDiagnosticMessage", () => {
  it("redacts tokens and passwords from diagnostic strings", () => {
    const raw = "access_token=abc123 refresh_token=def456 password=secret eyJhbGci.test.sig";
    const safe = sanitizeAuthDiagnosticMessage(raw);
    expect(safe).not.toContain("secret");
    expect(safe).not.toContain("abc123");
    expect(safe).not.toContain("eyJhbGci");
  });
});
