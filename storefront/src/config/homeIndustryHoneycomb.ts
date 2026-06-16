import { buildStoreCatalogHref } from "@/lib/catalog/store-url";

const IMAGE_PARAMS = "auto=format&fit=crop&w=900&h=900&q=82";

export type HomeHoneycombIndustryTile = {
  kind: "industry";
  id: string;
  label: string;
  href: string;
  imageUrl: string;
  imagePosition?: string;
};

export type HomeHoneycombHubTile = {
  kind: "hub";
};

export type HomeHoneycombTile = HomeHoneycombIndustryTile | HomeHoneycombHubTile;

export type HomeHoneycombRow = {
  tiles: HomeHoneycombTile[];
};

function industry(
  id: string,
  label: string,
  slug: string,
  photoId: string,
  imagePosition = "object-center",
): HomeHoneycombIndustryTile {
  return {
    kind: "industry",
    id,
    label,
    href: buildStoreCatalogHref({ industries: [slug] }),
    imageUrl: `https://images.unsplash.com/photo-${photoId}?${IMAGE_PARAMS}`,
    imagePosition,
  };
}

/** Symmetrical 29-tile honeycomb — hub centered in row 2; rows 5 / 6 / 7 / 6 / 5 on a 7-column grid. */
export const HOME_HONEYCOMB_ROWS: HomeHoneycombRow[] = [
  {
    tiles: [
      industry("hospitality", "Hospitality", "food_service", "1603899949816-a3e9b885090e", "object-[center_38%]"),
      industry("healthcare", "Healthcare", "healthcare", "1579684385127-1ef15d508118", "object-[center_40%]"),
      industry("automotive", "Automotive", "automotive", "1645445490773-3ef25c148450", "object-[center_42%]"),
      industry("manufacturing", "Manufacturing", "industrial", "1741591649025-3e6d50c7f0e4", "object-[center_40%]"),
      industry("foodservice", "Foodservice", "food_processing", "1768849352374-f50f9e304a4d", "object-[center_42%]"),
    ],
  },
  {
    tiles: [
      industry("janitorial", "Janitorial", "janitorial", "1581578731548-c64695cc6952", "object-[center_42%]"),
      industry("warehousing", "Warehousing", "warehousing_logistics", "1600880292203-757bb62b4baf", "object-[center_40%]"),
      industry("logistics", "Logistics", "warehousing_logistics", "1721937127582-ed331de95a04", "object-[center_38%]"),
      industry("laboratories", "Laboratories", "laboratories", "1748281296151-b3209b37e1cb", "object-[center_35%]"),
      industry("construction", "Construction", "construction", "1504917595217-d4dc5ebe6122", "object-[center_45%]"),
      industry("agriculture", "Agriculture", "agriculture", "1762980622837-5046047cf9f5", "object-[center_40%]"),
    ],
  },
  {
    tiles: [
      industry("aviation", "Aviation", "electronics_assembly", "1485310818226-f01c4269687f", "object-[center_35%]"),
      industry("mechanic", "Mechanic", "automotive", "1683295713523-5fc85f5205f3", "object-[center_40%]"),
      industry("government", "Government", "security_public_safety", "1638401607292-ba5ca538031e", "object-[center_42%]"),
      { kind: "hub" },
      industry("education", "Education", "education", "1758685734062-165cc0094e61", "object-[center_40%]"),
      industry("retail", "Retail", "retail_grocery", "1776659216177-7ce330024b3a", "object-[center_38%]"),
      industry("tattoo", "Tattoo", "tattoo_body_art", "1775135709476-37c7ef466391", "object-[center_42%]"),
    ],
  },
  {
    tiles: [
      industry("dental", "Dental", "dental", "1758205308179-4e00e0e4060b", "object-[center_40%]"),
      industry("veterinary", "Veterinary", "veterinary", "1770836037289-e00e5f351d11", "object-[center_42%]"),
      industry("safety", "Safety", "security_public_safety", "1636008121708-18bbc728e71b", "object-[center_40%]"),
      industry("industrial", "Industrial", "metal_fabrication", "1688694554481-353762e2c905", "object-[center_42%]"),
      industry("pharma", "Pharma", "pharmaceuticals", "1770195957512-b45ce419c00c", "object-[center_40%]"),
      industry("telecom", "Telecom", "electronics_assembly", "1682345262055-8f95f3c513ea", "object-[center_42%]"),
    ],
  },
  {
    tiles: [
      industry("oil-gas", "Oil & Gas", "oil_gas_energy", "1621905252507-b35492cc74b4", "object-[center_45%]"),
      industry("cleaning", "Cleaning", "janitorial", "1758272421751-963195322eaa", "object-[center_42%]"),
      industry("emergency", "Emergency Services", "emergency_services", "1649260257620-3fd04e1952e5", "object-[center_40%]"),
      industry("food-processing", "Food Processing", "food_processing", "1556910103-1c02745aae4d", "object-[center_35%]"),
      industry("printing", "Printing", "industrial", "1562155695-fb6e1f95fcfd", "object-[center_45%]"),
    ],
  },
];

export const HOME_HONEYCOMB_COPY = {
  eyebrow: "Industries we serve",
  headline: "Built for Every Environment Gloves Touch",
  supporting:
    "Every industry wears gloves differently. Match protection, fit, and cost-per-use to the work in each environment—so procurement can standardize without defaulting to generic PPE.",
} as const;
