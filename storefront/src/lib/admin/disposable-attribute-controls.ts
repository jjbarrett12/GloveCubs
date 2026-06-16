/**
 * Yes/No UI helpers for disposable glove product attributes.
 * Stored values remain canonical slugs in product_attributes.
 */

export type AttributeValues = Record<string, string | string[]>;

const FOOD_SAFE_CERT_SLUGS = ["fda_food_contact", "food_safe"] as const;
const LATEX_FREE_CERT = "latex_free";

function certArray(values: AttributeValues): string[] {
  const raw = values.certifications;
  if (Array.isArray(raw)) return [...raw];
  if (raw && String(raw).trim()) return [String(raw)];
  return [];
}

function setCertArray(values: AttributeValues, certs: string[]): AttributeValues {
  return { ...values, certifications: certs.length > 0 ? certs : "" };
}

export function getPowderFreeYesNo(values: AttributeValues): "yes" | "no" | "" {
  const powder = values.powder;
  const v = Array.isArray(powder) ? powder[0] : powder;
  if (v === "powder_free") return "yes";
  if (v === "powdered") return "no";
  return "";
}

export function setPowderFreeYesNo(values: AttributeValues, choice: "yes" | "no" | ""): AttributeValues {
  if (choice === "yes") return { ...values, powder: "powder_free" };
  if (choice === "no") return { ...values, powder: "powdered" };
  const next = { ...values };
  delete next.powder;
  return next;
}

export function getLatexFreeYesNo(values: AttributeValues): "yes" | "no" {
  return certArray(values).includes(LATEX_FREE_CERT) ? "yes" : "no";
}

export function setLatexFreeYesNo(values: AttributeValues, choice: "yes" | "no"): AttributeValues {
  const certs = certArray(values).filter((c) => c !== LATEX_FREE_CERT);
  if (choice === "yes") certs.push(LATEX_FREE_CERT);
  return setCertArray(values, certs);
}

export function getMedicalGradeYesNo(values: AttributeValues): "yes" | "no" {
  const grade = values.grade;
  const v = Array.isArray(grade) ? grade[0] : grade;
  return v === "medical_exam_grade" ? "yes" : "no";
}

export function setMedicalGradeYesNo(values: AttributeValues, choice: "yes" | "no"): AttributeValues {
  const grade = values.grade;
  const current = Array.isArray(grade) ? grade[0] : grade;
  if (choice === "yes") return { ...values, grade: "medical_exam_grade" };
  if (current === "medical_exam_grade") {
    const next = { ...values };
    delete next.grade;
    return next;
  }
  return values;
}

export function getFoodSafeYesNo(values: AttributeValues): "yes" | "no" {
  const certs = certArray(values);
  return FOOD_SAFE_CERT_SLUGS.some((s) => certs.includes(s)) ? "yes" : "no";
}

export function setFoodSafeYesNo(values: AttributeValues, choice: "yes" | "no"): AttributeValues {
  let certs = certArray(values).filter((c) => !FOOD_SAFE_CERT_SLUGS.includes(c as (typeof FOOD_SAFE_CERT_SLUGS)[number]));
  if (choice === "yes") certs.push("fda_food_contact");
  return setCertArray(values, certs);
}
