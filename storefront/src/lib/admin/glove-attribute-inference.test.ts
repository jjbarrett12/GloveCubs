import { describe, expect, it } from "vitest";
import {
  IMPORT_DRAFT_PARSER_VERSION,
  IMPORT_DRAFT_SCHEMA_VERSION,
  type ImportDraftProductV1,
} from "@/lib/admin/import-draft-types";
import { inferGloveAttributesFromDraft } from "@/lib/admin/glove-attribute-inference";

function draft(overrides: Partial<ImportDraftProductV1> = {}): ImportDraftProductV1 {
  return {
    schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
    parser_version: IMPORT_DRAFT_PARSER_VERSION,
    source_url: "https://example.com/p",
    product_name: "Nitrile Exam Gloves",
    brand: "Safety Zone",
    category_hint: "disposable_gloves",
    description: "Medical exam grade powder-free nitrile gloves for healthcare and laboratory use.",
    image_url: null,
    sku: null,
    mpn: null,
    gtin: null,
    material: "nitrile",
    color: "black",
    thickness_mil: 5.5,
    case_pack: "10/100",
    units_per_case: 1000,
    powder_free: true,
    latex_free: true,
    exam_grade: true,
    glove_grade: "medical_exam_grade",
    size: "M",
    variants: [],
    confidence: { overall: 0.9, fields: {} },
    field_provenance: {},
    parse_warnings: [],
    raw_evidence: {},
    ...overrides,
  };
}

const allowed = new Map<string, string[]>([
  ["industries", ["healthcare", "dental", "laboratories", "pharmaceuticals", "education", "janitorial", "industrial"]],
  ["uses", ["medical_exam", "patient_care", "general_purpose", "chemical_handling", "laboratory"]],
  ["certifications", ["latex_free", "astm_d6319", "fda_510k"]],
  ["texture", ["fingertip_textured", "smooth"]],
  ["hand_orientation", ["ambidextrous"]],
  ["sterility", ["non_sterile", "sterile"]],
  ["protection_tags", ["chemical_resistant", "grip_enhanced"]],
]);

describe("inferGloveAttributesFromDraft", () => {
  it("suggests industries and uses from exam-grade nitrile signals", () => {
    const inferred = inferGloveAttributesFromDraft(draft(), allowed);
    expect(inferred.industries).toEqual(
      expect.arrayContaining(["healthcare", "laboratories"])
    );
    expect(inferred.uses).toEqual(expect.arrayContaining(["medical_exam", "chemical_handling"]));
    expect(inferred.certifications).toEqual(expect.arrayContaining(["latex_free", "astm_d6319"]));
    expect(inferred.hand_orientation).toBe("ambidextrous");
    expect(inferred.sterility).toBe("non_sterile");
  });
});
