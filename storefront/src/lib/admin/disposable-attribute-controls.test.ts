import { describe, expect, it } from "vitest";
import {
  getFoodSafeYesNo,
  getLatexFreeYesNo,
  getMedicalGradeYesNo,
  getPowderFreeYesNo,
  setFoodSafeYesNo,
  setLatexFreeYesNo,
  setMedicalGradeYesNo,
  setPowderFreeYesNo,
} from "./disposable-attribute-controls";

describe("disposable Yes/No attribute controls", () => {
  it("Powder Free Yes writes powder_free", () => {
    const next = setPowderFreeYesNo({}, "yes");
    expect(next.powder).toBe("powder_free");
    expect(getPowderFreeYesNo(next)).toBe("yes");
  });

  it("Powder Free No writes powdered", () => {
    const next = setPowderFreeYesNo({}, "no");
    expect(next.powder).toBe("powdered");
  });

  it("Latex Free Yes adds latex_free certification", () => {
    const next = setLatexFreeYesNo({}, "yes");
    expect(next.certifications).toEqual(["latex_free"]);
    expect(getLatexFreeYesNo(next)).toBe("yes");
  });

  it("Latex Free No removes latex_free certification", () => {
    const start = setLatexFreeYesNo({}, "yes");
    const next = setLatexFreeYesNo(start, "no");
    expect(getLatexFreeYesNo(next)).toBe("no");
    expect(next.certifications).toBe("");
  });

  it("Medical Grade Yes writes medical_exam_grade", () => {
    const next = setMedicalGradeYesNo({}, "yes");
    expect(next.grade).toBe("medical_exam_grade");
    expect(getMedicalGradeYesNo(next)).toBe("yes");
  });

  it("Medical Grade No clears medical_exam_grade only", () => {
    const withSurgical = { grade: "surgical_grade" };
    const next = setMedicalGradeYesNo(withSurgical, "no");
    expect(next.grade).toBe("surgical_grade");

    const withMedical = setMedicalGradeYesNo({}, "yes");
    const cleared = setMedicalGradeYesNo(withMedical, "no");
    expect(cleared.grade).toBeUndefined();
  });

  it("Food Safe Yes adds fda_food_contact", () => {
    const next = setFoodSafeYesNo({}, "yes");
    expect(next.certifications).toEqual(["fda_food_contact"]);
    expect(getFoodSafeYesNo(next)).toBe("yes");
  });

  it("Food Safe No removes food contact certifications", () => {
    const start = setFoodSafeYesNo({ certifications: ["food_safe", "latex_free"] }, "yes");
    const next = setFoodSafeYesNo(start, "no");
    expect(getFoodSafeYesNo(next)).toBe("no");
    expect(next.certifications).toEqual(["latex_free"]);
  });
});
