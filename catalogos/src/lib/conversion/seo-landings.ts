/**
 * SEO landing page config: slug → title, description, and catalog filters.
 * Used to generate /best/[slug] pages with recommended gloves and comparison.
 */

import type { StorefrontFilterParams } from "@/lib/catalog/types";

export interface SeoLandingConfig {
  slug: string;
  title: string;
  description: string;
  /** Catalog filters to fetch recommended products. */
  filters: Partial<StorefrontFilterParams>;
  /** Max products to show (then trim for comparison table). */
  limit: number;
}

export const SEO_LANDING_PAGES: SeoLandingConfig[] = [
  {
    slug: "best-nitrile-gloves-for-food-service",
    title: "Best Nitrile Gloves for Food Service",
    description: "Compare top nitrile gloves for restaurants, kitchens, and food prep. Food-safe, durable options with bulk pricing.",
    filters: {
      category: "disposable_gloves",
      material: ["nitrile"],
      grade: ["food_service_grade"],
      limit: 12,
      sort: "price_per_glove_asc",
    },
    limit: 12,
  },
  {
    slug: "best-disposable-gloves-for-mechanics",
    title: "Best Disposable Gloves for Mechanics",
    description: "Heavy-duty nitrile gloves for automotive work. Oil-resistant, durable options trusted by mechanics and auto shops.",
    filters: {
      category: "disposable_gloves",
      material: ["nitrile"],
      thickness_mil: ["6", "7", "8", "9", "10"],
      limit: 12,
      sort: "price_per_glove_asc",
    },
    limit: 12,
  },
  {
    slug: "best-gloves-for-janitorial-cleaning",
    title: "Best Gloves for Janitorial & Cleaning",
    description: "Disposable gloves for cleaning crews and janitorial use. Nitrile and latex options for sanitation and durability.",
    filters: {
      category: "disposable_gloves",
      material: ["nitrile", "latex"],
      limit: 12,
      sort: "price_per_glove_asc",
    },
    limit: 12,
  },
];

const SEO_LANDING_MAP = new Map(SEO_LANDING_PAGES.map((p) => [p.slug, p]));

export function getSeoLandingBySlug(slug: string): SeoLandingConfig | null {
  return SEO_LANDING_MAP.get(slug) ?? null;
}

export function getAllSeoLandingSlugs(): string[] {
  return SEO_LANDING_PAGES.map((p) => p.slug);
}
