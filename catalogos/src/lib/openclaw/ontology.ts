/**
 * GloveCubs canonical ontology for OpenClaw normalization.
 * All extracted values are mapped to these controlled values only.
 */

export const MATERIAL_CANONICAL = [
  "nitrile",
  "latex",
  "vinyl",
  "poly",
  "neoprene",
  "polyethylene",
  "blend",
  "unknown",
] as const;
export type MaterialCanonical = (typeof MATERIAL_CANONICAL)[number];

export const GLOVE_TYPE_CANONICAL = [
  "exam",
  "industrial",
  "food_service",
  "general_purpose",
  "cleanroom",
  "utility",
  "surgical",
  "unknown",
] as const;
export type GloveTypeCanonical = (typeof GLOVE_TYPE_CANONICAL)[number];

export const SIZE_CANONICAL = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "universal",
  "unknown",
] as const;
export type SizeCanonical = (typeof SIZE_CANONICAL)[number];

export const POWDER_CANONICAL = ["powder_free", "powdered", "unknown"] as const;
export type PowderCanonical = (typeof POWDER_CANONICAL)[number];

export const STERILE_CANONICAL = ["sterile", "non_sterile", "unknown"] as const;
export type SterileCanonical = (typeof STERILE_CANONICAL)[number];

export const COLOR_CANONICAL = [
  "blue",
  "black",
  "white",
  "clear",
  "green",
  "orange",
  "purple",
  "pink",
  "beige",
  "yellow",
  "gray",
  "red",
  "brown",
  "unknown",
] as const;
export type ColorCanonical = (typeof COLOR_CANONICAL)[number];

export const TEXTURE_CANONICAL = [
  "textured",
  "fingertip_textured",
  "smooth",
  "diamond_textured",
  "unknown",
] as const;
export type TextureCanonical = (typeof TEXTURE_CANONICAL)[number];

export const CUFF_STYLE_CANONICAL = ["beaded", "rolled", "straight", "unknown"] as const;
export type CuffStyleCanonical = (typeof CUFF_STYLE_CANONICAL)[number];

export const GRADE_CANONICAL = [
  "medical",
  "exam",
  "industrial",
  "food_service",
  "cleanroom",
  "general_purpose",
  "unknown",
] as const;
export type GradeCanonical = (typeof GRADE_CANONICAL)[number];

export const USE_CASE_TAGS = [
  "medical",
  "dental",
  "food_service",
  "janitorial",
  "automotive",
  "industrial",
  "tattoo",
  "laboratory",
  "cleanroom",
  "veterinary",
] as const;

/** Synonyms and aliases → canonical. No uncontrolled variants (e.g. "Large" / "LG" → "L"). */
export const MATERIAL_SYNONYMS: Record<string, MaterialCanonical> = {
  nitrile: "nitrile",
  nit: "nitrile",
  latex: "latex",
  "natural rubber": "latex",
  vinyl: "vinyl",
  pvc: "vinyl",
  poly: "poly",
  polyethylene: "polyethylene",
  pe: "polyethylene",
  neoprene: "neoprene",
  chloroprene: "neoprene",
  blend: "blend",
  hybrid: "blend",
};

export const SIZE_SYNONYMS: Record<string, SizeCanonical> = {
  xs: "XS",
  xsmall: "XS",
  "extra small": "XS",
  small: "S",
  s: "S",
  sm: "S",
  medium: "M",
  m: "M",
  med: "M",
  large: "L",
  l: "L",
  lg: "L",
  xl: "XL",
  xlarge: "XL",
  "extra large": "XL",
  xxl: "XXL",
  "2xl": "XXL",
  xxxl: "XXXL",
  "3xl": "XXXL",
  universal: "universal",
  "one size": "universal",
};

export const POWDER_SYNONYMS: Record<string, PowderCanonical> = {
  "powder free": "powder_free",
  "powder-free": "powder_free",
  powderfree: "powder_free",
  pf: "powder_free",
  powdered: "powdered",
  powder: "powdered",
};

export const STERILE_SYNONYMS: Record<string, SterileCanonical> = {
  sterile: "sterile",
  non_sterile: "non_sterile",
  "non-sterile": "non_sterile",
  nonsterile: "non_sterile",
};

export const COLOR_SYNONYMS: Record<string, ColorCanonical> = {
  blue: "blue",
  black: "black",
  white: "white",
  clear: "clear",
  transparent: "clear",
  green: "green",
  orange: "orange",
  purple: "purple",
  violet: "purple",
  pink: "pink",
  beige: "beige",
  tan: "beige",
  yellow: "yellow",
  gray: "gray",
  grey: "gray",
  red: "red",
  brown: "brown",
};

export const GLOVE_TYPE_SYNONYMS: Record<string, GloveTypeCanonical> = {
  exam: "exam",
  examination: "exam",
  industrial: "industrial",
  "food service": "food_service",
  "food-service": "food_service",
  "general purpose": "general_purpose",
  general_purpose: "general_purpose",
  cleanroom: "cleanroom",
  utility: "utility",
  surgical: "surgical",
};

export function normalizeMaterial(raw: string): MaterialCanonical {
  const key = raw.trim().toLowerCase().replace(/-/g, " ");
  return MATERIAL_SYNONYMS[key] ?? "unknown";
}

export function normalizeSize(raw: string): SizeCanonical {
  const key = raw.trim().toLowerCase().replace(/-/g, " ");
  return SIZE_SYNONYMS[key] ?? "unknown";
}

export function normalizePowder(raw: string): PowderCanonical {
  const key = raw.trim().toLowerCase().replace(/-/g, " ");
  return POWDER_SYNONYMS[key] ?? "unknown";
}

export function normalizeSterile(raw: string): SterileCanonical {
  const key = raw.trim().toLowerCase().replace(/-/g, " ");
  return STERILE_SYNONYMS[key] ?? "unknown";
}

export function normalizeColor(raw: string): ColorCanonical {
  const key = raw.trim().toLowerCase().replace(/-/g, " ");
  return COLOR_SYNONYMS[key] ?? "unknown";
}

export function normalizeGloveType(raw: string): GloveTypeCanonical {
  const key = raw.trim().toLowerCase().replace(/-/g, " ");
  return GLOVE_TYPE_SYNONYMS[key] ?? "unknown";
}

export function normalizeTexture(raw: string): TextureCanonical {
  const key = raw.trim().toLowerCase().replace(/-/g, " ");
  const map: Record<string, TextureCanonical> = {
    textured: "textured",
    "fingertip textured": "fingertip_textured",
    smooth: "smooth",
    "diamond textured": "diamond_textured",
  };
  return map[key] ?? "unknown";
}

export function normalizeCuffStyle(raw: string): CuffStyleCanonical {
  const key = raw.trim().toLowerCase().replace(/-/g, " ");
  const map: Record<string, CuffStyleCanonical> = {
    beaded: "beaded",
    rolled: "rolled",
    straight: "straight",
  };
  return map[key] ?? "unknown";
}

export function normalizeGrade(raw: string): GradeCanonical {
  const key = raw.trim().toLowerCase().replace(/-/g, " ");
  const map: Record<string, GradeCanonical> = {
    medical: "medical",
    exam: "exam",
    industrial: "industrial",
    "food service": "food_service",
    cleanroom: "cleanroom",
    "general purpose": "general_purpose",
  };
  return map[key] ?? "unknown";
}
