import { describe, expect, it } from "vitest";
import { sanitizeParentCopy } from "./sanitize-parent-copy";

describe("sanitizeParentCopy", () => {
  it("strips trailing selected XL from comma-separated title", () => {
    const result = sanitizeParentCopy({
      title: "Safety Zone Nitrile Exam Gloves, Powder-Free, 10x100, Orange, XL",
      selectedSize: "XL",
    });
    expect(result.title).toBe("Safety Zone Nitrile Exam Gloves, Powder-Free, 10x100, Orange");
    expect(result.title).not.toMatch(/\bXL\b/);
    expect(result.removedTokens).toContain("XL");
  });

  it("strips word-form Extra Large from dashed title", () => {
    const result = sanitizeParentCopy({
      title: "Safety Zone Orange Nitrile Exam Gloves - Extra Large",
      selectedSize: "XL",
    });
    expect(result.title).toBe("Safety Zone Orange Nitrile Exam Gloves");
    expect(result.removedTokens.length).toBeGreaterThan(0);
  });

  it("preserves available sizes listing copy", () => {
    const text = "Available in sizes S, M, L, X, XL";
    const result = sanitizeParentCopy({ title: text, selectedSize: "XL" });
    expect(result.title).toBe(text);
    expect(result.removedTokens).toHaveLength(0);
  });

  it("preserves packaging counts", () => {
    for (const title of ["10x100", "10 boxes of 100", "Case 1000 ct"]) {
      const result = sanitizeParentCopy({ title, selectedSize: "XL" });
      expect(result.title).toBe(title);
      expect(result.removedTokens).toHaveLength(0);
    }
  });

  it("preserves thickness and dimensions", () => {
    for (const title of ["5 Mil", "9.5 inch", "12 in length"]) {
      const result = sanitizeParentCopy({ title, selectedSize: "XL" });
      expect(result.title).toBe(title);
      expect(result.removedTokens).toHaveLength(0);
    }
  });

  it("returns unchanged text when selectedSize is missing", () => {
    const result = sanitizeParentCopy({
      title: "Safety Zone Nitrile Exam Gloves, Orange, XL",
    });
    expect(result.title).toBe("Safety Zone Nitrile Exam Gloves, Orange, XL");
    expect(result.confidence).toBe(0);
  });

  it("keeps variant display size when parent title is sanitized separately", () => {
    const parent = sanitizeParentCopy({
      title: "Safety Zone Orange Nitrile Exam Gloves - XL",
      selectedSize: "XL",
    });
    expect(parent.title).toBe("Safety Zone Orange Nitrile Exam Gloves");
    const variantTitle = `${parent.title} — XL`;
    expect(variantTitle).toMatch(/\bXL\b/);
  });
});
