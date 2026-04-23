/**
 * Declarative product-line registry for search tokens and merchandising boundaries.
 * DB table catalogos.category_product_line assigns categories → line codes; this file
 * defines facet vocabulary used for query parsing (avoid scattering glove terms in services).
 *
 * When onboarding a new line: add code to DB seed + map categories + add entry here.
 */

export const DEFAULT_PRODUCT_LINE_CODE = "ppe_gloves" as const;

export type ProductLineCode =
  | typeof DEFAULT_PRODUCT_LINE_CODE
  | "ppe_eye"
  | "ppe_respiratory"
  | "ppe_apparel"
  | "facility_consumables";

export interface ProductLineSearchFacets {
  /** Substrings matched in tokenized query for material-like facets */
  materials: string[];
  sizes: string[];
  /** Use case / product-type tokens (exam, industrial, safety, …) */
  productTypes: string[];
}

const GLOVE_FACETS: ProductLineSearchFacets = {
  materials: ["nitrile", "latex", "vinyl", "neoprene", "polyethylene", "poly"],
  sizes: ["x-small", "small", "medium", "large", "x-large", "2x-large"],
  productTypes: ["exam", "surgical", "industrial", "food", "safety", "disposable", "reusable"],
};

const EYE_FACETS: ProductLineSearchFacets = {
  materials: ["polycarbonate", "anti-fog", "anti fog", "trivex"],
  sizes: [],
  productTypes: ["z87", "safety", "goggle", "reader", "bifocal"],
};

const RESPIRATORY_FACETS: ProductLineSearchFacets = {
  materials: ["n95", "kn95", "p100", "half mask", "full face"],
  sizes: ["small", "medium", "large"],
  productTypes: ["respirator", "surgical", "dust", "mist", "vapor"],
};

const APPAREL_FACETS: ProductLineSearchFacets = {
  materials: ["tyvek", "sms", "microporous", "polypropylene"],
  sizes: ["small", "medium", "large", "x-large", "2x-large", "one size"],
  productTypes: ["coverall", "gown", "sleeve", "apron", "hood"],
};

const CONSUMABLES_FACETS: ProductLineSearchFacets = {
  materials: [],
  sizes: [],
  productTypes: ["towel", "wipe", "soap", "sanitizer", "hand", "floor"],
};

/** Line code → facet vocabulary for token extraction */
export const PRODUCT_LINE_SEARCH_FACETS: Record<string, ProductLineSearchFacets> = {
  ppe_gloves: GLOVE_FACETS,
  ppe_eye: EYE_FACETS,
  ppe_respiratory: RESPIRATORY_FACETS,
  ppe_apparel: APPAREL_FACETS,
  facility_consumables: CONSUMABLES_FACETS,
};

export function getSearchFacetsForProductLine(code: string | null | undefined): ProductLineSearchFacets {
  const key = (code || DEFAULT_PRODUCT_LINE_CODE).trim();
  return PRODUCT_LINE_SEARCH_FACETS[key] ?? { materials: [], sizes: [], productTypes: [] };
}

/** Plural → singular and line-agnostic normalizations (keep minimal; line facets do the rest) */
export const GLOBAL_SEARCH_SYNONYMS: Record<string, string> = {
  pf: "powder-free",
  powderfree: "powder-free",
  "powder free": "powder-free",
  sm: "small",
  med: "medium",
  lg: "large",
  xl: "x-large",
  xxl: "2x-large",
  xs: "x-small",
  lrg: "large",
  sml: "small",
};
