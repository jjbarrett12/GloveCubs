import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import { getStoreHrefForIntent } from "@/lib/discovery/intent-routes";

export type PublicIndustryNavItem = {
  href: string;
  label: string;
};

/**
 * Header “Industries” dropdown + mobile submenu (order preserved).
 * Mix of industry landings, catalog intents, and honest `/store?q=` slices — no legacy facet params.
 */
export const HEADER_INDUSTRY_NAV_ITEMS: PublicIndustryNavItem[] = [
  { href: "/industries", label: "All industries" },
  { href: "/industries/healthcare", label: "Medical & healthcare" },
  { href: "/industries/hospitality", label: "Food service & hospitality" },
  { href: "/industries/janitorial", label: "Janitorial & sanitation" },
  { href: "/industries/industrial", label: "Industrial & plant operations" },
  { href: getStoreHrefForIntent("store.search.automotive"), label: "Automotive & collision" },
  { href: buildStoreCatalogHref({ q: "dental exam gloves" }), label: "Dental & orthodontics" },
  { href: buildStoreCatalogHref({ q: "veterinary exam gloves" }), label: "Veterinary & animal care" },
  { href: getStoreHrefForIntent("store.gf.lab"), label: "Laboratory & research" },
  { href: buildStoreCatalogHref({ q: "pharmacy compounding gloves" }), label: "Pharmacy & compounding" },
  { href: buildStoreCatalogHref({ q: "beauty salon hair color gloves" }), label: "Salons & spas" },
  { href: buildStoreCatalogHref({ q: "tattoo piercing nitrile gloves" }), label: "Tattoo & piercing" },
  { href: getStoreHrefForIntent("store.search.food_prep"), label: "Commercial kitchens & prep lines" },
  { href: buildStoreCatalogHref({ q: "childcare school food service gloves" }), label: "Schools & childcare" },
  { href: buildStoreCatalogHref({ q: "retail grocery deli disposable gloves" }), label: "Retail & grocery" },
  { href: buildStoreCatalogHref({ q: "cleanroom assembly gloves" }), label: "Electronics & assembly" },
  { href: buildStoreCatalogHref({ q: "construction work gloves disposable coated" }), label: "Construction & trades" },
  { href: buildStoreCatalogHref({ q: "warehouse picking packing gloves" }), label: "Warehousing & logistics" },
  { href: getStoreHrefForIntent("store.search.cut_resistant"), label: "Cut hazards & metal fabrication" },
  { href: getStoreHrefForIntent("store.search.chemical_handling"), label: "Chemical handling" },
  { href: getStoreHrefForIntent("store.cat.chemical-resistant"), label: "Chemical-resistant (reusable)" },
  { href: getStoreHrefForIntent("store.cat.work-gloves"), label: "Reusable work gloves" },
  { href: getStoreHrefForIntent("store.search.cold_weather"), label: "Cold storage & outdoor work" },
  { href: buildStoreCatalogHref({ q: "agriculture farming gloves" }), label: "Agriculture & farming" },
  { href: buildStoreCatalogHref({ q: "oil gas field FR work gloves" }), label: "Oil, gas & energy" },
  { href: buildStoreCatalogHref({ q: "landscaping grounds maintenance gloves" }), label: "Landscaping & grounds" },
  { href: buildStoreCatalogHref({ q: "fire ems rescue gloves" }), label: "Fire, EMS & rescue" },
  { href: buildStoreCatalogHref({ q: "security patrol duty gloves" }), label: "Security & public safety" },
  { href: getStoreHrefForIntent("store.search.ppe_packs"), label: "PPE packs & kits" },
  { href: getStoreHrefForIntent("store.cat.nitrile-gloves"), label: "Nitrile disposable (category)" },
  { href: getStoreHrefForIntent("store.cat.vinyl-gloves"), label: "Vinyl disposable (category)" },
];
