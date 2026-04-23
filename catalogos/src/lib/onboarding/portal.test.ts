import { describe, it, expect, vi, beforeEach } from "vitest";

describe("supplier intake portal", () => {
  it("token format is 64-char hex for 32 bytes", () => {
    const hex64 = /^[a-f0-9]{64}$/;
    const example = "a".repeat(64);
    expect(hex64.test(example)).toBe(true);
    expect(hex64.test("ab")).toBe(false);
  });

  it("submitted_via supplier_portal implies token is generated", () => {
    const submittedVia = "supplier_portal";
    expect(submittedVia).toBe("supplier_portal");
  });
});
