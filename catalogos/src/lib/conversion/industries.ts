/**
 * Industry quick-select config and recommendation mapping.
 * Used to filter catalog and show "Best for X" badges. Product IDs can be
 * seeded from CMS or admin; until then we filter by attributes.industries.
 */

export type IndustryKey =
  | "restaurant_food_service"
  | "janitorial"
  | "automotive"
  | "medical"
  | "tattoo"
  | "industrial"
  | "general_use";

export interface IndustryOption {
  key: IndustryKey;
  label: string;
  shortLabel: string;
  /** Badge text for recommended products, e.g. "Best for Kitchens" */
  badgeLabel: string;
  /** Filter value for attributes.industries (may map to multiple). */
  filterValues: string[];
}

export const INDUSTRY_OPTIONS: IndustryOption[] = [
  {
    key: "restaurant_food_service",
    label: "Restaurant / Food Service",
    shortLabel: "Food Service",
    badgeLabel: "Best for Kitchens",
    filterValues: ["food_service", "food_processing"],
  },
  {
    key: "janitorial",
    label: "Janitorial",
    shortLabel: "Janitorial",
    badgeLabel: "Best for Cleaning Crews",
    filterValues: ["janitorial", "sanitation"],
  },
  {
    key: "automotive",
    label: "Automotive",
    shortLabel: "Automotive",
    badgeLabel: "Best for Mechanics",
    filterValues: ["automotive"],
  },
  {
    key: "medical",
    label: "Medical",
    shortLabel: "Medical",
    badgeLabel: "Best for Healthcare",
    filterValues: ["healthcare", "laboratories", "pharmaceuticals"],
  },
  {
    key: "tattoo",
    label: "Tattoo",
    shortLabel: "Tattoo",
    badgeLabel: "Best for Tattoo Artists",
    filterValues: ["tattoo_body_art", "beauty_personal_care"],
  },
  {
    key: "industrial",
    label: "Industrial",
    shortLabel: "Industrial",
    badgeLabel: "Heavy Duty",
    filterValues: ["industrial", "education"],
  },
  {
    key: "general_use",
    label: "General Use",
    shortLabel: "General",
    badgeLabel: "General Use",
    filterValues: [],
  },
];

export const INDUSTRY_MAP = new Map<IndustryKey, IndustryOption>(
  INDUSTRY_OPTIONS.map((i) => [i.key, i])
);

/** For industry_recommendations table: industry, product_id, rank, label. Used when we have seeded data. */
export interface IndustryRecommendationRow {
  industry: IndustryKey;
  product_id: string;
  rank: number;
  label: string;
}

/** In-memory / config layer: optional seeded product IDs per industry. Load from DB or JSON later. */
const SEEDED_RECOMMENDATIONS: IndustryRecommendationRow[] = [];

export function getIndustryRecommendationProductIds(industry: IndustryKey): string[] {
  const rows = SEEDED_RECOMMENDATIONS.filter((r) => r.industry === industry).sort(
    (a, b) => a.rank - b.rank
  );
  return rows.map((r) => r.product_id);
}

function toIndustryArray(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return [String(v).trim()].filter(Boolean);
}

export function getIndustryBadgeForProduct(
  industry: IndustryKey,
  productIndustryValues: string | string[] | undefined
): string | null {
  const opt = INDUSTRY_MAP.get(industry);
  const arr = toIndustryArray(productIndustryValues);
  if (!opt || !arr.length) return null;
  const match = opt.filterValues.some((v) =>
    arr.some((p) => p === v || p?.toLowerCase() === v.toLowerCase())
  );
  return match ? opt.badgeLabel : null;
}
