import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";

/** Combined searchable text from an import draft (URL extraction + description). */
export function importDraftCombinedText(draft: ImportDraftProductV1): string {
  return [
    draft.product_name,
    draft.description,
    draft.brand,
    draft.material,
    draft.color,
    draft.glove_grade,
    draft.case_pack,
    draft.size,
    ...(draft.certification_slugs ?? []),
    ...(draft.parse_warnings ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

type IndustryRule = [RegExp, string];
type MultiRule = [RegExp, string];

const INDUSTRY_RULES: IndustryRule[] = [
  [/\b(healthcare|medical|hospital|clinic)\b/i, "healthcare"],
  [/\b(dental|orthodont)\b/i, "dental"],
  [/\b(veterinar|animal\s*care)\b/i, "veterinary"],
  [/\b(food\s*service|restaurant|hospitality)\b/i, "food_service"],
  [/\b(food\s*processing)\b/i, "food_processing"],
  [/\b(janitorial|janitor|cleaning)\b/i, "janitorial"],
  [/\b(sanitation)\b/i, "sanitation"],
  [/\b(lab(oratory)?)\b/i, "laboratories"],
  [/\b(pharmaceutical|compounding)\b/i, "pharmaceuticals"],
  [/\b(beauty|personal\s*care|salon|spa)\b/i, "beauty_personal_care"],
  [/\b(tattoo|body\s*art|piercing)\b/i, "tattoo_body_art"],
  [/\b(automotive|collision|mechanic\s*shop)\b/i, "automotive"],
  [/\b(education|school|childcare|daycare)\b/i, "education"],
  [/\b(retail|grocery|deli)\b/i, "retail_grocery"],
  [/\b(electronics|cleanroom|assembly)\b/i, "electronics_assembly"],
  [/\b(construction|concrete|masonry)\b/i, "construction"],
  [/\b(warehouse|logistics|fulfillment|distribution\s*center)\b/i, "warehousing_logistics"],
  [/\b(metal\s*fabrication|welding)\b/i, "metal_fabrication"],
  [/\b(chemical\s*processing|refiner(y|ies))\b/i, "chemical_processing"],
  [/\b(industrial|manufacturing|plant|mill)\b/i, "industrial"],
  [/\b(cold\s*chain|freezer|cold\s*storage)\b/i, "cold_chain_outdoor"],
  [/\b(agricultur|farming|farm)\b/i, "agriculture"],
  [/\b(oil\s*(and|&)?\s*gas|petrochemical|energy\s*field)\b/i, "oil_gas_energy"],
  [/\b(landscap|grounds\s*keeping|grounds\s*maintenance)\b/i, "landscaping_grounds"],
  [/\b(fire|ems|rescue|paramedic)\b/i, "emergency_services"],
  [/\b(security|patrol|law\s*enforcement|correction)\b/i, "security_public_safety"],
];

const USE_RULES: MultiRule[] = [
  [/\b(clean\s*room|cleanroom)\b/i, "cleanroom"],
  [/\b(laboratory|lab\s+use)\b/i, "laboratory"],
  [/\b(medical\s*exam|exam\s*glove|procedure)\b/i, "medical_exam"],
  [/\bpatient\s*care\b/i, "patient_care"],
  [/\b(food\s*handling|food\s*prep)\b/i, "food_handling"],
  [/\b(chemical|solvent)\b/i, "chemical_handling"],
  [/\b(industrial|maintenance|mechanic)\b/i, "industrial_maintenance"],
  [/\b(janitorial|sanitation)\b/i, "janitorial"],
  [/\bgeneral\s*purpose\b/i, "general_purpose"],
];

const CERT_RULES: MultiRule[] = [
  [/\bfda\s*approved\b/i, "fda_approved"],
  [/\bastm\s*d6319\b/i, "astm_d6319"],
  [/\bastm\s*f1671\b/i, "astm_f1671"],
  [/\bastm\b/i, "astm_tested"],
  [/\bfood\s*safe\b|nsf/i, "food_safe"],
  [/\blatex[- ]?free\b|latex free/i, "latex_free"],
  [/\bchemo\b/i, "chemo_rated"],
  [/\ben\s*455\b/i, "en_455"],
  [/\ben\s*374\b/i, "en_374"],
  [/\bfda\s*510k\b/i, "fda_510k"],
];

const PROTECTION_RULES: MultiRule[] = [
  [/\bchemical\s*(resistant|resistance)\b/i, "chemical_resistant"],
  [/\bpuncture\s*(resistant|resistance)\b/i, "puncture_resistant"],
  [/\b(viral|pathogen)\b/i, "viral_barrier"],
  [/\bbiohazard\b/i, "biohazard"],
  [/\b(esd|static\s*control)\b/i, "static_control"],
  [/\b(grip|micro[- ]?textured|textured)\b/i, "grip_enhanced"],
  [/\babrasion\b/i, "abrasion_enhanced"],
];

function matchRules(text: string, rules: MultiRule[]): string[] {
  const found: string[] = [];
  for (const [re, val] of rules) {
    if (re.test(text) && !found.includes(val)) found.push(val);
  }
  return found;
}

function filterAllowed(values: string[], allowed: string[]): string[] {
  const set = new Set(allowed);
  return values.filter((v) => set.has(v));
}

function mergeMulti(
  current: string | string[] | undefined,
  additions: string[]
): string[] {
  const base = Array.isArray(current) ? [...current] : current ? [String(current)] : [];
  for (const v of additions) {
    if (!base.includes(v)) base.push(v);
  }
  return base;
}

/** Infer industries/uses/certs/etc. from draft text + structured signals (grade, material, flags). */
export function inferGloveAttributesFromDraft(
  draft: ImportDraftProductV1,
  allowedByKey: Map<string, string[]>
): Record<string, string | string[]> {
  const text = importDraftCombinedText(draft);
  const out: Record<string, string | string[]> = {};

  const grade =
    draft.glove_grade ??
    (draft.exam_grade ? "medical_exam_grade" : draft.food_safe ? "food_service_grade" : null);

  const industries = new Set(matchRules(text, INDUSTRY_RULES));
  if (grade === "medical_exam_grade" || draft.exam_grade) {
    for (const v of ["healthcare", "dental", "laboratories", "pharmaceuticals", "education"]) {
      industries.add(v);
    }
  }
  if (grade === "food_service_grade" || draft.food_safe) {
    for (const v of ["food_service", "food_processing", "retail_grocery", "education"]) {
      industries.add(v);
    }
  }
  if (/\bnitrile\b/i.test(text) && (grade === "medical_exam_grade" || draft.exam_grade)) {
    for (const v of ["healthcare", "laboratories", "janitorial", "industrial"]) industries.add(v);
  }
  if (/\b(vinyl|polyethylene)\b/i.test(text)) {
    industries.add("food_service");
    industries.add("food_processing");
  }

  const industryAllowed = allowedByKey.get("industries") ?? [];
  const industryVals = filterAllowed([...industries], industryAllowed);
  if (industryVals.length) out.industries = industryVals;

  const uses = new Set(matchRules(text, USE_RULES));
  if (grade === "medical_exam_grade" || draft.exam_grade) {
    for (const v of ["medical_exam", "patient_care", "general_purpose"]) uses.add(v);
  }
  if (draft.food_safe || grade === "food_service_grade") uses.add("food_handling");
  if (/\bnitrile\b/i.test(text)) uses.add("chemical_handling");
  const useAllowed = allowedByKey.get("uses") ?? [];
  const useVals = filterAllowed([...uses], useAllowed);
  if (useVals.length) out.uses = useVals;

  const certs = new Set(matchRules(text, CERT_RULES));
  if (draft.latex_free) certs.add("latex_free");
  if (draft.food_safe) certs.add("fda_food_contact");
  if (grade === "medical_exam_grade" || draft.exam_grade) {
    certs.add("astm_d6319");
    certs.add("fda_510k");
  }
  for (const c of draft.certification_slugs ?? []) certs.add(c);
  const certAllowed = allowedByKey.get("certifications") ?? [];
  const certVals = filterAllowed([...certs], certAllowed);
  if (certVals.length) out.certifications = certVals;

  const protAllowed = allowedByKey.get("protection_tags") ?? [];
  const protVals = filterAllowed(matchRules(text, PROTECTION_RULES), protAllowed);
  if (protVals.length) out.protection_tags = protVals;

  const textureAllowed = allowedByKey.get("texture") ?? [];
  let texture: string | undefined;
  if (/\bfully\s*textured\b/i.test(text)) texture = "fully_textured";
  else if (/\bfingertip\s*textured\b|micro[- ]?textured\b/i.test(text)) texture = "fingertip_textured";
  else if (/\bsmooth\b/i.test(text)) texture = "smooth";
  else if (/\btextured\b/i.test(text)) texture = "fingertip_textured";
  if (texture && textureAllowed.includes(texture)) out.texture = texture;

  const cuffAllowed = allowedByKey.get("cuff_style") ?? [];
  let cuff: string | undefined;
  if (/\bextended\s*cuff\b/i.test(text)) cuff = "extended_cuff";
  else if (/\b(beaded\s*cuff|beaded)\b/i.test(text)) cuff = "beaded_cuff";
  else if (/\bnon[- ]?beaded\b/i.test(text)) cuff = "non_beaded";
  if (cuff && cuffAllowed.includes(cuff)) out.cuff_style = cuff;

  const handAllowed = allowedByKey.get("hand_orientation") ?? [];
  if (handAllowed.includes("ambidextrous")) out.hand_orientation = "ambidextrous";

  const sterilityAllowed = allowedByKey.get("sterility") ?? [];
  const sterility = /\bsterile\b/i.test(text)
    ? "sterile"
    : /\bnon[- ]?sterile\b/i.test(text)
      ? "non_sterile"
      : "non_sterile";
  if (sterilityAllowed.includes(sterility)) out.sterility = sterility;

  const packagingAllowed = allowedByKey.get("packaging") ?? [];
  const upc = draft.commerce_packaging?.units_per_case ?? draft.units_per_case;
  let packaging: string | undefined;
  if (upc != null && upc >= 2000) packaging = "case_2000_plus_ct";
  else if (upc != null && upc >= 1000) packaging = "case_1000_ct";
  else if (upc != null && upc >= 200) packaging = "box_200_250_ct";
  else if (upc != null && upc >= 100) packaging = "box_100_ct";
  if (packaging && packagingAllowed.includes(packaging)) out.packaging = packaging;

  return out;
}

/** Fill only attribute keys that are currently empty. */
export function mergeInferredAttributes(
  current: Record<string, string | string[]>,
  inferred: Record<string, string | string[]>
): Record<string, string | string[]> {
  const patch: Record<string, string | string[]> = {};
  for (const [key, val] of Object.entries(inferred)) {
    const cur = current[key];
    if (cur === undefined || cur === "" || (Array.isArray(cur) && cur.length === 0)) {
      patch[key] = val;
      continue;
    }
    if (Array.isArray(val) && Array.isArray(cur)) {
      const merged = mergeMulti(cur, val);
      if (merged.length > cur.length) patch[key] = merged;
    } else if (Array.isArray(val) && !Array.isArray(cur) && cur) {
      const merged = mergeMulti(cur, val);
      if (merged.length > 1) patch[key] = merged;
    }
  }
  return patch;
}
