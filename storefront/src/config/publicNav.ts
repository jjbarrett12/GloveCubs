import { buildStoreCatalogHref } from "@/lib/catalog/store-url";

export type PublicIndustryNavItem = {
  href: string;
  label: string;
};

/**
 * Header “Industries” dropdown + mobile submenu (order preserved).
 * Store links use `industries=` facet slugs aligned with `INDUSTRIES_VALUES` (catalogos) +
 * `STORE_INDUSTRY_FACET_ROWS` (storefront). Landings and category intents unchanged.
 */
export const HEADER_INDUSTRY_NAV_ITEMS: PublicIndustryNavItem[] = [
  { href: "/industries", label: "All industries" },
  { href: "/industries/healthcare", label: "Medical & healthcare" },
  { href: "/industries/hospitality", label: "Food service & hospitality" },
  { href: "/industries/janitorial", label: "Janitorial & sanitation" },
  { href: "/industries/industrial", label: "Industrial & plant operations" },
  { href: buildStoreCatalogHref({ industries: ["automotive"] }), label: "Automotive & collision" },
  { href: buildStoreCatalogHref({ industries: ["dental"] }), label: "Dental & orthodontics" },
  { href: buildStoreCatalogHref({ industries: ["veterinary"] }), label: "Veterinary & animal care" },
  { href: buildStoreCatalogHref({ industries: ["laboratories"] }), label: "Laboratory & research" },
  { href: buildStoreCatalogHref({ industries: ["pharmaceuticals"] }), label: "Pharmacy & compounding" },
  { href: buildStoreCatalogHref({ industries: ["beauty_personal_care"] }), label: "Salons & spas" },
  { href: buildStoreCatalogHref({ industries: ["tattoo_body_art"] }), label: "Tattoo & piercing" },
  { href: buildStoreCatalogHref({ industries: ["food_processing"] }), label: "Commercial kitchens & prep lines" },
  { href: buildStoreCatalogHref({ industries: ["education"] }), label: "Schools & childcare" },
  { href: buildStoreCatalogHref({ industries: ["retail_grocery"] }), label: "Retail & grocery" },
  { href: buildStoreCatalogHref({ industries: ["electronics_assembly"] }), label: "Electronics & assembly" },
  { href: buildStoreCatalogHref({ industries: ["construction"] }), label: "Construction & trades" },
  { href: buildStoreCatalogHref({ industries: ["warehousing_logistics"] }), label: "Warehousing & logistics" },
  { href: buildStoreCatalogHref({ industries: ["metal_fabrication"] }), label: "Cut hazards & metal fabrication" },
  { href: buildStoreCatalogHref({ industries: ["chemical_processing"] }), label: "Chemical processing" },
  {
    href: buildStoreCatalogHref({ category: "chemical-resistant", industries: ["chemical_processing"] }),
    label: "Chemical-resistant (reusable)",
  },
  {
    href: buildStoreCatalogHref({ category: "work-gloves", industries: ["industrial"] }),
    label: "Reusable work gloves (industrial)",
  },
  { href: buildStoreCatalogHref({ industries: ["cold_chain_outdoor"] }), label: "Cold storage & outdoor work" },
  { href: buildStoreCatalogHref({ industries: ["agriculture"] }), label: "Agriculture & farming" },
  { href: buildStoreCatalogHref({ industries: ["oil_gas_energy"] }), label: "Oil, gas & energy" },
  { href: buildStoreCatalogHref({ industries: ["landscaping_grounds"] }), label: "Landscaping & grounds" },
  { href: buildStoreCatalogHref({ industries: ["emergency_services"] }), label: "Fire, EMS & rescue" },
  { href: buildStoreCatalogHref({ industries: ["security_public_safety"] }), label: "Security & public safety" },
  { href: buildStoreCatalogHref({ industries: ["janitorial", "sanitation"] }), label: "PPE packs & facility supply" },
];
