import type { LucideIcon } from "lucide-react";
import { Headphones, Network, Sparkles } from "lucide-react";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import { HOME_INDUSTRY_FEATURED_META } from "@/config/homeIndustryIntelligence";

const IMAGE_PARAMS = "auto=format&fit=crop&w=1200&h=900&q=82";

export type HomeHoneycombIndustryTile = {
  kind: "industry";
  number: number;
  title: string;
  href: string;
  imageUrl: string;
  imagePosition?: string;
};

export type HomeHoneycombHubTile = {
  kind: "hub";
};

export type HomeHoneycombTile = HomeHoneycombIndustryTile | HomeHoneycombHubTile;

function industryHref(slug: string): string {
  return buildStoreCatalogHref({ industries: [slug] });
}

function tileFromMeta(
  number: number,
  slug: keyof typeof HOME_INDUSTRY_FEATURED_META,
  titleOverride?: string,
): HomeHoneycombIndustryTile {
  const meta = HOME_INDUSTRY_FEATURED_META[slug];
  return {
    kind: "industry",
    number,
    title: titleOverride ?? meta.title,
    href: industryHref(slug),
    imageUrl: meta.imageUrl,
    imagePosition: meta.imagePosition,
  };
}

function tile(
  number: number,
  title: string,
  slug: string,
  imageUrl: string,
  imagePosition = "object-center",
): HomeHoneycombIndustryTile {
  return {
    kind: "industry",
    number,
    title,
    href: industryHref(slug),
    imageUrl,
    imagePosition,
  };
}

/** Top row — 5 industries */
export const HOME_HONEYCOMB_ROW_TOP: HomeHoneycombIndustryTile[] = [
  tileFromMeta(1, "healthcare"),
  tileFromMeta(2, "food_service"),
  tileFromMeta(3, "janitorial"),
  tileFromMeta(4, "automotive"),
  tileFromMeta(5, "industrial", "Manufacturing"),
];

/** Middle row — 6 slots with center hub */
export const HOME_HONEYCOMB_ROW_MIDDLE: HomeHoneycombTile[] = [
  tileFromMeta(6, "chemical_processing"),
  tileFromMeta(7, "construction"),
  { kind: "hub" },
  tileFromMeta(8, "warehousing_logistics"),
  tileFromMeta(9, "laboratories"),
  tileFromMeta(10, "oil_gas_energy"),
];

/** Bottom row — 5 industries */
export const HOME_HONEYCOMB_ROW_BOTTOM: HomeHoneycombIndustryTile[] = [
  tileFromMeta(11, "agriculture"),
  tileFromMeta(12, "pharmaceuticals"),
  tile(
    13,
    "Aerospace",
    "electronics_assembly",
    `https://images.unsplash.com/photo-1451187580459-43490279c0fa?${IMAGE_PARAMS}`,
    "object-[center_35%]",
  ),
  tile(
    14,
    "Defense & Military",
    "security_public_safety",
    `https://images.unsplash.com/photo-1581092160562-40aa08e78837?${IMAGE_PARAMS}`,
    "object-[center_40%]",
  ),
  tile(
    15,
    "Waste Management & Recycling",
    "janitorial",
    `https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?${IMAGE_PARAMS}`,
    "object-[center_40%]",
  ),
];

export const HOME_HONEYCOMB_BENEFITS = [
  {
    title: "One Connected Network",
    description: "One sourcing network across every environment you operate in.",
    icon: Network,
  },
  {
    title: "Smarter Choices",
    description: "Application-led recommendations matched to task, material, and exposure.",
    icon: Sparkles,
  },
  {
    title: "Expert Support",
    description: "Nationwide fulfillment and spec guidance when programs scale.",
    icon: Headphones,
  },
] as const satisfies ReadonlyArray<{ title: string; description: string; icon: LucideIcon }>;

export const HOME_HONEYCOMB_PROOF_POINTS = [
  "15 Industry Protection Paths",
  "Chemical + Cut Resistance Guidance",
  "Disposable & Safety Glove Expertise",
  "Smarter PPE Standardization",
  "Built for Real Work Environments",
] as const;

export const HOME_HONEYCOMB_COPY = {
  eyebrow: "INDUSTRY GLOVE INTELLIGENCE",
  headline: "Built Around How Gloves Actually Get Used",
  supporting:
    "Different environments. Different hazards. One connected intelligence layer purpose-built for how your teams actually work.",
} as const;
