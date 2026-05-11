import { describe, expect, it } from "vitest";
import { resolveProductImageSrc } from "@/components/store/ProductImage";

describe("resolveProductImageSrc", () => {
  it("returns null for null/undefined/empty", () => {
    expect(resolveProductImageSrc(null)).toBeNull();
    expect(resolveProductImageSrc(undefined)).toBeNull();
    expect(resolveProductImageSrc("")).toBeNull();
  });

  it("returns null for whitespace-only strings", () => {
    expect(resolveProductImageSrc("   ")).toBeNull();
    expect(resolveProductImageSrc("\t\n")).toBeNull();
  });

  it("trims and returns valid URLs", () => {
    expect(resolveProductImageSrc("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(resolveProductImageSrc("  /local/img.jpg  ")).toBe("/local/img.jpg");
  });

  it("does not validate URL shape (caller's responsibility)", () => {
    expect(resolveProductImageSrc("not-a-url")).toBe("not-a-url");
  });
});
