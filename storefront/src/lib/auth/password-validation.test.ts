import { describe, expect, it } from "vitest";
import { validateNewPasswordPair } from "@/lib/auth/password-validation";

describe("validateNewPasswordPair", () => {
  it("rejects short passwords", () => {
    const out = validateNewPasswordPair("short", "short");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issue).toBe("too_short");
  });

  it("rejects mismatched passwords", () => {
    const out = validateNewPasswordPair("longenough", "different1");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issue).toBe("mismatch");
  });

  it("accepts matching passwords meeting minimum length", () => {
    expect(validateNewPasswordPair("longenough", "longenough").ok).toBe(true);
  });
});
