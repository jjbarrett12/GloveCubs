/**
 * Controlled vocabulary for product filter attributes (Quick Add by URL).
 * AI and heuristics must only output values from these sets.
 */

const MATERIAL = ['nitrile', 'latex', 'vinyl', 'polyethylene_pe'];
const SIZE = ['xs', 's', 'm', 'l', 'xl', 'xxl'];
const COLOR = ['blue', 'purple', 'black', 'white', 'light_blue', 'orange', 'green', 'tan', 'gray', 'brown', 'pink', 'yellow', 'navy', 'red', 'grey'];
const THICKNESS_MIL = ['2', '3', '4', '5', '6', '7_plus'];
const POWDER = ['powder_free', 'powdered'];
const GRADE = ['medical_exam', 'industrial', 'food_service'];
const CATEGORY = ['disposable_gloves', 'reusable_work_gloves'];
const INDUSTRIES = [
  'healthcare', 'food_service', 'food_processing', 'janitorial', 'sanitation',
  'laboratories', 'pharmaceuticals', 'beauty_personal_care', 'tattoo_body_art',
  'automotive', 'education'
];
const COMPLIANCE = ['fda_approved', 'astm_tested', 'food_safe', 'latex_free', 'chemo_rated', 'en455', 'en374'];
const CUT_LEVEL_ANSI = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'];
const PUNCTURE_LEVEL = ['p1', 'p2', 'p3', 'p4', 'p5'];
const ABRASION_LEVEL = ['level_1', 'level_2', 'level_3', 'level_4'];
const ARC_RATING = ['category_1', 'category_2', 'category_3', 'category_4', '8_cal', '12_cal', '20_cal'];
const WARM_COLD = ['insulated', 'winter', 'cold_weather', 'heated'];
const TEXTURE = ['smooth', 'fingertip_textured', 'fully_textured'];
const CUFF_STYLE = ['beaded', 'non_beaded', 'extended'];
const HAND_ORIENTATION = ['ambidextrous'];
const PACKAGING = ['box_100', 'box_200_250', 'case_1000', 'case_2000_plus'];
const STERILITY = ['non_sterile', 'sterile'];

const Taxonomy = {
  category: CATEGORY,
  material: MATERIAL,
  size: SIZE,
  color: COLOR,
  thickness_mil: THICKNESS_MIL,
  powder: POWDER,
  grade: GRADE,
  industries: INDUSTRIES,
  compliance: COMPLIANCE,
  cut_level_ansi: CUT_LEVEL_ANSI,
  puncture_level: PUNCTURE_LEVEL,
  abrasion_level: ABRASION_LEVEL,
  arc_rating: ARC_RATING,
  warm_cold: WARM_COLD,
  texture: TEXTURE,
  cuff_style: CUFF_STYLE,
  hand_orientation: HAND_ORIENTATION,
  packaging: PACKAGING,
  sterility: STERILITY,
};

/** Normalize a string to a taxonomy value (lowercase, underscores). */
function normalizeToken(s) {
  if (s == null || typeof s !== 'string') return null;
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_') || null;
}

/** Check if value is in allowed set (case-insensitive, accepts underscores). */
function isAllowed(facet, value) {
  const allowed = Taxonomy[facet];
  if (!allowed || !Array.isArray(allowed)) return false;
  const v = normalizeToken(value);
  if (!v) return false;
  return allowed.some((a) => normalizeToken(a) === v || a === v);
}

/** Coerce single value to allowed set; return null if invalid. */
function coerceOne(facet, value) {
  const allowed = Taxonomy[facet];
  if (!allowed || !Array.isArray(allowed)) return null;
  const v = normalizeToken(value);
  if (!v) return null;
  const match = allowed.find((a) => normalizeToken(a) === v || a === v);
  return match || null;
}

/** Coerce array of values to allowed set; filter invalid. */
function coerceMany(facet, values) {
  if (!Array.isArray(values)) return [];
  const allowed = new Set(Taxonomy[facet] || []);
  const out = [];
  for (const v of values) {
    const one = coerceOne(facet, v);
    if (one && !out.includes(one)) out.push(one);
  }
  return out;
}

module.exports = {
  MATERIAL,
  SIZE,
  COLOR,
  THICKNESS_MIL,
  POWDER,
  GRADE,
  CATEGORY,
  INDUSTRIES,
  COMPLIANCE,
  CUT_LEVEL_ANSI,
  PUNCTURE_LEVEL,
  ABRASION_LEVEL,
  ARC_RATING,
  WARM_COLD,
  TEXTURE,
  CUFF_STYLE,
  HAND_ORIENTATION,
  PACKAGING,
  STERILITY,
  Taxonomy,
  normalizeToken,
  isAllowed,
  coerceOne,
  coerceMany,
};
