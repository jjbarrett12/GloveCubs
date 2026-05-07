/**
 * Store “Industries” facet — display labels + stable order for sidebar UI.
 * Slugs must match `INDUSTRIES_VALUES` in `catalogos/src/lib/catalogos/attribute-dictionary-types.ts`.
 */
export const STORE_INDUSTRY_FACET_ROWS: { value: string; label: string }[] = [
  { value: "healthcare", label: "Healthcare / medical" },
  { value: "dental", label: "Dental & orthodontics" },
  { value: "veterinary", label: "Veterinary & animal care" },
  { value: "laboratories", label: "Laboratory & research" },
  { value: "pharmaceuticals", label: "Pharmacy & compounding" },
  { value: "food_service", label: "Food service & hospitality" },
  { value: "food_processing", label: "Food processing & prep lines" },
  { value: "education", label: "Schools & childcare" },
  { value: "retail_grocery", label: "Retail & grocery" },
  { value: "janitorial", label: "Janitorial & sanitation" },
  { value: "sanitation", label: "Sanitation" },
  { value: "beauty_personal_care", label: "Salons & spas" },
  { value: "tattoo_body_art", label: "Tattoo & piercing" },
  { value: "automotive", label: "Automotive" },
  { value: "electronics_assembly", label: "Electronics & assembly" },
  { value: "construction", label: "Construction & trades" },
  { value: "warehousing_logistics", label: "Warehousing & logistics" },
  { value: "metal_fabrication", label: "Metal fab & cut hazards" },
  { value: "chemical_processing", label: "Chemical processing" },
  { value: "industrial", label: "Industrial & plant" },
  { value: "cold_chain_outdoor", label: "Cold storage & outdoor" },
  { value: "agriculture", label: "Agriculture & farming" },
  { value: "oil_gas_energy", label: "Oil, gas & energy" },
  { value: "landscaping_grounds", label: "Landscaping & grounds" },
  { value: "emergency_services", label: "Fire, EMS & rescue" },
  { value: "security_public_safety", label: "Security & public safety" },
];
