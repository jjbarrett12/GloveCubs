import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  normalizeToAllowedValue,
  resolveGovernanceAttributeValues,
  upsertImportDraftGloveAttributes,
} from "@/lib/admin/product-attribute-upsert";
import {
  IMPORT_DRAFT_PARSER_VERSION,
  IMPORT_DRAFT_SCHEMA_VERSION,
  type ImportDraftProductV1,
} from "@/lib/admin/import-draft-types";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));

const draft: ImportDraftProductV1 = {
  schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
  parser_version: IMPORT_DRAFT_PARSER_VERSION,
  source_url: "https://example.com",
  product_name: "Glove",
  brand: null,
  category_hint: null,
  description: null,
  image_url: null,
  sku: null,
  mpn: null,
  gtin: null,
  material: "nitrile",
  color: null,
  thickness_mil: 3,
  case_pack: null,
  units_per_case: null,
  powder_free: true,
  latex_free: null,
  exam_grade: true,
  glove_grade: "medical_exam_grade",
  size: "M",
  variants: [],
  confidence: { overall: 0.5, fields: {} },
  field_provenance: {},
  parse_warnings: [],
  raw_evidence: {},
};

const POWDER_ALLOWED = ["powder_free", "powdered"];
const GRADE_ALLOWED = ["medical_exam_grade", "industrial_grade", "food_service_grade"];
const THICKNESS_ALLOWED = ["2", "3", "4", "5", "6", "8", "10", "12", "15", "20"];

describe("normalizeToAllowedValue", () => {
  it("maps powder-free synonyms to powder_free", () => {
    expect(normalizeToAllowedValue("powder-free", POWDER_ALLOWED)).toBe("powder_free");
    expect(normalizeToAllowedValue("POWDER_FREE", POWDER_ALLOWED)).toBe("powder_free");
  });

  it("maps exam grade to medical_exam_grade", () => {
    expect(normalizeToAllowedValue("exam", GRADE_ALLOWED)).toBe("medical_exam_grade");
    expect(normalizeToAllowedValue("medical_exam", GRADE_ALLOWED)).toBe("medical_exam_grade");
  });

  it("maps thickness mil as string", () => {
    expect(normalizeToAllowedValue(3, THICKNESS_ALLOWED)).toBe("3");
    expect(normalizeToAllowedValue("3", THICKNESS_ALLOWED)).toBe("3");
  });

  it("returns null when no compatible value", () => {
    expect(normalizeToAllowedValue("unknown_grade", GRADE_ALLOWED)).toBeNull();
  });
});

describe("resolveGovernanceAttributeValues", () => {
  it("resolves material, powder, grade, and thickness from draft", () => {
    const allowed = new Map<string, string[]>([
      ["material", ["nitrile", "vinyl", "latex"]],
      ["powder", POWDER_ALLOWED],
      ["grade", GRADE_ALLOWED],
      ["thickness_mil", THICKNESS_ALLOWED],
    ]);
    const resolved = resolveGovernanceAttributeValues(draft, allowed);
    expect(resolved.get("material")).toBe("nitrile");
    expect(resolved.get("powder")).toBe("powder_free");
    expect(resolved.get("grade")).toBe("medical_exam_grade");
    expect(resolved.get("thickness_mil")).toBe("3");
  });

  it("skips keys with no allowed match (graceful)", () => {
    const allowed = new Map<string, string[]>([["grade", ["industrial_grade"]]]);
    const resolved = resolveGovernanceAttributeValues(draft, allowed);
    expect(resolved.has("grade")).toBe(false);
  });
});

describe("upsertImportDraftGloveAttributes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns without throwing when no attribute definitions exist", async () => {
    const result = await upsertImportDraftGloveAttributes("prod-1", "cat-1", draft);
    expect(result.synced).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("does not throw on failure (non-blocking)", async () => {
    await expect(upsertImportDraftGloveAttributes("prod-1", "", draft)).resolves.toEqual({
      synced: 0,
      errors: [],
    });
  });
});
