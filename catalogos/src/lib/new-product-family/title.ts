import {
  COLOR_VALUES,
  GRADE_VALUES,
  MATERIAL_VALUES,
  POWDER_VALUES,
} from "@/lib/catalogos/attribute-dictionary-types";

const GRADE_TITLE: Record<(typeof GRADE_VALUES)[number], string> = {
  industrial_grade: "Industrial",
  food_service_grade: "Food Service",
  medical_exam_grade: "Medical / exam",
  surgical_grade: "Surgical",
  cleanroom_grade: "Cleanroom",
  chemical_resistant: "Chemical Resistant",
  general_purpose: "General Purpose",
};

const GRADE_TITLE_WORD: Record<(typeof GRADE_VALUES)[number], string> = {
  industrial_grade: "Industrial",
  food_service_grade: "Food Service",
  medical_exam_grade: "Exam",
  surgical_grade: "Surgical",
  cleanroom_grade: "Cleanroom",
  chemical_resistant: "Chemical Resistant",
  general_purpose: "General Purpose",
};

const MATERIAL_TITLE: Record<(typeof MATERIAL_VALUES)[number], string> = {
  nitrile: "Nitrile",
  vinyl: "Vinyl",
  latex: "Latex",
  polyethylene_pe: "Polyethylene",
};

const COLOR_TITLE: Record<(typeof COLOR_VALUES)[number], string> = {
  blue: "Blue",
  purple: "Purple",
  black: "Black",
  white: "White",
  light_blue: "Light Blue",
  orange: "Orange",
  violet: "Violet",
  blue_violet: "Blue-Violet",
  green: "Green",
  tan: "Tan",
  gray: "Gray",
  beige: "Beige",
  yellow: "Yellow",
  brown: "Brown",
  pink: "Pink",
};

const POWDER_TITLE: Record<(typeof POWDER_VALUES)[number], string> = {
  powder_free: "Powder-Free",
  powdered: "Powdered",
};

function isGrade(v: string): v is (typeof GRADE_VALUES)[number] {
  return (GRADE_VALUES as readonly string[]).includes(v);
}
function isMaterial(v: string): v is (typeof MATERIAL_VALUES)[number] {
  return (MATERIAL_VALUES as readonly string[]).includes(v);
}
function isColor(v: string): v is (typeof COLOR_VALUES)[number] {
  return (COLOR_VALUES as readonly string[]).includes(v);
}
function isPowder(v: string): v is (typeof POWDER_VALUES)[number] {
  return (POWDER_VALUES as readonly string[]).includes(v);
}

export function materialLabel(slug: string): string {
  return isMaterial(slug) ? MATERIAL_TITLE[slug] : "";
}

export function gradeLabel(slug: string): string {
  return isGrade(slug) ? GRADE_TITLE[slug] : "";
}

export function colorLabel(slug: string): string {
  return isColor(slug) ? COLOR_TITLE[slug] : "";
}

export function powderLabel(slug: string): string {
  return isPowder(slug) ? POWDER_TITLE[slug] : "";
}

export function thicknessLabel(mil: string): string {
  if (!mil.trim()) return "";
  return `${mil} mil`;
}

export function sizeChipLabel(size: string): string {
  return size.trim().toUpperCase();
}

export function sizeDisplayName(size: string): string {
  const map: Record<string, string> = {
    xs: "XS",
    s: "Small",
    m: "Medium",
    l: "Large",
    xl: "XL",
    xxl: "XXL",
    xxxl: "XXXL",
  };
  return map[size] ?? sizeChipLabel(size);
}

export function textureLabel(slug: string): string {
  const known: Record<string, string> = {
    smooth: "Smooth",
    fingertip_textured: "Fingertip textured",
    fully_textured: "Fully textured",
    micro_textured: "Micro-textured",
  };
  if (known[slug]) return known[slug];
  if (!slug) return "";
  return slug
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sterilityLabel(slug: string): string {
  if (slug === "non_sterile") return "Non-sterile";
  if (slug === "sterile") return "Sterile";
  return "";
}

export function aqlLabel(slug: string): string {
  if (slug === "aql_1_5") return "AQL 1.5";
  if (slug === "aql_2_5") return "AQL 2.5";
  if (slug === "aql_4_0") return "AQL 4.0";
  return "";
}

export function certificationLabel(slug: string): string {
  const known: Record<string, string> = {
    astm_d6319: "ASTM D6319",
    fda_510k: "FDA 510(k)",
    fda_food_contact: "FDA food contact",
    food_safe: "Food safe",
  };
  return known[slug] ?? textureLabel(slug);
}

export function refreshSuggestedTitle(draft: {
  brand: string;
  color: string;
  material: string;
  grade: string;
  powder: string;
  thicknessMil: string;
  title: string;
  titleTouched: boolean;
}): { title: string; titleTouched: boolean } {
  if (draft.titleTouched && draft.title.trim()) {
    return { title: draft.title, titleTouched: true };
  }
  return {
    title: suggestFamilyTitle(draft),
    titleTouched: false,
  };
}

/** Suggested family display title from structured fields. Operator may override. */
export function suggestFamilyTitle(input: {
  brand: string;
  color: string;
  material: string;
  grade: string;
  powder?: string;
  thicknessMil?: string;
}): string {
  const brand = input.brand.trim();
  const color = colorLabel(input.color);
  const material = materialLabel(input.material);
  const grade = isGrade(input.grade) ? GRADE_TITLE_WORD[input.grade] : "";
  const head = [brand, color, material, grade, brand || color || material || grade ? "Gloves" : ""]
    .filter(Boolean)
    .join(" ");
  const extras: string[] = [];
  const powder = input.powder ? powderLabel(input.powder) : "";
  if (powder) extras.push(powder);
  const mil = input.thicknessMil ? thicknessLabel(input.thicknessMil) : "";
  if (mil) extras.push(mil);
  if (!head) return extras.join(", ");
  if (extras.length === 0) return head;
  return `${head}, ${extras.join(", ")}`;
}
