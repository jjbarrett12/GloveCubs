import type { LucideIcon } from "lucide-react";
import { HEADER_INDUSTRY_NAV_ITEMS } from "@/config/publicNav";
import { industryNavIconForHref } from "@/config/industryNavIcons";
import { Target } from "lucide-react";

/** Legacy program-scoring buckets used by {@link PROGRAM_FITS} in the education hub. */
export type SurveyIndustryScoringBucket =
  | "food-service"
  | "healthcare"
  | "janitorial"
  | "industrial"
  | "automotive"
  | "general";

export type SurveyIndustryOption = {
  value: string;
  label: string;
  icon: LucideIcon;
};

/** Resolve stable facet / landing slug from a public nav industry href. */
export function industrySlugFromNavHref(href: string): string {
  if (href.startsWith("/industries/")) {
    const seg = href.replace("/industries/", "").trim();
    if (seg === "hospitality") return "food_service";
    return seg;
  }
  try {
    const url = new URL(href, "http://localhost");
    const raw = url.searchParams.get("industries");
    if (raw) return raw.split(",")[0]!.trim();
    const category = url.searchParams.get("category");
    if (category === "chemical-resistant") return "chemical_processing";
    if (category === "work-gloves") return "industrial";
  } catch {
    /* fall through */
  }
  return "general";
}

/** Resolve intake `industry` field (nav href or legacy slug) to a catalog slug. */
export function intakeIndustrySlug(industryValue: string): string {
  if (industryValue.startsWith("/") || industryValue.includes("?")) {
    return industrySlugFromNavHref(industryValue);
  }
  return industryValue;
}

/** All industries from site nav (28) — one row per nav item, keyed by href. */
export function buildSurveyIndustryOptions(): SurveyIndustryOption[] {
  return HEADER_INDUSTRY_NAV_ITEMS.filter((item) => item.href !== "/industries").map((item) => ({
    value: item.href,
    label: item.label,
    icon: industryNavIconForHref(item.href) ?? Target,
  }));
}

/** Map intake industry (href or slug) → program scoring bucket. */
export function scoringIndustryBucket(industryValue: string): SurveyIndustryScoringBucket {
  const slug = intakeIndustrySlug(industryValue);
  if (["food_service", "food_processing"].includes(slug)) return "food-service";
  if (["healthcare", "dental", "veterinary", "laboratories", "pharmaceuticals"].includes(slug)) {
    return "healthcare";
  }
  if (["janitorial", "sanitation"].includes(slug)) return "janitorial";
  if (slug === "automotive") return "automotive";
  if (
    [
      "industrial",
      "construction",
      "warehousing_logistics",
      "metal_fabrication",
      "chemical_processing",
      "electronics_assembly",
      "agriculture",
      "oil_gas_energy",
      "landscaping_grounds",
      "cold_chain_outdoor",
    ].includes(slug)
  ) {
    return "industrial";
  }
  return "general";
}
