/**
 * OpenClaw normalization using ONLY existing GloveCubs site filters.
 * Source of truth: catalogos filter-attributes.ts.
 * Do not add new filter dimensions or values.
 */

import {
  MATERIAL_OPTIONS,
  SIZE_OPTIONS,
  COLOR_OPTIONS,
  THICKNESS_MIL_OPTIONS,
  POWDER_OPTIONS,
  STERILITY_OPTIONS,
  GRADE_OPTIONS,
  TEXTURE_OPTIONS,
  CUFF_STYLE_OPTIONS,
} from "../catalogos/filter-attributes";

export type MaterialSite = (typeof MATERIAL_OPTIONS)[number];
export type SizeSite = (typeof SIZE_OPTIONS)[number];
export type ColorSite = (typeof COLOR_OPTIONS)[number];
export type ThicknessSite = (typeof THICKNESS_MIL_OPTIONS)[number];
export type PowderSite = (typeof POWDER_OPTIONS)[number];
export type SterilitySite = (typeof STERILITY_OPTIONS)[number];
export type GradeSite = (typeof GRADE_OPTIONS)[number];
export type TextureSite = (typeof TEXTURE_OPTIONS)[number];
export type CuffStyleSite = (typeof CUFF_STYLE_OPTIONS)[number];

const MATERIAL_MAP: Record<string, MaterialSite> = {
  nitrile: "nitrile",
  latex: "latex",
  vinyl: "vinyl",
  polyethylene: "polyethylene_pe",
  "polyethylene_pe": "polyethylene_pe",
  poly: "polyethylene_pe",
  pe: "polyethylene_pe",
  neoprene: "nitrile",
  blend: "nitrile",
};
const SIZE_MAP: Record<string, SizeSite> = {
  xs: "xs", xsmall: "xs", "extra small": "xs",
  s: "s", small: "s", sm: "s",
  m: "m", medium: "m", med: "m",
  l: "l", large: "l", lg: "l",
  xl: "xl", xlarge: "xl", "extra large": "xl",
  xxl: "xxl", "2xl": "xxl",
};
const COLOR_MAP: Record<string, ColorSite> = {
  blue: "blue", black: "black", white: "white", clear: "clear",
  green: "green", orange: "orange", purple: "purple", violet: "violet",
  pink: "pink", beige: "beige", tan: "tan", yellow: "yellow",
  gray: "gray", grey: "gray", red: "blue", brown: "brown",
  light_blue: "light_blue",
};
const POWDER_MAP: Record<string, PowderSite> = {
  "powder free": "powder_free", "powder-free": "powder_free", powderfree: "powder_free", pf: "powder_free",
  powdered: "powdered", powder: "powdered",
};
const STERILITY_MAP: Record<string, SterilitySite> = {
  sterile: "sterile", non_sterile: "non_sterile", "non-sterile": "non_sterile", nonsterile: "non_sterile",
};
const GRADE_MAP: Record<string, GradeSite> = {
  medical: "medical_exam_grade", exam: "medical_exam_grade", "medical exam": "medical_exam_grade",
  medical_exam_grade: "medical_exam_grade",
  industrial: "industrial_grade", industrial_grade: "industrial_grade",
  "food service": "food_service_grade", food_service: "food_service_grade", food_service_grade: "food_service_grade",
};
const TEXTURE_MAP: Record<string, TextureSite> = {
  smooth: "smooth",
  "fingertip textured": "fingertip_textured", fingertip_textured: "fingertip_textured", textured: "fingertip_textured",
  "fully textured": "fully_textured", fully_textured: "fully_textured", diamond_textured: "fully_textured",
};
const CUFF_MAP: Record<string, CuffStyleSite> = {
  beaded: "beaded_cuff", beaded_cuff: "beaded_cuff", rolled: "beaded_cuff",
  "non beaded": "non_beaded", non_beaded: "non_beaded", straight: "non_beaded",
  "extended cuff": "extended_cuff", extended_cuff: "extended_cuff",
};

function key(s: string): string {
  return s.trim().toLowerCase().replace(/-/g, " ");
}

/** Normalize material to site filter only. Unmapped → empty string (do not invent). */
export function normalizeMaterialSite(raw: string): MaterialSite | "" {
  const k = key(raw);
  return MATERIAL_MAP[k] ?? "";
}

/** Normalize size to site filter only (lowercase). */
export function normalizeSizeSite(raw: string): SizeSite | "" {
  const k = key(raw);
  return SIZE_MAP[k] ?? "";
}

/** Normalize color to site filter only. */
export function normalizeColorSite(raw: string): ColorSite | "" {
  const k = key(raw);
  return COLOR_MAP[k] ?? "";
}

/** Normalize thickness to site filter string "2".."20". */
export function normalizeThicknessSite(raw: string | number): ThicknessSite | "" {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (Number.isNaN(n) || n < 2 || n > 20) return "";
  const s = String(Math.round(n));
  return THICKNESS_MIL_OPTIONS.includes(s as ThicknessSite) ? (s as ThicknessSite) : "";
}

/** Normalize powder to site filter only. */
export function normalizePowderSite(raw: string): PowderSite | "" {
  const k = key(raw);
  return POWDER_MAP[k] ?? "";
}

/** Normalize sterility to site filter only. */
export function normalizeSterilitySite(raw: string): SterilitySite | "" {
  const k = key(raw);
  return STERILITY_MAP[k] ?? "";
}

/** Normalize glove_type → site grade filter. */
export function normalizeGradeSite(raw: string): GradeSite | "" {
  const k = key(raw);
  return GRADE_MAP[k] ?? "";
}

/** Normalize texture to site filter only. */
export function normalizeTextureSite(raw: string): TextureSite | "" {
  const k = key(raw);
  return TEXTURE_MAP[k] ?? "";
}

/** Normalize cuff_style to site filter only. */
export function normalizeCuffStyleSite(raw: string): CuffStyleSite | "" {
  const k = key(raw);
  return CUFF_MAP[k] ?? "";
}

/** Category: disposable_gloves or reusable_work_gloves only (no all_categories). */
export function normalizeCategorySite(raw: string): "disposable_gloves" | "reusable_work_gloves" {
  const k = key(raw);
  if (k.includes("reusable") || k.includes("work glove")) return "reusable_work_gloves";
  return "disposable_gloves";
}

export const SITE_FILTER_KEYS = [
  "brand",
  "material",
  "glove_type",
  "size",
  "color",
  "thickness_mil",
  "powder_status",
  "sterile_status",
  "box_qty",
  "case_qty",
  "texture",
  "cuff_style",
  "category",
] as const;
