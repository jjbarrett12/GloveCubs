import { describe, expect, it } from "vitest";
import { escapeIlikeFragment, normalizeMatchKey } from "./v2-ingestion-catalog";

describe("v2-ingestion-catalog", () => {
  it("escapeIlikeFragment escapes ILIKE metacharacters", () => {
    expect(escapeIlikeFragment("100%_nitrile")).toBe("100\\%\\_nitrile");
  });

  it("normalizeMatchKey lowercases and trims", () => {
    expect(normalizeMatchKey("  ABC  ")).toBe("abc");
  });
});
