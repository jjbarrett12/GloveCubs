// Industry landing page config — single source of truth for all 4 industry pages.

import { getStoreHrefForIntent } from "@/lib/discovery/intent-routes";

export type IndustryKey = "janitorial" | "hospitality" | "healthcare" | "industrial";

export interface SafetyCertification {
  icon: string;
  label: string;
}

export interface IndustryConfig {
  key: IndustryKey;
  name: string;
  tagline: string;
  subtagline: string;
  heroBullets: string[];
  proofStats: { label: string; value: string }[];
  /** Safety certifications to show in the proof strip (symbol + label). */
  safetyCertifications: SafetyCertification[];
  featuredCollections: {
    title: string;
    description: string;
    storeHref: string;
    badge?: string;
  }[];
  topCategories: { label: string; storeHref: string }[];
  useCases: { title: string; description: string }[];
  faq: { q: string; a: string }[];
  complianceNotes?: string[];
  primaryGradientClass: string;
  accentClass: string;
}

export const INDUSTRIES: Record<IndustryKey, IndustryConfig> = {
  janitorial: {
    key: "janitorial",
    name: "Janitorial Contractors",
    tagline: "Standardize SKUs. Cut spend. Keep crews moving.",
    subtagline: "One glove program per building—chemical-resistant options, fast reorder, and predictable case pricing.",
    heroBullets: [
      "Reduce spend by standardizing gloves and liners across sites",
      "Chemical-resistant options for restrooms and floor care",
      "Reorder in seconds—no more running out mid-shift",
    ],
    proofStats: [
      { label: "Multi-site programs", value: "Built for multi-location teams" },
      { label: "Spend visibility", value: "Spend comparison available" },
      { label: "Fulfillment", value: "Reviewed by location and volume" },
    ],
    safetyCertifications: [
      { icon: "cut", label: "Cut resistant" },
      { icon: "puncture", label: "Puncture resistant" },
      { icon: "chemical", label: "Chemical resistant" },
      { icon: "cold", label: "Cold weather" },
    ],
    featuredCollections: [
      { title: "Nitrile Exam Gloves (High-Volume)", description: "Powder-free, textured grip for high-turnover cleaning.", storeHref: getStoreHrefForIntent("store.cat.nitrile-gloves"), badge: "Best seller" },
      { title: "Chemical Handling", description: "Extended cuff and chemical-resistant options for tough cleans.", storeHref: getStoreHrefForIntent("store.search.chemical_handling") },
      { title: "Disposable PPE Packs", description: "Gloves, liners, and wipes in one order.", storeHref: getStoreHrefForIntent("store.search.ppe_packs") },
      { title: "Floor Care & Stripping", description: "Heavy-duty options for stripping and waxing.", storeHref: getStoreHrefForIntent("store.cat.work-gloves") },
      { title: "Restroom & Sanitation", description: "Fast-change nitrile and vinyl for high-frequency swaps.", storeHref: getStoreHrefForIntent("store.search.restroom_sanitation") },
      { title: "Cold Weather / Freezer", description: "Liners and insulated options for cold storage and outdoor work.", storeHref: getStoreHrefForIntent("store.search.cold_weather") },
    ],
    topCategories: [
      { label: "Nitrile Gloves", storeHref: getStoreHrefForIntent("store.cat.nitrile-gloves") },
      { label: "Vinyl Gloves", storeHref: getStoreHrefForIntent("store.cat.vinyl-gloves") },
      { label: "Work Gloves", storeHref: getStoreHrefForIntent("store.cat.work-gloves") },
      { label: "Chemical-Resistant", storeHref: getStoreHrefForIntent("store.cat.chemical-resistant") },
      { label: "Liners", storeHref: getStoreHrefForIntent("store.cat.liners") },
      { label: "PPE Packs", storeHref: getStoreHrefForIntent("store.search.ppe_packs") },
      { label: "Restroom Supplies", storeHref: getStoreHrefForIntent("store.search.restroom_sanitation") },
      { label: "Bulk / Case", storeHref: getStoreHrefForIntent("store.cat.bulk") },
    ],
    useCases: [
      { title: "Multi-building standardization", description: "One SKU set per contract type so every crew gets the same quality and you get one invoice." },
      { title: "Chemical and disinfectant resistance", description: "Thicker nitrile and extended-cuff options that hold up to daily chemical exposure." },
      { title: "Fast reorder and restock", description: "Reorder by case with saved Quicklists so you never run out during turnover." },
      { title: "Cost visibility and reduction", description: "Lock in case pricing and track spend by building or region." },
    ],
    faq: [
      { q: "How do I standardize gloves across multiple buildings?", a: "Pick 2–3 go-to SKUs (e.g. nitrile for general cleaning, chemical-resistant for restrooms) and set them as your default in Quicklists. Order by case for consistent pricing and delivery." },
      { q: "What thickness is best for janitorial work?", a: "For general cleaning, 5–6 mil nitrile is common. For chemical-heavy or restroom work, 6–8 mil or chemical-resistant options reduce tears and improve durability." },
      { q: "Do you offer case pricing for contractors?", a: "Yes. Case and multi-case pricing is available. Create an account or contact us for volume pricing on your standard SKUs." },
      { q: "Can I reorder the same items quickly?", a: "Yes. Use Quicklists to save your standard cart and reorder in one click. Optional: set up recurring orders for high-use items." },
      { q: "What about latex or powder-free?", a: "We carry powder-free and latex-free options. Most janitorial teams use powder-free nitrile to avoid residue and sensitivity issues." },
      { q: "How do I get products to multiple sites?", a: "Ship to a central warehouse or direct to each building. You can manage multiple delivery addresses in your account." },
    ],
    complianceNotes: ["Choose chemical-resistant gloves where SDS or task requires it.", "Powder-free options available for low-particulate environments."],
    primaryGradientClass: "from-emerald-500/20 via-teal-500/10 to-transparent",
    accentClass: "border-emerald-500/30 hover:border-emerald-400/50",
  },

  hospitality: {
    key: "hospitality",
    name: "Hospitality",
    tagline: "Food-safe gloves. Back-of-house speed. Consistent case pricing.",
    subtagline: "From prep to line—reliable stock, HACCP-minded options, and ordering that keeps the kitchen moving.",
    heroBullets: [
      "Food-safe nitrile and vinyl for prep and line service",
      "Consistent case pricing so you can forecast and reorder fast",
      "Reliable stock—no more last-minute runs to the store",
    ],
    proofStats: [
      { label: "Kitchen & hospitality", value: "Built for multi-location teams" },
      { label: "Case programs", value: "Quote-first case pricing" },
      { label: "Fulfillment", value: "Reviewed by location and volume" },
    ],
    safetyCertifications: [
      { icon: "food-safe", label: "Food safe" },
      { icon: "puncture", label: "Puncture resistant" },
      { icon: "cold", label: "Cold / freezer" },
    ],
    featuredCollections: [
      { title: "Food Prep & Line Service", description: "Black nitrile and food-safe options for prep and serving.", storeHref: getStoreHrefForIntent("store.search.food_prep"), badge: "Popular" },
      { title: "Nitrile Exam Gloves (High-Volume)", description: "Powder-free, high-volume boxes for busy kitchens.", storeHref: getStoreHrefForIntent("store.cat.nitrile-gloves") },
      { title: "Disposable PPE Packs", description: "Gloves and related disposables in one order.", storeHref: getStoreHrefForIntent("store.search.ppe_packs") },
      { title: "Black Nitrile (Kitchen standard)", description: "Durable, clean-looking black nitrile for back-of-house.", storeHref: getStoreHrefForIntent("store.hospitality.black_nitrile") },
      { title: "Vinyl (Value option)", description: "Budget-friendly food-safe vinyl for lower-risk tasks.", storeHref: getStoreHrefForIntent("store.cat.vinyl-gloves") },
      { title: "Cold Weather / Freezer", description: "Liners and options for cold prep and walk-in work.", storeHref: getStoreHrefForIntent("store.search.cold_weather") },
    ],
    topCategories: [
      { label: "Food-Safe Nitrile", storeHref: getStoreHrefForIntent("store.cat.nitrile-gloves") },
      { label: "Black Nitrile", storeHref: getStoreHrefForIntent("store.hospitality.black_nitrile") },
      { label: "Vinyl Gloves", storeHref: getStoreHrefForIntent("store.cat.vinyl-gloves") },
      { label: "Prep & Line", storeHref: getStoreHrefForIntent("store.search.food_prep") },
      { label: "PPE Packs", storeHref: getStoreHrefForIntent("store.search.ppe_packs") },
      { label: "Case Orders", storeHref: getStoreHrefForIntent("store.cat.bulk") },
      { label: "High-Volume", storeHref: getStoreHrefForIntent("store.cat.nitrile-gloves") },
      { label: "Freezer / Cold", storeHref: getStoreHrefForIntent("store.search.cold_weather") },
    ],
    useCases: [
      { title: "Prep and line speed", description: "Fast changeover, strong grip, and food-safe options so your team stays compliant and moving." },
      { title: "Consistent case pricing", description: "Lock in case pricing so you can forecast and reorder without surprises." },
      { title: "Reliable stock", description: "High in-stock rates and predictable delivery so you don’t run out during rush." },
      { title: "HACCP-minded choices", description: "Food-safe, powder-free, and single-use options that support your food-safety program." },
    ],
    faq: [
      { q: "Are these gloves food-safe?", a: "We carry gloves intended for food handling. Choose food-safe nitrile or vinyl and change gloves between tasks per your food-safety policy." },
      { q: "Why black nitrile for kitchens?", a: "Black nitrile is popular in back-of-house for appearance and durability. We stock food-safe black nitrile in multiple thicknesses." },
      { q: "Do you offer case pricing for hospitality?", a: "Yes. Case pricing is standard. Multi-location and high-volume accounts can request custom pricing." },
      {
        q: "How fast can I get restocked?",
        a: "Lead times depend on SKU, volume, and ship-to location—confirmed on your quote response, not implied at checkout. Save a Quicklist to rebuild quote requests quickly.",
      },
      { q: "Nitrile vs vinyl for hospitality?", a: "Nitrile is typically more durable and puncture-resistant; vinyl can be a value option for lower-risk tasks. Many kitchens standardize on nitrile for prep and line." },
      { q: "Can I order for multiple locations?", a: "Yes. You can ship to multiple addresses and use Quicklists or reorder by location." },
    ],
    complianceNotes: ["Select food-safe gloves for tasks that involve direct food contact.", "Follow your HACCP and glove-change procedures."],
    primaryGradientClass: "from-amber-500/20 via-orange-500/10 to-transparent",
    accentClass: "border-amber-500/30 hover:border-amber-400/50",
  },

  healthcare: {
    key: "healthcare",
    name: "Healthcare",
    tagline: "Exam gloves that perform. Compliance-ready. Skin-friendly.",
    subtagline: "Consistent fit, dependable supply, and options for sensitive skin—without overclaiming medical use.",
    heroBullets: [
      "Exam-grade nitrile in high-volume boxes for clinics and labs",
      "Powder-free, latex-free options for sensitive skin",
      "Dependable supply and case pricing for facilities",
    ],
    proofStats: [
      { label: "Clinical programs", value: "Built for multi-location teams" },
      { label: "SKU attributes", value: "Published specs per variant" },
      { label: "Fulfillment", value: "Reviewed by location and volume" },
    ],
    safetyCertifications: [
      { icon: "exam", label: "Exam grade" },
      { icon: "latex-free", label: "Latex-free" },
      { icon: "puncture", label: "Puncture resistant" },
    ],
    featuredCollections: [
      { title: "Nitrile Exam Gloves (High-Volume)", description: "Powder-free, textured grip for exams and procedures.", storeHref: getStoreHrefForIntent("store.cat.nitrile-gloves"), badge: "Best seller" },
      { title: "Powder-Free Nitrile", description: "Low-particulate, comfortable options for clinical use.", storeHref: getStoreHrefForIntent("store.search.powder_free_nitrile") },
      { title: "Latex-Free Options", description: "For teams and patients with latex sensitivity.", storeHref: getStoreHrefForIntent("store.search.latex_free_nitrile") },
      { title: "Textured Grip Exam", description: "Improved grip for instruments and handling.", storeHref: getStoreHrefForIntent("store.search.textured_grip") },
      { title: "Disposable PPE Packs", description: "Gloves and related disposables for clinical and support staff.", storeHref: getStoreHrefForIntent("store.search.ppe_packs") },
      { title: "Sensitive Skin", description: "Softer, low-irritant options where comfort matters.", storeHref: getStoreHrefForIntent("store.search.sensitive_skin") },
    ],
    topCategories: [
      { label: "Exam Gloves", storeHref: getStoreHrefForIntent("store.cat.nitrile-gloves") },
      { label: "Powder-Free", storeHref: getStoreHrefForIntent("store.search.powder_free_nitrile") },
      { label: "Latex-Free", storeHref: getStoreHrefForIntent("store.search.latex_free_nitrile") },
      { label: "Textured Grip", storeHref: getStoreHrefForIntent("store.search.textured_grip") },
      { label: "PPE Packs", storeHref: getStoreHrefForIntent("store.search.ppe_packs") },
      { label: "High-Volume", storeHref: getStoreHrefForIntent("store.cat.nitrile-gloves") },
      { label: "Sensitive Skin", storeHref: getStoreHrefForIntent("store.search.sensitive_skin") },
      { label: "Case / Bulk", storeHref: getStoreHrefForIntent("store.cat.bulk") },
    ],
    useCases: [
      { title: "Consistent fit and barrier", description: "Reliable exam gloves that meet your facility’s specs for fit and barrier protection." },
      { title: "Compliance and documentation", description: "Order history and consistent SKUs to support procurement and compliance." },
      { title: "Skin sensitivity", description: "Powder-free and latex-free options to reduce irritation and accommodate sensitivities." },
      { title: "Dependable supply", description: "Case pricing and high in-stock rates so you don’t run short during peak demand." },
    ],
    faq: [
      { q: "Are these medical-grade or FDA-approved?", a: "We supply gloves suitable for exam and general clinical use. Check product details for specific certifications. We do not make medical device claims; consult your compliance team for your facility’s requirements." },
      { q: "Why powder-free?", a: "Powder-free gloves reduce residue and particulates, which many facilities prefer for exams and procedures and for staff and patient comfort." },
      { q: "Do you have latex-free options?", a: "Yes. We carry latex-free nitrile options for teams and environments where latex sensitivity is a concern." },
      { q: "Can we get case pricing for our facility?", a: "Yes. Case and multi-case pricing is available. Create an account or contact us for facility pricing." },
      { q: "How do I choose thickness?", a: "3–6 mil is common for exams. Thicker options (6–8 mil) can be used where more durability is needed. Your facility’s policy may specify requirements." },
      { q: "Do you support reorder and Quicklists?", a: "Yes. Save your standard gloves as a Quicklist and reorder in one click. Optional: set up recurring orders for high-use SKUs." },
    ],
    complianceNotes: ["Select gloves that meet your facility’s policy and any applicable standards.", "We do not make medical device or treatment claims."],
    primaryGradientClass: "from-blue-500/20 via-indigo-500/10 to-transparent",
    accentClass: "border-blue-500/30 hover:border-blue-400/50",
  },

  industrial: {
    key: "industrial",
    name: "Industrial & Manufacturing",
    tagline: "Cut-resistant. Chemical-resistant. Task-specific protection.",
    subtagline: "Bulk procurement and plant-wide standardization—ANSI cut levels, chemical options, and buy-by-case workflows.",
    heroBullets: [
      "Cut-resistant gloves from ANSI A3–A6 for sharp handling",
      "Chemical-resistant and task-specific options for harsh environments",
      "Bulk and case ordering to standardize PPE across the plant",
    ],
    proofStats: [
      { label: "Plant programs", value: "Built for multi-location teams" },
      { label: "Cut levels (ANSI)", value: "A3–A8 on published SKUs" },
      { label: "Fulfillment", value: "Reviewed by location and volume" },
    ],
    safetyCertifications: [
      { icon: "cut", label: "Cut resistant (ANSI)" },
      { icon: "puncture", label: "Puncture resistant" },
      { icon: "burn", label: "Burn resistant" },
      { icon: "cold", label: "Cold weather" },
      { icon: "chemical", label: "Chemical resistant" },
      { icon: "impact", label: "Impact resistant" },
    ],
    featuredCollections: [
      { title: "Cut Resistance (ANSI A3–A6)", description: "Cut-resistant gloves for sharp materials and assembly.", storeHref: getStoreHrefForIntent("store.search.cut_resistant"), badge: "ANSI" },
      { title: "Chemical Handling", description: "Chemical-resistant options for coatings, cleaning, and processing.", storeHref: getStoreHrefForIntent("store.search.chemical_handling") },
      { title: "Cold Weather / Freezer", description: "Liners and insulated gloves for cold storage and outdoor work.", storeHref: getStoreHrefForIntent("store.search.cold_weather") },
      { title: "Disposable PPE Packs", description: "Gloves and related PPE in one order for general plant use.", storeHref: getStoreHrefForIntent("store.search.ppe_packs") },
      { title: "Heavy-Duty Work Gloves", description: "Abrasion and impact options for rough handling.", storeHref: getStoreHrefForIntent("store.cat.work-gloves") },
      { title: "Nitrile Exam Gloves (High-Volume)", description: "Disposable nitrile for light assembly and inspection.", storeHref: getStoreHrefForIntent("store.cat.nitrile-gloves") },
    ],
    topCategories: [
      { label: "Cut-Resistant", storeHref: getStoreHrefForIntent("store.search.cut_resistant") },
      { label: "Chemical-Resistant", storeHref: getStoreHrefForIntent("store.search.chemical_handling") },
      { label: "Work Gloves", storeHref: getStoreHrefForIntent("store.cat.work-gloves") },
      { label: "Nitrile Disposable", storeHref: getStoreHrefForIntent("store.cat.nitrile-gloves") },
      { label: "PPE Packs", storeHref: getStoreHrefForIntent("store.search.ppe_packs") },
      { label: "Cold / Freezer", storeHref: getStoreHrefForIntent("store.search.cold_weather") },
      { label: "ANSI A3–A6", storeHref: getStoreHrefForIntent("store.search.cut_resistant") },
      { label: "Bulk / Case", storeHref: getStoreHrefForIntent("store.cat.bulk") },
    ],
    useCases: [
      { title: "Cut and puncture protection", description: "ANSI-rated cut-resistant gloves so you can match the glove to the task and reduce incidents." },
      { title: "Chemical and abrasion resistance", description: "Task-specific options for chemical handling, coatings, and rough materials." },
      { title: "Plant-wide standardization", description: "One set of SKUs per department or site for easier ordering and cost control." },
      { title: "Bulk and case procurement", description: "Order by case with predictable pricing and delivery for maintenance and production." },
    ],
    faq: [
      { q: "How do I choose the right cut level?", a: "Match the glove to the sharpness and handling risk. ANSI A3–A4 is often used for light cut risk; A5–A6 and above for sharper materials. Your safety team can help map tasks to levels." },
      { q: "Do you have chemical-resistant options?", a: "Yes. We carry chemical-resistant gloves for various exposures. Check product details and SDS for chemical compatibility." },
      { q: "Can we standardize gloves across the plant?", a: "Yes. Many plants choose 2–4 standard SKUs (e.g. cut-resistant for assembly, nitrile for light tasks) and order by case. Quicklists make reorder fast." },
      { q: "Do you offer bulk or contract pricing?", a: "Yes. Case and multi-case pricing is available. Contact us for high-volume or contract pricing." },
      { q: "What about impact and abrasion?", a: "We carry heavy-duty work gloves rated for abrasion and impact. Use filters to narrow by task and level." },
      { q: "How do reorders work?", a: "Save your standard gloves in a Quicklist and reorder in one click. You can also set up recurring orders for high-use items." },
    ],
    complianceNotes: ["Select cut-resistant gloves that meet ANSI and your task risk assessment.", "Chemical-resistant gloves: verify compatibility with your chemicals per SDS."],
    primaryGradientClass: "from-slate-500/20 via-zinc-500/10 to-transparent",
    accentClass: "border-slate-400/30 hover:border-slate-300/50",
  },
};

export const INDUSTRY_KEYS: IndustryKey[] = ["janitorial", "hospitality", "healthcare", "industrial"];

export function getIndustryConfig(key: string): IndustryConfig | null {
  if (!key || !INDUSTRIES[key as IndustryKey]) return null;
  return INDUSTRIES[key as IndustryKey];
}
