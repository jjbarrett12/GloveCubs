/**
 * Tests for thickness 7_plus migration: derivation, canonical range, audit shape.
 * Run: npx vitest run src/lib/migrations/thickness-7-plus.test.ts
 */

import { describe, it, expect } from "vitest";
import { parseThicknessFromRaw } from "@/lib/normalization/normalization-utils";
import {
  LEGACY_7_PLUS,
  isCanonicalThickness,
  deriveThicknessFromRawPayload,
  CANONICAL_THICKNESS_RANGE,
  migrateThickness7Plus,
  type ThicknessMigrationResult,
} from "./thickness-7-plus";

describe("thickness 7_plus migration", () => {
  describe("parseThicknessFromRaw", () => {
    it("extracts numeric thickness from text for migration", () => {
      expect(parseThicknessFromRaw(null, "Nitrile gloves 8 mil powder free")).toBe(8);
      expect(parseThicknessFromRaw(null, "9 mil exam gloves")).toBe(9);
      expect(parseThicknessFromRaw(null, "10mil")).toBe(10);
      expect(parseThicknessFromRaw(null, "7 mil")).toBe(7);
      expect(parseThicknessFromRaw(null, "no thickness here")).toBeUndefined();
    });
  });

  describe("isCanonicalThickness", () => {
    it("returns true for integers 2-20", () => {
      expect(isCanonicalThickness(2)).toBe(true);
      expect(isCanonicalThickness(7)).toBe(true);
      expect(isCanonicalThickness(20)).toBe(true);
    });
    it("returns false for out of range or non-integer", () => {
      expect(isCanonicalThickness(1)).toBe(false);
      expect(isCanonicalThickness(21)).toBe(false);
      expect(isCanonicalThickness(7.5)).toBe(false);
    });
  });

  describe("deriveThicknessFromRawPayload", () => {
    it("returns number when raw payload contains thickness in range", () => {
      expect(deriveThicknessFromRawPayload({ name: "Gloves 8 mil", description: "Nitrile" })).toBe(8);
      expect(deriveThicknessFromRawPayload({ title: "9 mil exam gloves" })).toBe(9);
    });
    it("returns undefined when no thickness in text", () => {
      expect(deriveThicknessFromRawPayload({ name: "Gloves", description: "General purpose" })).toBeUndefined();
    });
    it("returns undefined when parsed thickness out of canonical range", () => {
      expect(deriveThicknessFromRawPayload({ name: "Gloves 1 mil" })).toBeUndefined();
      expect(deriveThicknessFromRawPayload({ name: "Gloves 25 mil" })).toBeUndefined();
    });
  });

  describe("migrateThickness7Plus", () => {
    it("returns result with audit and counts (dry run) when Supabase configured", async () => {
      const hasSupabase = !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!hasSupabase) {
        expect(LEGACY_7_PLUS).toBe("7_plus");
        expect(CANONICAL_THICKNESS_RANGE.min).toBe(2);
        expect(CANONICAL_THICKNESS_RANGE.max).toBe(20);
        return;
      }
      const result = await migrateThickness7Plus({ dryRun: true });
      expect(result).toMatchObject({
        normalized_updated: expect.any(Number),
        normalized_unresolved: expect.any(Number),
        product_attributes_updated: expect.any(Number),
        product_attributes_unresolved: expect.any(Number),
        audit: expect.any(Array),
        errors: expect.any(Array),
      } as ThicknessMigrationResult);
    });
  });
});
