/**
 * Canonical display labels for catalog attribute value slugs.
 * Stored values remain lowercase slugs in product_attributes — labels are UI-only.
 * Keep slugs in sync with catalogos/src/lib/catalogos/attribute-dictionary-types.ts.
 */

// -----------------------------------------------------------------------------
// Canonical slug lists (mirror attribute-dictionary-types.ts)
// -----------------------------------------------------------------------------

export const INDUSTRY_SLUGS = [
  "agriculture",
  "automotive",
  "beauty_personal_care",
  "cannabis",
  "chemical_processing",
  "cold_chain_outdoor",
  "construction",
  "dental",
  "education",
  "electrical",
  "electronics_assembly",
  "emergency_services",
  "food_processing",
  "food_service",
  "healthcare",
  "home_use",
  "hospitality",
  "hvac",
  "industrial",
  "janitorial",
  "landscaping_grounds",
  "laboratories",
  "metal_fabrication",
  "oil_gas_energy",
  "painting",
  "pharmaceuticals",
  "plumbing",
  "retail_grocery",
  "sanitation",
  "security_public_safety",
  "tattoo_body_art",
  "veterinary",
  "warehousing_logistics",
] as const;

export const USE_SLUGS = [
  "abrasion_protection",
  "automotive_repair",
  "beauty_services",
  "chemical_handling",
  "cleaning",
  "cleanroom",
  "construction_work",
  "cut_protection",
  "dental_procedure",
  "dishwashing",
  "food_handling",
  "food_preparation",
  "general_purpose",
  "grip_work",
  "hair_coloring",
  "heat_protection",
  "cold_protection",
  "industrial_maintenance",
  "janitorial",
  "laboratory",
  "material_handling",
  "mechanical_work",
  "medical_exam",
  "painting",
  "patient_care",
  "ppe",
  "sanitation",
  "tattooing",
  "warehouse_work",
] as const;

/** Disposable / medical / food-contact certification slugs (UI grouping). */
export const DISPOSABLE_CERTIFICATION_SLUGS = [
  "astm_d6319",
  "astm_d3578",
  "astm_d5250",
  "fda_food_contact",
  "fda_510k",
  "medical_exam_grade_cert",
  "chemo_tested",
  "fentanyl_tested",
  "chemotherapy_drug_tested",
  "aql_1_5",
  "aql_2_5",
  "aql_4_0",
  "powder_free",
  "latex_free",
  "iso_13485",
  "en_455",
  "en_374",
  // Legacy slugs — still displayable
  "fda_approved",
  "astm_tested",
  "food_safe",
  "chemo_rated",
] as const;

/** Reusable / safety certification slugs (UI grouping). */
export const SAFETY_CERTIFICATION_SLUGS = [
  "ansi_isea_105",
  "en_388",
  "en_407",
  "en_511",
  "en_iso_374",
  "ce",
  "ukca",
  "reach",
  "oeko_tex",
  "nfpa_70e",
  "arc_flash_rated",
  "impact_rated",
  "cut_rated",
  "puncture_rated",
] as const;

/** Preferred store sidebar order (subset may omit slugs not in facet). */
export const STORE_INDUSTRY_DISPLAY_ORDER: readonly string[] = [
  "healthcare",
  "dental",
  "veterinary",
  "laboratories",
  "pharmaceuticals",
  "food_service",
  "hospitality",
  "food_processing",
  "education",
  "retail_grocery",
  "home_use",
  "janitorial",
  "sanitation",
  "beauty_personal_care",
  "tattoo_body_art",
  "automotive",
  "electronics_assembly",
  "construction",
  "plumbing",
  "electrical",
  "hvac",
  "painting",
  "warehousing_logistics",
  "metal_fabrication",
  "chemical_processing",
  "industrial",
  "cold_chain_outdoor",
  "agriculture",
  "cannabis",
  "oil_gas_energy",
  "landscaping_grounds",
  "emergency_services",
  "security_public_safety",
];

// -----------------------------------------------------------------------------
// Label maps
// -----------------------------------------------------------------------------

const GLOBAL_LABELS: Record<string, string> = {
  nitrile: "Nitrile",
  latex: "Latex",
  vinyl: "Vinyl",
  polyethylene_pe: "Polyethylene (PE)",
  polyethylene: "Polyethylene (PE)",
  neoprene: "Neoprene",
  blend: "Blend",
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
  xxl: "XXL",
  xxxl: "XXXL",
  blue: "Blue",
  purple: "Purple",
  black: "Black",
  white: "White",
  light_blue: "Light Blue",
  orange: "Orange",
  violet: "Violet",
  blue_violet: "Blue Violet",
  green: "Green",
  tan: "Tan",
  gray: "Gray",
  beige: "Beige",
  yellow: "Yellow",
  brown: "Brown",
  pink: "Pink",
  clear: "Clear",
};

const GRADE_LABELS: Record<string, string> = {
  industrial_grade: "Industrial Grade",
  food_service_grade: "Food Service Grade",
  medical_exam_grade: "Medical Exam Grade",
  surgical_grade: "Surgical Grade",
  cleanroom_grade: "Cleanroom Grade",
  chemical_resistant: "Chemical Resistant",
  general_purpose: "General Purpose",
};

const POWDER_LABELS: Record<string, string> = {
  powder_free: "Powder Free",
  powdered: "Powdered",
};

const TEXTURE_LABELS: Record<string, string> = {
  smooth: "Smooth",
  fingertip_textured: "Textured Fingertips",
  fully_textured: "Fully Textured",
  micro_textured: "Micro Textured",
  diamond_texture: "Diamond Texture",
  fish_scale: "Fish Scale",
  sandy_grip: "Sandy Grip",
  foam_grip: "Foam Grip",
  crinkle_grip: "Crinkle Grip",
  raised_diamond: "Raised Diamond",
  embossed: "Embossed",
  grip_dots: "Grip Dots",
};

const CUFF_LABELS: Record<string, string> = {
  beaded_cuff: "Beaded Cuff",
  non_beaded: "Non-Beaded",
  extended_cuff: "Extended Cuff",
};

const PACKAGING_LABELS: Record<string, string> = {
  box_100_ct: "Box 100 ct",
  box_200_250_ct: "Box 200–250 ct",
  case_1000_ct: "Case 1000 ct",
  case_2000_plus_ct: "Case 2000+ ct",
};

const BOX_QUANTITY_LABELS: Record<string, string> = {
  "50": "50",
  "90": "90",
  "100": "100",
  "150": "150",
  "200": "200",
  "250": "250",
  "300": "300",
};

const CASE_QUANTITY_LABELS: Record<string, string> = {
  "250": "250",
  "500": "500",
  "1000": "1000",
  "1500": "1500",
  "2000": "2000",
  "2500": "2500",
  "3000": "3000",
};

const PACK_QUANTITY_LABELS: Record<string, string> = {
  each: "Each",
  pair: "Pair",
  dozen: "Dozen",
  pack: "Pack",
  case: "Case",
};

const INDUSTRY_LABELS: Record<string, string> = {
  agriculture: "Agriculture",
  automotive: "Automotive",
  beauty_personal_care: "Beauty / Salon",
  cannabis: "Cannabis",
  chemical_processing: "Chemical Processing",
  cold_chain_outdoor: "Cold Storage & Outdoor",
  construction: "Construction",
  dental: "Dental",
  education: "Education",
  electrical: "Electrical",
  electronics_assembly: "Electronics & Assembly",
  emergency_services: "Emergency Response",
  food_processing: "Food Processing",
  food_service: "Food Service",
  healthcare: "Healthcare",
  home_use: "Home Use",
  hospitality: "Hospitality",
  hvac: "HVAC",
  industrial: "Industrial",
  janitorial: "Janitorial",
  landscaping_grounds: "Landscaping & Grounds",
  laboratories: "Laboratory",
  metal_fabrication: "Metal Fabrication",
  oil_gas_energy: "Oil, Gas & Energy",
  painting: "Painting",
  pharmaceuticals: "Pharmaceutical",
  plumbing: "Plumbing",
  retail_grocery: "Retail",
  sanitation: "Cleaning / Sanitation",
  security_public_safety: "Law Enforcement",
  tattoo_body_art: "Tattoo",
  veterinary: "Veterinary",
  warehousing_logistics: "Warehousing & Logistics",
};

const USE_LABELS: Record<string, string> = {
  abrasion_protection: "Abrasion Protection",
  automotive_repair: "Automotive Repair",
  beauty_services: "Beauty Services",
  chemical_handling: "Chemical Handling",
  cleaning: "Cleaning",
  cleanroom: "Cleanroom",
  construction_work: "Construction Work",
  cut_protection: "Cut Protection",
  dental_procedure: "Dental Procedure",
  dishwashing: "Dishwashing",
  food_handling: "Food Handling",
  food_preparation: "Food Preparation",
  general_purpose: "General Purpose",
  grip_work: "Grip Work",
  hair_coloring: "Hair Coloring",
  heat_protection: "Heat Protection",
  cold_protection: "Cold Protection",
  industrial_maintenance: "Industrial Maintenance",
  janitorial: "Janitorial",
  laboratory: "Laboratory Work",
  material_handling: "Material Handling",
  mechanical_work: "Mechanical Work",
  medical_exam: "Medical Exam",
  painting: "Painting",
  patient_care: "Patient Care",
  ppe: "PPE",
  sanitation: "Sanitation",
  tattooing: "Tattooing",
  warehouse_work: "Warehouse Work",
};

const CERTIFICATION_LABELS: Record<string, string> = {
  astm_d6319: "ASTM D6319",
  astm_d3578: "ASTM D3578",
  astm_d5250: "ASTM D5250",
  fda_food_contact: "FDA Food Contact",
  fda_510k: "FDA 510(k)",
  medical_exam_grade_cert: "Medical Exam Grade",
  chemo_tested: "Chemo Tested",
  fentanyl_tested: "Fentanyl Tested",
  chemotherapy_drug_tested: "Chemotherapy Drug Tested",
  aql_1_5: "AQL 1.5",
  aql_2_5: "AQL 2.5",
  aql_4_0: "AQL 4.0",
  powder_free: "Powder Free",
  latex_free: "Latex Free",
  iso_13485: "ISO 13485",
  en_455: "EN 455",
  en_374: "EN 374",
  fda_approved: "FDA Approved",
  astm_tested: "ASTM Tested",
  food_safe: "Food Safe",
  chemo_rated: "Chemo Rated",
  ansi_isea_105: "ANSI/ISEA 105",
  en_388: "EN 388",
  en_407: "EN 407",
  en_511: "EN 511",
  en_iso_374: "EN ISO 374",
  ce: "CE",
  ukca: "UKCA",
  reach: "REACH",
  oeko_tex: "OEKO-TEX",
  nfpa_70e: "NFPA 70E",
  arc_flash_rated: "Arc Flash Rated",
  impact_rated: "Impact Rated",
  cut_rated: "Cut Rated",
  puncture_rated: "Puncture Rated",
};

const PROTECTION_TAG_LABELS: Record<string, string> = {
  chemical_resistant: "Chemical Resistant",
  puncture_resistant: "Puncture Resistant",
  viral_barrier: "Viral Barrier",
  biohazard: "Biohazard",
  static_control: "Static Control",
  grip_enhanced: "Grip Enhanced",
  abrasion_enhanced: "Abrasion Enhanced",
};

const STERILITY_LABELS: Record<string, string> = {
  non_sterile: "Non-Sterile",
  sterile: "Sterile",
};

const HAND_ORIENTATION_LABELS: Record<string, string> = {
  ambidextrous: "Ambidextrous",
};

const COATING_LABELS: Record<string, string> = {
  nitrile: "Nitrile",
  latex: "Latex",
  pu: "PU",
  pvc: "PVC",
  foam: "Foam",
};

const LINER_LABELS: Record<string, string> = {
  hppe: "HPPE",
  aramid: "Aramid",
  cotton: "Cotton",
  polyester: "Polyester",
};

/** attribute_key → value slug → display label */
export const ATTRIBUTE_VALUE_LABELS: Record<string, Record<string, string>> = {
  material: GLOBAL_LABELS,
  color: GLOBAL_LABELS,
  size: GLOBAL_LABELS,
  grade: GRADE_LABELS,
  powder: POWDER_LABELS,
  texture: TEXTURE_LABELS,
  cuff_style: CUFF_LABELS,
  packaging: PACKAGING_LABELS,
  box_quantity: BOX_QUANTITY_LABELS,
  case_quantity: CASE_QUANTITY_LABELS,
  pack_quantity: PACK_QUANTITY_LABELS,
  units_per_case: {},
  cases_per_pallet: {},
  pallet_pricing_available: { yes: "Yes", no: "No", true: "Yes", false: "No" },
  industries: INDUSTRY_LABELS,
  uses: USE_LABELS,
  certifications: CERTIFICATION_LABELS,
  protection_tags: PROTECTION_TAG_LABELS,
  sterility: STERILITY_LABELS,
  hand_orientation: HAND_ORIENTATION_LABELS,
  coating: COATING_LABELS,
  liner: LINER_LABELS,
};

function titleCaseSlug(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Mil thickness: display as "3 Mil" / "0.5 Mil" when numeric. */
function formatThicknessLabel(value: string): string {
  if (/^\d+(\.\d+)?$/.test(value)) return `${value} Mil`;
  return titleCaseSlug(value);
}

export function formatAttributeValueLabel(attributeKey: string, value: string): string {
  const v = value.trim();
  if (!v) return "";

  if (attributeKey === "thickness_mil") return formatThicknessLabel(v);

  if (attributeKey === "units_per_case" || attributeKey === "cases_per_pallet") {
    const n = Number(v.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return n.toLocaleString("en-US");
  }

  const mapped = ATTRIBUTE_VALUE_LABELS[attributeKey]?.[v];
  if (mapped) return mapped;

  const global = GLOBAL_LABELS[v];
  if (global) return global;

  return titleCaseSlug(v);
}

export function getIndustryOptionsForDisplay(): { value: string; label: string }[] {
  return INDUSTRY_SLUGS.map((value) => ({
    value,
    label: INDUSTRY_LABELS[value] ?? titleCaseSlug(value),
  }));
}

export function getUseOptionsForDisplay(): { value: string; label: string }[] {
  return USE_SLUGS.map((value) => ({
    value,
    label: USE_LABELS[value] ?? titleCaseSlug(value),
  }));
}

export function getCertificationOptionsForDisplay(): {
  disposable: { value: string; label: string }[];
  safety: { value: string; label: string }[];
} {
  return {
    disposable: DISPOSABLE_CERTIFICATION_SLUGS.map((value) => ({
      value,
      label: CERTIFICATION_LABELS[value] ?? titleCaseSlug(value),
    })),
    safety: SAFETY_CERTIFICATION_SLUGS.map((value) => ({
      value,
      label: CERTIFICATION_LABELS[value] ?? titleCaseSlug(value),
    })),
  };
}

/** Store sidebar rows — ordered subset using canonical labels. */
export function getStoreIndustryFacetRows(): { value: string; label: string }[] {
  const seen = new Set<string>();
  const rows: { value: string; label: string }[] = [];
  for (const value of STORE_INDUSTRY_DISPLAY_ORDER) {
    if (seen.has(value)) continue;
    seen.add(value);
    rows.push({
      value,
      label: INDUSTRY_LABELS[value] ?? titleCaseSlug(value),
    });
  }
  return rows;
}
