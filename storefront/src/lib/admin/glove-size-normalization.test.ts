import { describe, expect, it } from "vitest";
import {
  normalizeGloveSizeCode,
  normalizeGloveSizeLabel,
  sortGloveSizeCodes,
} from "@/lib/admin/glove-size-normalization";

describe("normalizeGloveSizeCode", () => {
  it("normalizes X-Small variants to XS", () => {
    expect(normalizeGloveSizeCode("X-Small")).toBe("XS");
    expect(normalizeGloveSizeCode("Extra Small")).toBe("XS");
    expect(normalizeGloveSizeCode("X Small")).toBe("XS");
    expect(normalizeGloveSizeCode("XS")).toBe("XS");
  });

  it("normalizes standard sizes", () => {
    expect(normalizeGloveSizeCode("Small")).toBe("S");
    expect(normalizeGloveSizeCode("S")).toBe("S");
    expect(normalizeGloveSizeCode("Medium")).toBe("M");
    expect(normalizeGloveSizeCode("M")).toBe("M");
    expect(normalizeGloveSizeCode("Large")).toBe("L");
    expect(normalizeGloveSizeCode("L")).toBe("L");
    expect(normalizeGloveSizeCode("X-Large")).toBe("XL");
    expect(normalizeGloveSizeCode("Extra Large")).toBe("XL");
    expect(normalizeGloveSizeCode("XL")).toBe("XL");
  });

  it("normalizes extended sizes", () => {
    expect(normalizeGloveSizeCode("2XL")).toBe("XXL");
    expect(normalizeGloveSizeCode("XX-Large")).toBe("XXL");
    expect(normalizeGloveSizeCode("3XL")).toBe("XXXL");
    expect(normalizeGloveSizeCode("XXX-Large")).toBe("XXXL");
  });

  it("returns null for unknown input", () => {
    expect(normalizeGloveSizeCode("")).toBeNull();
    expect(normalizeGloveSizeCode("One Size")).toBeNull();
  });
});

describe("normalizeGloveSizeLabel", () => {
  it("returns normalized code as label", () => {
    expect(normalizeGloveSizeLabel("Medium")).toBe("M");
  });
});

describe("sortGloveSizeCodes", () => {
  it("sorts in natural glove order", () => {
    expect(sortGloveSizeCodes(["XL", "S", "XXXL", "M", "XS", "L", "XXL"])).toEqual([
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "XXL",
      "XXXL",
    ]);
  });
});
