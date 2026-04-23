import { describe, it, expect } from "vitest";
import { sanitizeSearchTerm } from "./search";

describe("sanitizeSearchTerm", () => {
  it("trims and removes ilike metacharacters", () => {
    expect(sanitizeSearchTerm("  nitrile%_  ")).toBe("nitrile");
  });

  it("returns empty for blank", () => {
    expect(sanitizeSearchTerm("   ")).toBe("");
    expect(sanitizeSearchTerm(undefined)).toBe("");
  });
});
