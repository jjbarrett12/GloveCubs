/**
 * Tests for three validation modes: parse_safe, stage_safe, publish_safe.
 * Run: npx vitest run src/lib/catalogos/validation-modes.test.ts
 */

import { describe, it, expect } from "vitest";
import { parseSafe, stageSafe, publishSafe } from "./validation-modes";

describe("parse_safe", () => {
  it("passes when structure and allowed values are valid", () => {
    const result = parseSafe({
      content: { canonical_title: "Gloves", supplier_sku: "SKU1", supplier_cost: 10 },
      category_slug: "disposable_gloves",
      filter_attributes: { category: "disposable_gloves", material: "nitrile", size: "m", color: "blue", brand: "Acme", packaging: "box_100_ct", powder: "powder_free", grade: "industrial_grade" },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when content is missing required fields", () => {
    const result = parseSafe({
      content: {},
      category_slug: "disposable_gloves",
      filter_attributes: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("canonical_title"))).toBe(true);
    expect(result.errors.some((e) => e.includes("supplier_sku"))).toBe(true);
    expect(result.errors.some((e) => e.includes("supplier_cost"))).toBe(true);
  });

  it("fails when a value is not in the dictionary", () => {
    const result = parseSafe({
      content: { canonical_title: "Gloves", supplier_sku: "SKU1", supplier_cost: 10 },
      category_slug: "disposable_gloves",
      filter_attributes: { material: "silk", size: "m" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("silk") && e.includes("material"))).toBe(true);
  });

  it("fails when category_slug is invalid", () => {
    const result = parseSafe({
      content: { canonical_title: "G", supplier_sku: "S", supplier_cost: 0 },
      category_slug: "invalid_category",
      filter_attributes: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("category_slug"))).toBe(true);
  });
});

describe("stage_safe", () => {
  it("always returns stageable true", () => {
    const r = stageSafe("disposable_gloves", {});
    expect(r.stageable).toBe(true);
  });

  it("returns missing_required when required attributes are absent", () => {
    const r = stageSafe("disposable_gloves", { category: "disposable_gloves" });
    expect(r.missing_required).toContain("material");
    expect(r.missing_required).toContain("color");
    expect(r.missing_required).toContain("brand");
    expect(r.missing_required).toContain("packaging");
    expect(r.missing_required).toContain("powder");
    expect(r.missing_required).toContain("grade");
  });

  it("returns empty missing_required when all required present for work gloves", () => {
    const r = stageSafe("reusable_work_gloves", {
      category: "reusable_work_gloves",
      color: "black",
      brand: "Acme",
    });
    expect(r.missing_required).toHaveLength(0);
    expect(r.missing_strongly_preferred.length).toBeGreaterThan(0);
  });
});

describe("publish_safe", () => {
  it("returns publishable false when required attributes missing", () => {
    const r = publishSafe("disposable_gloves", { category: "disposable_gloves" });
    expect(r.publishable).toBe(false);
    expect(r.error).toMatch(/missing required attributes/);
    expect(r.error).toMatch(/material|color|brand/);
  });

  it("returns publishable true when all required present for disposable_gloves", () => {
    const r = publishSafe("disposable_gloves", {
      category: "disposable_gloves",
      material: "nitrile",
      color: "blue",
      brand: "Acme",
      packaging: "box_100_ct",
      powder: "powder_free",
      grade: "industrial_grade",
    });
    expect(r.publishable).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("returns publishable true when all required present for reusable_work_gloves", () => {
    const r = publishSafe("reusable_work_gloves", {
      category: "reusable_work_gloves",
      color: "black",
      brand: "Acme",
    });
    expect(r.publishable).toBe(true);
  });
});
