/**
 * Rules-based extraction of storefront filter attributes from raw supplier data.
 * Deterministic first; returns partial FilterAttributes + confidence per attribute.
 * Used before AI fallback for uncertain extractions.
 */

import type { FilterAttributes } from "./normalized-product-types";
import type { RawRow } from "./extraction-types";
import {
  MATERIAL_OPTIONS,
  SIZE_OPTIONS,
  COLOR_OPTIONS,
  THICKNESS_MIL_OPTIONS,
  POWDER_OPTIONS,
  GRADE_OPTIONS,
  INDUSTRY_OPTIONS,
  COMPLIANCE_OPTIONS,
  TEXTURE_OPTIONS,
  CUFF_STYLE_OPTIONS,
  PACKAGING_OPTIONS,
  STERILITY_OPTIONS,
  CUT_LEVEL_ANSI_OPTIONS,
  PUNCTURE_LEVEL_OPTIONS,
  ABRASION_LEVEL_OPTIONS,
  WARM_COLD_WEATHER_OPTIONS,
} from "./filter-attributes";
import { parseThicknessFromRaw } from "@/lib/normalization/normalization-utils";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Combine common text fields for pattern matching. */
function combinedText(row: RawRow): string {
  return [
    row.name, row.title, row.product_name, row.description, row.desc,
    row.material, row.color, row.size, row.specifications, row.details,
  ].map(str).filter(Boolean).join(" ");
}

/** Extract material (universal). */
export function extractMaterial(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  const raw = str(row.material ?? row.type ?? row.glove_type) || text;
  for (const m of MATERIAL_OPTIONS) {
    if (raw.includes(m) || raw.includes(m.replace("_", ""))) return { value: m, confidence: 0.9 };
  }
  if (/\bnitrile\b/i.test(raw)) return { value: "nitrile", confidence: 0.9 };
  if (/\blatex\b/i.test(raw)) return { value: "latex", confidence: 0.9 };
  if (/\bvinyl\b/i.test(raw)) return { value: "vinyl", confidence: 0.9 };
  if (/\bpoly(?:ethylene)?\b|pe\b/i.test(raw)) return { value: "polyethylene_pe", confidence: 0.85 };
  return { confidence: 0 };
}

/** Extract size (universal). */
export function extractSize(row: RawRow): { value?: string; confidence: number } {
  const raw = str(row.size ?? row.sizes);
  if (!raw) return { confidence: 0 };
  const n = raw.replace(/\s+/g, "").toLowerCase();
  for (const s of SIZE_OPTIONS) {
    if (n === s || n.startsWith(s) || n.includes(s)) return { value: s, confidence: 0.9 };
  }
  const match = combinedText(row).match(/\b(xs|s|m|l|xl|xxl)\b/i);
  if (match) {
    const v = match[1].toLowerCase();
    if (SIZE_OPTIONS.includes(v as typeof SIZE_OPTIONS[number])) return { value: v, confidence: 0.85 };
  }
  return { confidence: 0 };
}

/** Extract color (universal). */
export function extractColor(row: RawRow): { value?: string; confidence: number } {
  const raw = str(row.color ?? row.colour) || combinedText(row);
  const map: [RegExp, string][] = [
    [/\b(light[- ]?blue|lt blue)\b/i, "light_blue"],
    [/\b(violet)\b/i, "violet"],
    [/\b(beige|tan)\b/i, "tan"],
    [/\b(grey|gray)\b/i, "gray"],
  ];
  for (const [re, val] of map) {
    if (re.test(raw)) return { value: val, confidence: 0.85 };
  }
  for (const c of COLOR_OPTIONS) {
    if (raw.includes(c.replace("_", " ")) || raw.includes(c)) return { value: c, confidence: 0.85 };
  }
  return { confidence: 0 };
}

/** Extract thickness_mil (disposable). Canonical parse: "12mil", "12-mil", "12 mil" → "12"; all thicknesses listed (no 7+). */
export function extractThicknessMil(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  const n = parseThicknessFromRaw(row.thickness ?? row.thickness_mil ?? row.mil, text);
  if (n == null || n < 0) return { confidence: 0 };
  const s = String(n);
  if (THICKNESS_MIL_OPTIONS.includes(s as (typeof THICKNESS_MIL_OPTIONS)[number])) return { value: s, confidence: 0.9 };
  return { value: s, confidence: 0.85 };
}

/** Extract powder (disposable). */
export function extractPowder(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  if (/\bpowder[- ]?free\b|pf\b|powderfree/i.test(text)) return { value: "powder_free", confidence: 0.9 };
  if (/\bpowdered\b|powder\b(?!\s*[- ]?free)/i.test(text)) return { value: "powdered", confidence: 0.85 };
  return { confidence: 0 };
}

/** Extract grade (disposable). */
export function extractGrade(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  if (/\b(medical|exam|exam grade|fda\s*approved)\b/i.test(text)) return { value: "medical_exam_grade", confidence: 0.85 };
  if (/\b(industrial|general purpose)\b/i.test(text)) return { value: "industrial_grade", confidence: 0.85 };
  if (/\b(food\s*service|food\s*safe|nsf)\b/i.test(text)) return { value: "food_service_grade", confidence: 0.85 };
  return { confidence: 0 };
}

/** Extract industries (disposable) — array. */
export function extractIndustries(row: RawRow): { value?: string[]; confidence: number } {
  const text = combinedText(row);
  const found: string[] = [];
  const map: [RegExp, string][] = [
    [/\b(healthcare|medical|hospital)\b/i, "healthcare"],
    [/\b(food\s*service|restaurant)\b/i, "food_service"],
    [/\b(food\s*processing)\b/i, "food_processing"],
    [/\b(janitorial|janitor)\b/i, "janitorial"],
    [/\b(sanitation)\b/i, "sanitation"],
    [/\b(lab(oratory)?)\b/i, "laboratories"],
    [/\b(pharmaceutical)\b/i, "pharmaceuticals"],
    [/\b(beauty|personal\s*care)\b/i, "beauty_personal_care"],
    [/\b(tattoo|body\s*art)\b/i, "tattoo_body_art"],
    [/\b(automotive)\b/i, "automotive"],
    [/\b(education|school)\b/i, "education"],
  ];
  for (const [re, val] of map) {
    if (re.test(text) && !found.includes(val)) found.push(val);
  }
  return found.length ? { value: found, confidence: 0.8 } : { confidence: 0 };
}

/** Extract compliance_certifications (disposable) — array. */
export function extractCompliance(row: RawRow): { value?: string[]; confidence: number } {
  const text = combinedText(row);
  const found: string[] = [];
  const map: [RegExp, string][] = [
    [/\bfda\s*approved\b/i, "fda_approved"],
    [/\bastm\b/i, "astm_tested"],
    [/\bfood\s*safe\b|nsf/i, "food_safe"],
    [/\blatex[- ]?free\b|latex free/i, "latex_free"],
    [/\bchemo\b|chemical/i, "chemo_rated"],
    [/\ben\s*455\b/i, "en_455"],
    [/\ben\s*374\b/i, "en_374"],
  ];
  for (const [re, val] of map) {
    if (re.test(text) && !found.includes(val)) found.push(val);
  }
  return found.length ? { value: found, confidence: 0.85 } : { confidence: 0 };
}

/** Extract texture (disposable). */
export function extractTexture(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  if (/\bfully\s*textured\b|fully text/i.test(text)) return { value: "fully_textured", confidence: 0.85 };
  if (/\bfingertip\s*textured\b|fingertip text/i.test(text)) return { value: "fingertip_textured", confidence: 0.85 };
  if (/\bsmooth\b/i.test(text)) return { value: "smooth", confidence: 0.85 };
  return { confidence: 0 };
}

/** Extract cuff_style (disposable). */
export function extractCuffStyle(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  if (/\bextended\s*cuff\b/i.test(text)) return { value: "extended_cuff", confidence: 0.85 };
  if (/\b(beaded\s*cuff|beaded)\b/i.test(text)) return { value: "beaded_cuff", confidence: 0.85 };
  if (/\bnon[- ]?beaded\b/i.test(text)) return { value: "non_beaded", confidence: 0.85 };
  return { confidence: 0 };
}

/** Extract packaging (disposable). */
export function extractPackaging(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  const qty = num(row.case_qty ?? row.qty_per_case ?? row.box_qty) ?? num(row.pack_size);
  if (qty != null && qty >= 2000) return { value: "case_2000_plus_ct", confidence: 0.8 };
  if (qty != null && qty >= 1000) return { value: "case_1000_ct", confidence: 0.8 };
  if (qty != null && qty >= 200) return { value: "box_200_250_ct", confidence: 0.75 };
  if (qty != null && qty >= 100) return { value: "box_100_ct", confidence: 0.75 };
  if (/\b1000\s*\/\s*case\b|1000\/cs/i.test(text)) return { value: "case_1000_ct", confidence: 0.85 };
  if (/\b100\s*\/\s*box\b|100\/bx/i.test(text)) return { value: "box_100_ct", confidence: 0.85 };
  return { confidence: 0 };
}

/** Extract sterility (disposable). */
export function extractSterility(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  if (/\bsterile\b/i.test(text)) return { value: "sterile", confidence: 0.9 };
  if (/\bnon[- ]?sterile\b|non sterile/i.test(text)) return { value: "non_sterile", confidence: 0.85 };
  return { confidence: 0 };
}

/** Extract cut_level_ansi (work glove). */
export function extractCutLevelAnsi(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  const m = text.match(/\b(a\d)\b|ansi\s*(\d)|cut\s*level\s*(\d)/i);
  if (m) {
    const v = ("a" + (m[1] ?? m[2] ?? m[3])).toLowerCase();
    if (CUT_LEVEL_ANSI_OPTIONS.includes(v as typeof CUT_LEVEL_ANSI_OPTIONS[number])) return { value: v, confidence: 0.85 };
    return { value: v, confidence: 0.75 };
  }
  return { confidence: 0 };
}

/** Extract puncture_level (work glove). */
export function extractPunctureLevel(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  const m = text.match(/\b(p[1-5])\b|puncture\s*(\d)/i);
  if (m) {
    const v = ("p" + (m[1] ?? m[2])).toLowerCase();
    if (PUNCTURE_LEVEL_OPTIONS.includes(v as typeof PUNCTURE_LEVEL_OPTIONS[number])) return { value: v, confidence: 0.85 };
  }
  return { confidence: 0 };
}

/** Extract abrasion_level (work glove). */
export function extractAbrasionLevel(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  const m = text.match(/\blevel\s*([1-4])\b|abrasion\s*(\d)/i);
  if (m) {
    const v = "level_" + (m[1] ?? m[2]);
    if (ABRASION_LEVEL_OPTIONS.includes(v as typeof ABRASION_LEVEL_OPTIONS[number])) return { value: v, confidence: 0.85 };
  }
  return { confidence: 0 };
}

/** Extract warm_cold_weather (work glove). */
export function extractWarmColdWeather(row: RawRow): { value?: string; confidence: number } {
  const text = combinedText(row);
  if (/\binsulated\b|insulation/i.test(text)) return { value: "insulated", confidence: 0.85 };
  if (/\bwinter\b|cold\s*weather/i.test(text)) return { value: "winter", confidence: 0.85 };
  return { confidence: 0 };
}

/** Full extraction for disposable gloves: returns FilterAttributes + per-key confidence. */
export function extractDisposableGloveFilters(row: RawRow): { attributes: FilterAttributes; confidenceByKey: Record<string, number> } {
  const attributes: FilterAttributes = {};
  const confidenceByKey: Record<string, number> = {};

  const material = extractMaterial(row);
  if (material.value) { attributes.material = material.value; confidenceByKey.material = material.confidence; }

  const size = extractSize(row);
  if (size.value) { attributes.size = size.value; confidenceByKey.size = size.confidence; }

  const color = extractColor(row);
  if (color.value) { attributes.color = color.value; confidenceByKey.color = color.confidence; }

  const thickness = extractThicknessMil(row);
  if (thickness.value) { attributes.thickness_mil = thickness.value; confidenceByKey.thickness_mil = thickness.confidence; }

  const powder = extractPowder(row);
  if (powder.value) { attributes.powder = powder.value; confidenceByKey.powder = powder.confidence; }

  const grade = extractGrade(row);
  if (grade.value) { attributes.grade = grade.value; confidenceByKey.grade = grade.confidence; }

  const industries = extractIndustries(row);
  if (industries.value?.length) { attributes.industries = industries.value; confidenceByKey.industries = industries.confidence; }

  const compliance = extractCompliance(row);
  if (compliance.value?.length) { attributes.compliance_certifications = compliance.value; confidenceByKey.compliance_certifications = compliance.confidence; }

  const texture = extractTexture(row);
  if (texture.value) { attributes.texture = texture.value; confidenceByKey.texture = texture.confidence; }

  const cuff = extractCuffStyle(row);
  if (cuff.value) { attributes.cuff_style = cuff.value; confidenceByKey.cuff_style = cuff.confidence; }

  attributes.hand_orientation = "ambidextrous";
  confidenceByKey.hand_orientation = 0.5;

  const packaging = extractPackaging(row);
  if (packaging.value) { attributes.packaging = packaging.value; confidenceByKey.packaging = packaging.confidence; }

  const sterility = extractSterility(row);
  if (sterility.value) { attributes.sterility = sterility.value; confidenceByKey.sterility = sterility.confidence; }

  if (row.brand) { attributes.brand = str(row.brand); confidenceByKey.brand = 0.9; }

  return { attributes, confidenceByKey };
}

/** Full extraction for reusable work gloves. */
export function extractWorkGloveFilters(row: RawRow): { attributes: FilterAttributes; confidenceByKey: Record<string, number> } {
  const attributes: FilterAttributes = {};
  const confidenceByKey: Record<string, number> = {};

  const material = extractMaterial(row);
  if (material.value) { attributes.material = material.value; confidenceByKey.material = material.confidence; }

  const size = extractSize(row);
  if (size.value) { attributes.size = size.value; confidenceByKey.size = size.confidence; }

  const color = extractColor(row);
  if (color.value) { attributes.color = color.value; confidenceByKey.color = color.confidence; }

  const cut = extractCutLevelAnsi(row);
  if (cut.value) { attributes.cut_level_ansi = cut.value; confidenceByKey.cut_level_ansi = cut.confidence; }

  const puncture = extractPunctureLevel(row);
  if (puncture.value) { attributes.puncture_level = puncture.value; confidenceByKey.puncture_level = puncture.confidence; }

  const abrasion = extractAbrasionLevel(row);
  if (abrasion.value) { attributes.abrasion_level = abrasion.value; confidenceByKey.abrasion_level = abrasion.confidence; }

  const text = combinedText(row);
  if (/\bflame\s*resistant\b|fr\b/i.test(text)) { attributes.flame_resistant = "flame_resistant"; confidenceByKey.flame_resistant = 0.85; }

  const arcMatch = text.match(/\b(cal\s*[0-9]+|category\s*[1-4])\b/i);
  if (arcMatch) {
    const raw = arcMatch[1].toLowerCase();
    if (/cal\s*8/.test(raw)) { attributes.arc_rating = "cal_8"; confidenceByKey.arc_rating = 0.8; }
    else if (/cal\s*12/.test(raw)) { attributes.arc_rating = "cal_12"; confidenceByKey.arc_rating = 0.8; }
    else if (/cal\s*20/.test(raw)) { attributes.arc_rating = "cal_20"; confidenceByKey.arc_rating = 0.8; }
    else if (/category\s*1/.test(raw)) { attributes.arc_rating = "category_1"; confidenceByKey.arc_rating = 0.8; }
    else if (/category\s*2/.test(raw)) { attributes.arc_rating = "category_2"; confidenceByKey.arc_rating = 0.8; }
    else if (/category\s*3/.test(raw)) { attributes.arc_rating = "category_3"; confidenceByKey.arc_rating = 0.8; }
    else if (/category\s*4/.test(raw)) { attributes.arc_rating = "category_4"; confidenceByKey.arc_rating = 0.8; }
  }

  const weather = extractWarmColdWeather(row);
  if (weather.value) { attributes.warm_cold_weather = weather.value; confidenceByKey.warm_cold_weather = weather.confidence; }

  if (row.brand) { attributes.brand = str(row.brand); confidenceByKey.brand = 0.9; }

  return { attributes, confidenceByKey };
}
