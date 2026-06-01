import type { LucideIcon } from "lucide-react";
import { BookOpen, MapPin, ShieldCheck, Target } from "lucide-react";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import { HEADER_INDUSTRY_NAV_ITEMS } from "@/config/publicNav";

const IMAGE_PARAMS = "auto=format&fit=crop&w=1200&h=900&q=82";

/** Legacy `/industries/*` landings → canonical filtered `/store` hrefs. */
const INDUSTRY_LANDING_STORE_HREF: Record<string, string> = {
  "/industries/healthcare": buildStoreCatalogHref({ industries: ["healthcare"] }),
  "/industries/hospitality": buildStoreCatalogHref({ industries: ["food_service"] }),
  "/industries/janitorial": buildStoreCatalogHref({ industries: ["janitorial"] }),
  "/industries/industrial": buildStoreCatalogHref({ industries: ["industrial"] }),
};

export function toIndustryStoreCatalogHref(href: string): string {
  return INDUSTRY_LANDING_STORE_HREF[href] ?? href;
}

export type HomeIndustryFeatured = {
  href: string;
  title: string;
  descriptor: string;
  hazardHint: string;
  applicationCue: string;
  imageUrl: string;
  imagePosition: string;
};

/** Featured chevron grid (6 top + 6 bottom) — slugs align with store `industries=` facet. */
export const HOME_FEATURED_INDUSTRY_SLUGS = [
  "healthcare",
  "food_service",
  "janitorial",
  "automotive",
  "industrial",
  "chemical_processing",
  "construction",
  "warehousing_logistics",
  "laboratories",
  "oil_gas_energy",
  "agriculture",
  "pharmaceuticals",
] as const;

function featuredIndustryHref(slug: string): string {
  return buildStoreCatalogHref({ industries: [slug] });
}

export const HOME_FEATURED_INDUSTRY_HREFS: string[] = HOME_FEATURED_INDUSTRY_SLUGS.map(featuredIndustryHref);

/** Bottom icon row (before “and more”) — matches homepage industries mock. */
export const HOME_BOTTOM_ICON_ROW_HREFS: string[] = [
  buildStoreCatalogHref({ industries: ["education"] }),
  buildStoreCatalogHref({ industries: ["dental"] }),
  buildStoreCatalogHref({ industries: ["veterinary"] }),
  buildStoreCatalogHref({ industries: ["emergency_services"] }),
  buildStoreCatalogHref({ industries: ["retail_grocery"] }),
  buildStoreCatalogHref({ industries: ["tattoo_body_art"] }),
  buildStoreCatalogHref({ industries: ["beauty_personal_care"] }),
  buildStoreCatalogHref({ industries: ["cold_chain_outdoor"] }),
  buildStoreCatalogHref({ industries: ["janitorial", "sanitation"] }),
];

export const HOME_INDUSTRY_FEATURED_META: Record<string, Omit<HomeIndustryFeatured, "href">> = {
  healthcare: {
    title: "Healthcare",
    descriptor: "Barrier protection for patient and provider safety.",
    hazardHint: "Biofluids · cross-contamination",
    applicationCue: "Exam · patient care · lab handling",
    imageUrl: `https://images.unsplash.com/photo-1579684385127-1ef15d508118?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_40%]",
  },
  food_service: {
    title: "Food Service & Hospitality",
    descriptor: "Food-safe gloves for prep, service, and sanitation.",
    hazardHint: "Grease · heat · sanitation chemicals",
    applicationCue: "Prep · service · dish handling",
    imageUrl: `https://images.unsplash.com/photo-1559339352-11d035aa65de?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_35%]",
  },
  janitorial: {
    title: "Janitorial & Sanitation",
    descriptor: "Chemical-aware gloves for disinfection and facility care.",
    hazardHint: "Quats · bleach · surfactants",
    applicationCue: "Cleaning · disinfection · restroom care",
    imageUrl: `https://images.unsplash.com/photo-1581578731548-c64695cc6952?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_42%]",
  },
  automotive: {
    title: "Automotive & Collision",
    descriptor: "Grip and durability for maintenance and repair bays.",
    hazardHint: "Oils · solvents · abrasion",
    applicationCue: "MRO · assembly · detailing",
    imageUrl: `https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?${IMAGE_PARAMS}`,
    imagePosition: "object-center",
  },
  industrial: {
    title: "Manufacturing",
    descriptor: "Cut and abrasion protection for plant-floor operations.",
    hazardHint: "Sharp edges · oils · repetitive handling",
    applicationCue: "Assembly · machining · maintenance",
    imageUrl: `https://images.unsplash.com/photo-1741591649025-3e6d50c7f0e4?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_40%]",
  },
  chemical_processing: {
    title: "Chemical Processing",
    descriptor: "Solvent, acid, and hazmat resistance for processing lines.",
    hazardHint: "Solvents · caustics · permeation risk",
    applicationCue: "Dosing · transfers · cleanup",
    imageUrl: `https://images.unsplash.com/photo-1688694554481-353762e2c905?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_45%]",
  },
  construction: {
    title: "Construction & Trades",
    descriptor: "Rugged protection for trades and heavy-duty site work.",
    hazardHint: "Impact · abrasion · puncture",
    applicationCue: "Framing · concrete · site cleanup",
    imageUrl: `https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_45%]",
  },
  warehousing_logistics: {
    title: "Warehousing & Logistics",
    descriptor: "Grip-forward gloves for pick, pack, and ship.",
    hazardHint: "Carton abrasion · repetitive motion",
    applicationCue: "Pick · pack · load",
    imageUrl: `https://images.unsplash.com/photo-1721937127582-ed331de95a04?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_40%]",
  },
  laboratories: {
    title: "Laboratory & Research",
    descriptor: "Contamination control for bench work, sampling, and QC.",
    hazardHint: "Chemical splash · fine particulate",
    applicationCue: "Sampling · bench work · R&D",
    imageUrl: `https://images.unsplash.com/photo-1742436707388-2b6727520d5f?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_35%]",
  },
  oil_gas_energy: {
    title: "Oil, Gas & Energy",
    descriptor: "Heavy-duty protection for field and midstream operations.",
    hazardHint: "Hydrocarbons · impact · abrasion",
    applicationCue: "Field service · maintenance · transfers",
    imageUrl: `https://images.unsplash.com/photo-1705590002103-ca91a4fb5ca0?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_45%]",
  },
  agriculture: {
    title: "Agriculture & Farming",
    descriptor: "Flexible protection for harvest, field work, and equipment service.",
    hazardHint: "Moisture · abrasion · UV exposure",
    applicationCue: "Harvest · handling · equipment service",
    imageUrl: `https://images.unsplash.com/photo-1625246333195-78d9c38ad449?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_40%]",
  },
  pharmaceuticals: {
    title: "Pharmacy & Compounding",
    descriptor: "Sterile dispensing and compounding contamination control.",
    hazardHint: "Cross-contamination · chemical splash",
    applicationCue: "Dispensing · compounding · inventory",
    imageUrl: `https://images.unsplash.com/photo-1770195957512-b45ce419c00c?${IMAGE_PARAMS}`,
    imagePosition: "object-[center_40%]",
  },
};

export const HOME_INDUSTRY_TRUST_PILLARS = [
  {
    title: "Purpose-built recommendations",
    description: "Industry-specific guidance matched to your operating environment.",
    icon: Target,
  },
  {
    title: "Application-led expertise",
    description: "We evaluate your tasks, materials, and exposure—not just your industry label.",
    icon: BookOpen,
  },
  {
    title: "Standards & compliance aware",
    description: "Stay aligned with the right requirements for your category and use case.",
    icon: ShieldCheck,
  },
  {
    title: "Nationwide support",
    description: "Fast fulfillment and expert help when specs or volume change.",
    icon: MapPin,
  },
] as const satisfies ReadonlyArray<{ title: string; description: string; icon: LucideIcon }>;

const ALL_INDUSTRY_ITEMS = HEADER_INDUSTRY_NAV_ITEMS.filter((item) => item.href !== "/industries");

export function buildHomeFeaturedIndustries(): HomeIndustryFeatured[] {
  return HOME_FEATURED_INDUSTRY_SLUGS.map((slug) => {
    const href = featuredIndustryHref(slug);
    const meta = HOME_INDUSTRY_FEATURED_META[slug];
    if (!meta) {
      const nav = ALL_INDUSTRY_ITEMS.find((i) => toIndustryStoreCatalogHref(i.href) === href);
      return {
        href,
        title: nav?.label ?? "Industry",
        descriptor: "Application-specific glove guidance for your environment.",
        hazardHint: "Task-specific hazards",
        applicationCue: "Operational hand protection",
        imageUrl: `https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?${IMAGE_PARAMS}`,
        imagePosition: "object-center",
      };
    }
    return { href, ...meta };
  });
}

/** Shorter chip copy only — routes unchanged. */
const CHIP_DISPLAY_LABEL_BY_HREF: Record<string, string> = {
  [buildStoreCatalogHref({ industries: ["healthcare"] })]: "Medical & healthcare",
  [buildStoreCatalogHref({ industries: ["food_service"] })]: "Food service",
  [buildStoreCatalogHref({ industries: ["janitorial"] })]: "Janitorial",
  [buildStoreCatalogHref({ industries: ["industrial"] })]: "Industrial ops",
  [buildStoreCatalogHref({ industries: ["dental"] })]: "Dental",
  [buildStoreCatalogHref({ industries: ["veterinary"] })]: "Veterinary",
  [buildStoreCatalogHref({ industries: ["pharmaceuticals"] })]: "Pharmacy",
  [buildStoreCatalogHref({ industries: ["beauty_personal_care"] })]: "Salons & spas",
  [buildStoreCatalogHref({ industries: ["tattoo_body_art"] })]: "Tattoo & piercing",
  [buildStoreCatalogHref({ industries: ["food_processing"] })]: "Commercial kitchens",
  [buildStoreCatalogHref({ industries: ["education"] })]: "Schools & childcare",
  [buildStoreCatalogHref({ industries: ["retail_grocery"] })]: "Retail & grocery",
  [buildStoreCatalogHref({ industries: ["electronics_assembly"] })]: "Electronics",
  [buildStoreCatalogHref({ industries: ["metal_fabrication"] })]: "Metal fabrication",
  [buildStoreCatalogHref({ category: "chemical-resistant", industries: ["chemical_processing"] })]: "Chem-resistant",
  [buildStoreCatalogHref({ category: "work-gloves", industries: ["industrial"] })]: "Reusable work",
  [buildStoreCatalogHref({ industries: ["cold_chain_outdoor"] })]: "Cold & outdoor",
  [buildStoreCatalogHref({ industries: ["landscaping_grounds"] })]: "Landscaping",
  [buildStoreCatalogHref({ industries: ["emergency_services"] })]: "Fire & EMS",
  [buildStoreCatalogHref({ industries: ["security_public_safety"] })]: "Public safety",
  [buildStoreCatalogHref({ industries: ["janitorial", "sanitation"] })]: "PPE & facility",
};

function chipDisplayLabel(href: string, fallback: string): string {
  return CHIP_DISPLAY_LABEL_BY_HREF[href] ?? fallback;
}

const BOTTOM_ICON_LABEL_BY_HREF: Record<string, string> = {
  [buildStoreCatalogHref({ industries: ["education"] })]: "Schools & Childcare",
  [buildStoreCatalogHref({ industries: ["dental"] })]: "Dental & Orthodontics",
  [buildStoreCatalogHref({ industries: ["veterinary"] })]: "Veterinary & Animal Care",
  [buildStoreCatalogHref({ industries: ["emergency_services"] })]: "Public Safety & First Responders",
  [buildStoreCatalogHref({ industries: ["retail_grocery"] })]: "Retail & Grocery",
  [buildStoreCatalogHref({ industries: ["tattoo_body_art"] })]: "Tattoo & Piercing",
  [buildStoreCatalogHref({ industries: ["beauty_personal_care"] })]: "Salons & Spas",
  [buildStoreCatalogHref({ industries: ["cold_chain_outdoor"] })]: "Cold Storage & Outdoor Work",
  [buildStoreCatalogHref({ industries: ["janitorial", "sanitation"] })]: "PPE Packs & Facility Supply",
};

export function buildHomeBottomIconRow(): { href: string; label: string }[] {
  return HOME_BOTTOM_ICON_ROW_HREFS.map((href) => {
    const storeHref = toIndustryStoreCatalogHref(href);
    const nav = ALL_INDUSTRY_ITEMS.find((i) => toIndustryStoreCatalogHref(i.href) === storeHref);
    return {
      href: storeHref,
      label: BOTTOM_ICON_LABEL_BY_HREF[storeHref] ?? BOTTOM_ICON_LABEL_BY_HREF[href] ?? nav?.label ?? "Industry",
    };
  });
}

export function homeIndustryOverflowCount(): number {
  const shown = new Set([
    ...HOME_FEATURED_INDUSTRY_HREFS.map(toIndustryStoreCatalogHref),
    ...HOME_BOTTOM_ICON_ROW_HREFS.map(toIndustryStoreCatalogHref),
  ]);
  return ALL_INDUSTRY_ITEMS.filter((item) => !shown.has(toIndustryStoreCatalogHref(item.href))).length;
}

export function buildHomeIndustryChips(): { href: string; label: string }[] {
  const featured = new Set(HOME_FEATURED_INDUSTRY_HREFS.map(toIndustryStoreCatalogHref));
  return ALL_INDUSTRY_ITEMS.filter((item) => !featured.has(toIndustryStoreCatalogHref(item.href))).map((item) => {
    const storeHref = toIndustryStoreCatalogHref(item.href);
    return {
      href: storeHref,
      label: chipDisplayLabel(storeHref, item.label),
    };
  });
}

export function homeIndustryCatalogCount(): number {
  return ALL_INDUSTRY_ITEMS.length;
}
