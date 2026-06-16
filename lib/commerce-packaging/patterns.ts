/** Regex patterns for commerce packaging extraction — ordered within each group. */

export type PatternDef = {
  name: string;
  re: RegExp;
  /** Which capture groups map to fields */
  map:
    | "units_per_inner"
    | "inners_per_case"
    | "units_per_case"
    | "cases_per_pallet"
    | "units_per_pallet"
    | "inner_dozen_case"
    | "pairs_per_case"
    | "slash_case"
    | "put_up_case"
    | "case_price"
    | "pallet_price";
};

export const UNITS_PER_INNER_PATTERNS: PatternDef[] = [
  { name: "gloves_per_box", re: /(\d{1,5})\s*(?:gloves|pcs|units|ct)?\s*(?:per|\/)\s*(?:box|bx)\b/i, map: "units_per_inner" },
  { name: "per_box_explicit", re: /(\d{1,5})\s*(?:per|\/)\s*(?:box|bx)\b/i, map: "units_per_inner" },
  { name: "pairs_per_dozen", re: /(\d{1,3})\s*pairs?\s*(?:per|\/)\s*dozen\b/i, map: "units_per_inner" },
  { name: "pairs_per_pack", re: /(\d{1,3})\s*pairs?\s*(?:per|\/)\s*pack\b/i, map: "units_per_inner" },
];

export const INNERS_PER_CASE_PATTERNS: PatternDef[] = [
  { name: "boxes_per_case", re: /(\d{1,4})\s*(?:boxes|bxs?)\s*(?:per|\/)\s*(?:case|cs)\b/i, map: "inners_per_case" },
  { name: "case_pack_boxes", re: /case\s*pack\s*:?\s*(\d{1,4})\s*(?:boxes|bx)\b/i, map: "inners_per_case" },
  { name: "one_case_boxes", re: /1\s*case\s*=\s*(\d{1,4})\s*(?:boxes|bx)\b/i, map: "inners_per_case" },
  { name: "packs_per_case", re: /(\d{1,4})\s*packs?\s*(?:per|\/)\s*(?:case|cs)\b/i, map: "inners_per_case" },
  { name: "dozen_per_case", re: /(\d{1,3})\s*dozen\s*(?:per|\/)\s*(?:case|cs)\b/i, map: "inner_dozen_case" },
  { name: "dz_per_cs", re: /(\d{1,3})\s*dz\s*(?:\/|\s*per\s*)cs\b/i, map: "inner_dozen_case" },
];

export const UNITS_PER_CASE_PATTERNS: PatternDef[] = [
  { name: "gloves_per_case", re: /([\d,]+)\s*(?:gloves|pairs|pcs|units)?\s*(?:per|\/)\s*case\b/i, map: "units_per_case" },
  { name: "num_slash_case", re: /([\d,]+)\s*\/\s*case\b/i, map: "units_per_case" },
  { name: "case_of", re: /case\s*(?:of|pack)?\s*:?\s*([\d,]+)\s*(?:gloves|pairs|pcs|units)?\b/i, map: "units_per_case" },
  { name: "one_case_gloves", re: /1\s*case\s*=\s*([\d,]+)\s*(?:gloves|pairs|pcs|units)\b/i, map: "units_per_case" },
  { name: "pairs_per_case", re: /(\d{1,5})\s*pairs?\s*(?:per|\/)\s*case\b/i, map: "pairs_per_case" },
  { name: "pair_slash_case", re: /(\d{1,5})\s*pair\s*\/\s*case\b/i, map: "pairs_per_case" },
];

export const SLASH_INNER_CASE_PATTERNS: PatternDef[] = [
  { name: "slash_inner_case", re: /(\d{1,4})\s*\/\s*(\d{1,5})\s*(?:\/\s*)?case\b/i, map: "slash_case" },
  { name: "NxM_case", re: /(\d{1,4})\s*[x×]\s*(\d{1,5})\s*(?:\/\s*)?(?:case|cs)\b/i, map: "slash_case" },
  {
    name: "put_up_packaging",
    re: /(\d{1,5})\s*\/\s*(?:box|bx)\s*[-–—]\s*(\d{1,4})\s*(?:boxes|bxs?)\s*\/\s*(?:case|cs)\b/i,
    map: "put_up_case",
  },
  {
    name: "title_glove_pack",
    re: /(\d{1,4})\s*[x×]\s*(\d{3,5})(?=\s*,|\s*[-–—]|\s+(?:clear|blue|black|white|small|medium|large|x-?small|x-?large))/i,
    map: "slash_case",
  },
];

export const CASES_PER_PALLET_PATTERNS: PatternDef[] = [
  { name: "cases_per_pallet", re: /(\d{1,4})\s*(?:cases|cs)\s*(?:per|\/)\s*(?:pallet|plt|skid)\b/i, map: "cases_per_pallet" },
  { name: "cs_per_pallet", re: /(\d{1,4})\s*cs\s*(?:\/|\s*per\s*)pallet\b/i, map: "cases_per_pallet" },
  { name: "pallet_qty", re: /pallet\s*(?:qty|quantity)\s*:?\s*(\d{1,4})\b/i, map: "cases_per_pallet" },
  { name: "skid_qty", re: /skid\s*(?:qty|quantity)\s*:?\s*(\d{1,4})\b/i, map: "cases_per_pallet" },
];

export const CASE_PRICE_PATTERNS: PatternDef[] = [
  { name: "dollar_per_case", re: /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/|\s*per\s*)\s*case\b/i, map: "case_price" },
  { name: "case_price_label", re: /case\s*price\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i, map: "case_price" },
  { name: "price_per_case", re: /price\s*(?:per|\/)\s*case\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i, map: "case_price" },
];

export const PALLET_PRICE_PATTERNS: PatternDef[] = [
  { name: "dollar_per_pallet", re: /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/|\s*per\s*)\s*pallet\b/i, map: "pallet_price" },
  { name: "pallet_price_label", re: /pallet\s*price\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i, map: "pallet_price" },
  { name: "bulk_pallet", re: /bulk\s*pallet\s*price\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i, map: "pallet_price" },
];

export const SPEC_TABLE_INNER_KEYS = [
  "gloves per box",
  "units per box",
  "per box",
  "box qty",
  "quantity per box",
  "pairs per dozen",
  "pairs per pack",
];

export const SPEC_TABLE_INNER_CASE_KEYS = [
  "boxes per case",
  "box per case",
  "cases per case",
  "case pack",
  "pack size",
  "pack size (case)",
  "packaging put/up",
  "packaging put up",
  "put/up",
  "units per case",
  "gloves per case",
  "pairs per case",
  "dozen per case",
  "cases per pallet",
  "pallet quantity",
  "pallet qty",
];

export const SPEC_TABLE_PALLET_KEYS = ["pallet ti x hi", "ti x hi", "pallet tier", "pallet ti hi"];
