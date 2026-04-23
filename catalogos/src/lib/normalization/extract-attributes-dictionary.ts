/**
 * Deterministic attribute extraction against the approved attribute dictionary.
 * Only allowed values are emitted; unknown values are captured as unmapped for review flags.
 * File: catalogos/src/lib/normalization/extract-attributes-dictionary.ts
 */

import type { CategorySlug } from "@/lib/catalogos/attribute-dictionary-types";
import type {
  NormalizedDisposableGloveAttributes,
  NormalizedWorkGloveAttributes,
} from "@/lib/catalogos/attribute-dictionary-types";
import {
  MATERIAL_VALUES,
  SIZE_VALUES,
  COLOR_VALUES,
  THICKNESS_MIL_VALUES,
  POWDER_VALUES,
  GRADE_VALUES,
  INDUSTRIES_VALUES,
  COMPLIANCE_VALUES,
  TEXTURE_VALUES,
  CUFF_STYLE_VALUES,
  HAND_ORIENTATION_VALUES,
  PACKAGING_VALUES,
  STERILITY_VALUES,
  CUT_LEVEL_ANSI_VALUES,
  PUNCTURE_LEVEL_VALUES,
  ABRASION_LEVEL_VALUES,
  FLAME_RESISTANT_VALUES,
  ARC_RATING_VALUES,
  WARM_COLD_WEATHER_VALUES,
} from "@/lib/catalogos/attribute-dictionary-types";
import { lookupAllowed, type SynonymMapOption } from "./synonym-lookup";
import { combinedText, num, strLower, parseThicknessFromRaw } from "./normalization-utils";

export type RawRow = Record<string, unknown>;

export interface ExtractOptions {
  /** DB-backed + in-memory merged synonym map for normalization. */
  synonymMap?: SynonymMapOption;
}

export interface ExtractionOutcome<T> {
  attributes: Partial<T>;
  confidenceByKey: Record<string, number>;
  unmapped: { attribute_key: string; raw_value: string }[];
}

/** Disposable gloves: extract only dictionary-allowed values; record unmapped. */
export function extractDisposableGloveAttributes(row: RawRow, options: ExtractOptions = {}): ExtractionOutcome<NormalizedDisposableGloveAttributes> {
  const { synonymMap } = options;
  const attributes: Partial<NormalizedDisposableGloveAttributes> = { category: "disposable_gloves" };
  const confidenceByKey: Record<string, number> = {};
  const unmapped: { attribute_key: string; raw_value: string }[] = [];

  const text = combinedText(row);

  // Material (only flag unmapped when row had explicit material that didn't map)
  const materialExplicit = strLower(row.material ?? row.type ?? row.glove_type);
  const materialFromText = extractMaterialFromText(text);
  const materialRaw = materialExplicit || materialFromText;
  const mat = lookupAllowed("material", materialRaw, MATERIAL_VALUES, synonymMap);
  if (mat.value) {
    attributes.material = mat.value;
    confidenceByKey.material = 0.9;
  } else if (mat.normalizedRaw && mat.unmapped && materialExplicit) unmapped.push({ attribute_key: "material", raw_value: mat.normalizedRaw });

  // Size
  const sizeRaw = strLower(row.size ?? row.sizes);
  const sz = lookupAllowed("size", sizeRaw || extractSizeFromText(text), SIZE_VALUES, synonymMap);
  if (sz.value) {
    attributes.size = sz.value;
    confidenceByKey.size = 0.9;
  } else if (sz.normalizedRaw && sz.unmapped) unmapped.push({ attribute_key: "size", raw_value: sz.normalizedRaw });

  // Color
  const colorRaw = strLower(row.color ?? row.colour) || text;
  const col = lookupAllowed("color", colorRaw || extractColorFromText(text), COLOR_VALUES, synonymMap);
  if (col.value) {
    attributes.color = col.value;
    confidenceByKey.color = 0.85;
  } else if (col.normalizedRaw && col.unmapped) unmapped.push({ attribute_key: "color", raw_value: col.normalizedRaw });

  // Brand (freeform but required; use raw trimmed)
  const brandRaw = String(row.brand ?? row.manufacturer ?? row.vendor ?? "").trim();
  if (brandRaw) {
    attributes.brand = brandRaw;
    confidenceByKey.brand = 0.9;
  }

  // Thickness: canonical parse so "12mil", "12-mil", "12 mil" → one value "12"; all thicknesses listed (no 7_plus)
  const thickNum = parseThicknessFromRaw(row.thickness ?? row.thickness_mil ?? row.mil, text);
  if (thickNum != null && thickNum >= 0) {
    const thickVal = String(thickNum);
    const t = lookupAllowed("thickness_mil", thickVal, THICKNESS_MIL_VALUES, synonymMap);
    if (t.value) {
      attributes.thickness_mil = t.value;
      confidenceByKey.thickness_mil = 0.9;
    } else if (t.unmapped) unmapped.push({ attribute_key: "thickness_mil", raw_value: thickVal });
  }

  // Powder (production-safe: yes/no, y/n, 1/0 map to powder_free/powdered)
  const powderExplicit = strLower(row.powder ?? row.powder_free ?? row.powdered);
  const powderFromText = /\bpowder[- ]?free\b|pf\b|powderfree/i.test(text) ? "powder_free" : /\bpowdered\b/i.test(text) ? "powdered" : "";
  const powderNormalized = (powderExplicit === "yes" || powderExplicit === "y" || powderExplicit === "1") ? "powder_free" : (powderExplicit === "no" || powderExplicit === "n" || powderExplicit === "0") ? "powdered" : powderExplicit;
  const powderRaw = powderNormalized || powderFromText;
  const pow = lookupAllowed("powder", powderRaw, POWDER_VALUES, synonymMap);
  if (pow.value) {
    attributes.powder = pow.value;
    confidenceByKey.powder = 0.9;
  } else if (pow.normalizedRaw && pow.unmapped) unmapped.push({ attribute_key: "powder", raw_value: pow.normalizedRaw });

  // Grade (production-safe: "food" → food_service_grade for lookup)
  const gradeExplicit = strLower(row.grade);
  const gradeFromText = /\b(medical|exam|exam grade|fda\s*approved)\b/i.test(text) ? "medical_exam_grade"
    : /\b(industrial|general purpose)\b/i.test(text) ? "industrial_grade"
    : /\b(food\s*service|food\s*safe|nsf|food\b)\b/i.test(text) ? "food_service_grade"
    : "";
  const gradeNormalized = gradeExplicit === "food" ? "food_service_grade" : gradeExplicit;
  const gradeRaw = gradeNormalized || gradeFromText;
  const gr = lookupAllowed("grade", gradeRaw, GRADE_VALUES, synonymMap);
  if (gr.value) {
    attributes.grade = gr.value;
    confidenceByKey.grade = 0.85;
  } else if (gr.normalizedRaw && gr.unmapped) unmapped.push({ attribute_key: "grade", raw_value: gr.normalizedRaw });

  // Industries (multi; only allowed values)
  const ind = extractIndustriesFromText(text);
  if (ind.length) {
    attributes.industries = ind.filter((v): v is (typeof INDUSTRIES_VALUES)[number] => INDUSTRIES_VALUES.includes(v));
    if (attributes.industries?.length) confidenceByKey.industries = 0.8;
  }

  // Compliance (multi)
  const comp = extractComplianceFromText(text);
  if (comp.length) {
    attributes.compliance_certifications = comp.filter((v): v is (typeof COMPLIANCE_VALUES)[number] => COMPLIANCE_VALUES.includes(v));
    if (attributes.compliance_certifications?.length) confidenceByKey.compliance_certifications = 0.85;
  }

  // Texture
  const texRaw = /\bfully\s*textured\b|fully text/i.test(text) ? "fully_textured"
    : /\bfingertip\s*textured\b|fingertip text/i.test(text) ? "fingertip_textured"
    : /\bsmooth\b/i.test(text) ? "smooth" : undefined;
  const tex = lookupAllowed("texture", texRaw, TEXTURE_VALUES, synonymMap);
  if (tex.value) { attributes.texture = tex.value; confidenceByKey.texture = 0.85; }

  // Cuff style
  const cuffRaw = /\bextended\s*cuff\b/i.test(text) ? "extended_cuff"
    : /\b(beaded\s*cuff|beaded)\b/i.test(text) ? "beaded_cuff"
    : /\bnon[- ]?beaded\b/i.test(text) ? "non_beaded" : undefined;
  const cuff = lookupAllowed("cuff_style", cuffRaw, CUFF_STYLE_VALUES, synonymMap);
  if (cuff.value) { attributes.cuff_style = cuff.value; confidenceByKey.cuff_style = 0.85; }

  // Hand orientation (default ambidextrous for gloves)
  attributes.hand_orientation = "ambidextrous";
  confidenceByKey.hand_orientation = 0.5;

  // Packaging
  const qty = num(row.case_qty ?? row.qty_per_case ?? row.box_qty ?? row.pack_size);
  let packRaw: string | undefined;
  if (qty != null && qty >= 2000) packRaw = "case_2000_plus_ct";
  else if (qty != null && qty >= 1000) packRaw = "case_1000_ct";
  else if (qty != null && qty >= 200) packRaw = "box_200_250_ct";
  else if (qty != null && qty >= 100) packRaw = "box_100_ct";
  else if (/\b1000\s*\/\s*case\b|1000\/cs/i.test(text)) packRaw = "case_1000_ct";
  else if (/\b100\s*\/\s*box\b|100\/bx|100\s*ct\b/i.test(text)) packRaw = "box_100_ct";
  const pack = lookupAllowed("packaging", packRaw, PACKAGING_VALUES, synonymMap);
  if (pack.value) {
    attributes.packaging = pack.value;
    confidenceByKey.packaging = packRaw ? 0.85 : 0.75;
  } else if (pack.normalizedRaw && pack.unmapped) unmapped.push({ attribute_key: "packaging", raw_value: pack.normalizedRaw });

  // Sterility
  const sterRaw = /\bsterile\b/i.test(text) ? "sterile" : /\bnon[- ]?sterile\b|non sterile/i.test(text) ? "non_sterile" : undefined;
  const ster = lookupAllowed("sterility", sterRaw, STERILITY_VALUES, synonymMap);
  if (ster.value) { attributes.sterility = ster.value; confidenceByKey.sterility = 0.85; }

  return { attributes, confidenceByKey, unmapped };
}

/** Work gloves: extract only dictionary-allowed values. */
export function extractWorkGloveAttributes(row: RawRow, options: ExtractOptions = {}): ExtractionOutcome<NormalizedWorkGloveAttributes> {
  const { synonymMap } = options;
  const attributes: Partial<NormalizedWorkGloveAttributes> = { category: "reusable_work_gloves" };
  const confidenceByKey: Record<string, number> = {};
  const unmapped: { attribute_key: string; raw_value: string }[] = [];

  const text = combinedText(row);

  // Material (optional for work gloves; only use explicit field or text-derived, not full title)
  const materialExplicit = strLower(row.material ?? row.type);
  const materialFromText = extractMaterialFromText(text);
  const materialRaw = materialExplicit || materialFromText;
  const mat = lookupAllowed("material", materialRaw, MATERIAL_VALUES, synonymMap);
  if (mat.value) { attributes.material = mat.value; confidenceByKey.material = 0.9; }
  else if (mat.normalizedRaw && mat.unmapped && materialExplicit) unmapped.push({ attribute_key: "material", raw_value: mat.normalizedRaw });

  const sizeRaw = strLower(row.size ?? row.sizes);
  const sz = lookupAllowed("size", sizeRaw || extractSizeFromText(text), SIZE_VALUES, synonymMap);
  if (sz.value) { attributes.size = sz.value; confidenceByKey.size = 0.9; }
  else if (sz.normalizedRaw && sz.unmapped) unmapped.push({ attribute_key: "size", raw_value: sz.normalizedRaw });

  const colorRaw = strLower(row.color ?? row.colour) || text;
  const col = lookupAllowed("color", colorRaw || extractColorFromText(text), COLOR_VALUES, synonymMap);
  if (col.value) { attributes.color = col.value; confidenceByKey.color = 0.85; }
  else if (col.normalizedRaw && col.unmapped) unmapped.push({ attribute_key: "color", raw_value: col.normalizedRaw });

  const brandRaw = String(row.brand ?? row.manufacturer ?? row.vendor ?? "").trim();
  if (brandRaw) { attributes.brand = brandRaw; confidenceByKey.brand = 0.9; }

  // Cut level ANSI (capture a1-a9 or digit from ansi/cut level)
  const cutM = text.match(/\b(a[1-9])\b|ansi\s*([1-9])|cut\s*level\s*([1-9])/i);
  if (cutM) {
    const v = (cutM[1] ?? "a" + (cutM[2] ?? cutM[3])).toLowerCase();
    const c = lookupAllowed("cut_level_ansi", v, CUT_LEVEL_ANSI_VALUES, synonymMap);
    if (c.value) { attributes.cut_level_ansi = c.value; confidenceByKey.cut_level_ansi = 0.85; }
    else if (c.unmapped) unmapped.push({ attribute_key: "cut_level_ansi", raw_value: v });
  }

  const punctureM = text.match(/\b(p[1-5])\b|puncture\s*(\d)/i);
  if (punctureM) {
    const v = ("p" + (punctureM[1] ?? punctureM[2])).toLowerCase();
    const p = lookupAllowed("puncture_level", v, PUNCTURE_LEVEL_VALUES, synonymMap);
    if (p.value) { attributes.puncture_level = p.value; confidenceByKey.puncture_level = 0.85; }
  }

  const abrasionM = text.match(/\blevel\s*([1-4])\b|abrasion\s*(\d)/i);
  if (abrasionM) {
    const v = "level_" + (abrasionM[1] ?? abrasionM[2]);
    const a = lookupAllowed("abrasion_level", v, ABRASION_LEVEL_VALUES);
    if (a.value) { attributes.abrasion_level = a.value; confidenceByKey.abrasion_level = 0.85; }
  }

  if (/\bflame\s*resistant\b|fr\b/i.test(text)) {
    attributes.flame_resistant = "flame_resistant";
    confidenceByKey.flame_resistant = 0.85;
  }

  const arcM = text.match(/\b(cal\s*[0-9]+|category\s*[1-4])\b/i);
  if (arcM) {
    const raw = arcM[1].toLowerCase();
    let arcVal: (typeof ARC_RATING_VALUES)[number] | undefined;
    if (/cal\s*8/.test(raw)) arcVal = "cal_8";
    else if (/cal\s*12/.test(raw)) arcVal = "cal_12";
    else if (/cal\s*20/.test(raw)) arcVal = "cal_20";
    else if (/category\s*1/.test(raw)) arcVal = "category_1";
    else if (/category\s*2/.test(raw)) arcVal = "category_2";
    else if (/category\s*3/.test(raw)) arcVal = "category_3";
    else if (/category\s*4/.test(raw)) arcVal = "category_4";
    if (arcVal) { attributes.arc_rating = arcVal; confidenceByKey.arc_rating = 0.8; }
  }

  const weather = /\bwinter\b|cold\s*weather/i.test(text) ? "winter" : /\binsulated\b|insulation/i.test(text) ? "insulated" : undefined;
  const w = lookupAllowed("warm_cold_weather", weather, WARM_COLD_WEATHER_VALUES, synonymMap);
  if (w.value) { attributes.warm_cold_weather = w.value; confidenceByKey.warm_cold_weather = 0.85; }

  return { attributes, confidenceByKey, unmapped };
}

function parseMilFromText(text: string): number | undefined {
  return parseThicknessFromRaw(null, text);
}

function extractMaterialFromText(text: string): string {
  if (/\bnitrile\b/i.test(text)) return "nitrile";
  if (/\blatex\b/i.test(text)) return "latex";
  if (/\bvinyl\b/i.test(text)) return "vinyl";
  if (/\bpoly(?:ethylene)?\b|pe\b/i.test(text)) return "polyethylene_pe";
  return "";
}

function extractSizeFromText(text: string): string {
  const m = text.match(/\b(xs|s|m|l|xl|xxl)\b/i);
  return m ? m[1].toLowerCase() : "";
}

function extractColorFromText(text: string): string {
  if (/\b(light[- ]?blue|lt blue)\b/i.test(text)) return "light_blue";
  for (const c of COLOR_VALUES) {
    const re = new RegExp("\\b" + c.replace("_", "[- ]?") + "\\b", "i");
    if (re.test(text)) return c;
  }
  return "";
}

function extractIndustriesFromText(text: string): (typeof INDUSTRIES_VALUES)[number][] {
  const found: (typeof INDUSTRIES_VALUES)[number][] = [];
  const map: [RegExp, (typeof INDUSTRIES_VALUES)[number]][] = [
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
  return found;
}

function extractComplianceFromText(text: string): (typeof COMPLIANCE_VALUES)[number][] {
  const found: (typeof COMPLIANCE_VALUES)[number][] = [];
  const map: [RegExp, (typeof COMPLIANCE_VALUES)[number]][] = [
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
  return found;
}
