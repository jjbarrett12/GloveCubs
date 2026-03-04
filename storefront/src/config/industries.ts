// Industry landing page config — single source of truth for all 4 industry pages.

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
      { label: "Sites standardized", value: "500+" },
      { label: "Avg. spend reduction", value: "18%" },
      { label: "Reorder lead time", value: "Same-day" },
    ],
    safetyCertifications: [
      { icon: "cut", label: "Cut resistant" },
      { icon: "puncture", label: "Puncture resistant" },
      { icon: "chemical", label: "Chemical resistant" },
      { icon: "cold", label: "Cold weather" },
    ],
    featuredCollections: [
      { title: "Nitrile Exam Gloves (High-Volume)", description: "Powder-free, textured grip for high-turnover cleaning.", storeHref: "/store?industry=janitorial&category=nitrile-gloves", badge: "Best seller" },
      { title: "Chemical Handling", description: "Extended cuff and chemical-resistant options for tough cleans.", storeHref: "/store?industry=janitorial&collection=chemical-handling" },
      { title: "Disposable PPE Packs", description: "Gloves, liners, and wipes in one order.", storeHref: "/store?industry=janitorial&collection=ppe-packs" },
      { title: "Floor Care & Stripping", description: "Heavy-duty options for stripping and waxing.", storeHref: "/store?industry=janitorial&category=work-gloves" },
      { title: "Restroom & Sanitation", description: "Fast-change nitrile and vinyl for high-frequency swaps.", storeHref: "/store?industry=janitorial&collection=restroom-sanitation" },
      { title: "Cold Weather / Freezer", description: "Liners and insulated options for cold storage and outdoor work.", storeHref: "/store?industry=janitorial&collection=cold-weather" },
    ],
    topCategories: [
      { label: "Nitrile Gloves", storeHref: "/store?industry=janitorial&category=nitrile-gloves" },
      { label: "Vinyl Gloves", storeHref: "/store?industry=janitorial&category=vinyl-gloves" },
      { label: "Work Gloves", storeHref: "/store?industry=janitorial&category=work-gloves" },
      { label: "Chemical-Resistant", storeHref: "/store?industry=janitorial&category=chemical-resistant" },
      { label: "Liners", storeHref: "/store?industry=janitorial&category=liners" },
      { label: "PPE Packs", storeHref: "/store?industry=janitorial&collection=ppe-packs" },
      { label: "Restroom Supplies", storeHref: "/store?industry=janitorial&collection=restroom-sanitation" },
      { label: "Bulk / Case", storeHref: "/store?industry=janitorial&category=bulk" },
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
      { label: "Hospitality sites supplied", value: "1,200+" },
      { label: "Case orders/month", value: "15K+" },
      { label: "In-stock rate", value: "99%" },
    ],
    safetyCertifications: [
      { icon: "food-safe", label: "Food safe" },
      { icon: "puncture", label: "Puncture resistant" },
      { icon: "cold", label: "Cold / freezer" },
    ],
    featuredCollections: [
      { title: "Food Prep & Line Service", description: "Black nitrile and food-safe options for prep and serving.", storeHref: "/store?industry=hospitality&collection=food-prep", badge: "Popular" },
      { title: "Nitrile Exam Gloves (High-Volume)", description: "Powder-free, high-volume boxes for busy kitchens.", storeHref: "/store?industry=hospitality&category=nitrile-gloves" },
      { title: "Disposable PPE Packs", description: "Gloves and related disposables in one order.", storeHref: "/store?industry=hospitality&collection=ppe-packs" },
      { title: "Black Nitrile (Kitchen standard)", description: "Durable, clean-looking black nitrile for back-of-house.", storeHref: "/store?industry=hospitality&category=nitrile-gloves&color=black" },
      { title: "Vinyl (Value option)", description: "Budget-friendly food-safe vinyl for lower-risk tasks.", storeHref: "/store?industry=hospitality&category=vinyl-gloves" },
      { title: "Cold Weather / Freezer", description: "Liners and options for cold prep and walk-in work.", storeHref: "/store?industry=hospitality&collection=cold-weather" },
    ],
    topCategories: [
      { label: "Food-Safe Nitrile", storeHref: "/store?industry=hospitality&category=nitrile-gloves" },
      { label: "Black Nitrile", storeHref: "/store?industry=hospitality&category=nitrile-gloves&color=black" },
      { label: "Vinyl Gloves", storeHref: "/store?industry=hospitality&category=vinyl-gloves" },
      { label: "Prep & Line", storeHref: "/store?industry=hospitality&collection=food-prep" },
      { label: "PPE Packs", storeHref: "/store?industry=hospitality&collection=ppe-packs" },
      { label: "Case Orders", storeHref: "/store?industry=hospitality&category=bulk" },
      { label: "High-Volume", storeHref: "/store?industry=hospitality&category=nitrile-gloves" },
      { label: "Freezer / Cold", storeHref: "/store?industry=hospitality&collection=cold-weather" },
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
      { q: "How fast can I get restocked?", a: "We aim for same-day or next-day shipping on in-stock items. Create a Quicklist to reorder your standard items in one click." },
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
      { label: "Facilities supplied", value: "800+" },
      { label: "Powder-free options", value: "50+" },
      { label: "On-time delivery", value: "99%" },
    ],
    safetyCertifications: [
      { icon: "exam", label: "Exam grade" },
      { icon: "latex-free", label: "Latex-free" },
      { icon: "puncture", label: "Puncture resistant" },
    ],
    featuredCollections: [
      { title: "Nitrile Exam Gloves (High-Volume)", description: "Powder-free, textured grip for exams and procedures.", storeHref: "/store?industry=healthcare&category=nitrile-gloves", badge: "Best seller" },
      { title: "Powder-Free Nitrile", description: "Low-particulate, comfortable options for clinical use.", storeHref: "/store?industry=healthcare&category=nitrile-gloves&powderFree=true" },
      { title: "Latex-Free Options", description: "For teams and patients with latex sensitivity.", storeHref: "/store?industry=healthcare&category=nitrile-gloves&latexFree=true" },
      { title: "Textured Grip Exam", description: "Improved grip for instruments and handling.", storeHref: "/store?industry=healthcare&collection=textured-grip" },
      { title: "Disposable PPE Packs", description: "Gloves and related disposables for clinical and support staff.", storeHref: "/store?industry=healthcare&collection=ppe-packs" },
      { title: "Sensitive Skin", description: "Softer, low-irritant options where comfort matters.", storeHref: "/store?industry=healthcare&collection=sensitive-skin" },
    ],
    topCategories: [
      { label: "Exam Gloves", storeHref: "/store?industry=healthcare&category=nitrile-gloves" },
      { label: "Powder-Free", storeHref: "/store?industry=healthcare&category=nitrile-gloves&powderFree=true" },
      { label: "Latex-Free", storeHref: "/store?industry=healthcare&category=nitrile-gloves&latexFree=true" },
      { label: "Textured Grip", storeHref: "/store?industry=healthcare&collection=textured-grip" },
      { label: "PPE Packs", storeHref: "/store?industry=healthcare&collection=ppe-packs" },
      { label: "High-Volume", storeHref: "/store?industry=healthcare&category=nitrile-gloves" },
      { label: "Sensitive Skin", storeHref: "/store?industry=healthcare&collection=sensitive-skin" },
      { label: "Case / Bulk", storeHref: "/store?industry=healthcare&category=bulk" },
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
      { label: "Plants supplied", value: "400+" },
      { label: "Cut levels (ANSI)", value: "A3–A8" },
      { label: "Case orders", value: "10K+/mo" },
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
      { title: "Cut Resistance (ANSI A3–A6)", description: "Cut-resistant gloves for sharp materials and assembly.", storeHref: "/store?industry=industrial&collection=cut-resistant", badge: "ANSI" },
      { title: "Chemical Handling", description: "Chemical-resistant options for coatings, cleaning, and processing.", storeHref: "/store?industry=industrial&collection=chemical-handling" },
      { title: "Cold Weather / Freezer", description: "Liners and insulated gloves for cold storage and outdoor work.", storeHref: "/store?industry=industrial&collection=cold-weather" },
      { title: "Disposable PPE Packs", description: "Gloves and related PPE in one order for general plant use.", storeHref: "/store?industry=industrial&collection=ppe-packs" },
      { title: "Heavy-Duty Work Gloves", description: "Abrasion and impact options for rough handling.", storeHref: "/store?industry=industrial&category=work-gloves" },
      { title: "Nitrile Exam Gloves (High-Volume)", description: "Disposable nitrile for light assembly and inspection.", storeHref: "/store?industry=industrial&category=nitrile-gloves" },
    ],
    topCategories: [
      { label: "Cut-Resistant", storeHref: "/store?industry=industrial&collection=cut-resistant" },
      { label: "Chemical-Resistant", storeHref: "/store?industry=industrial&collection=chemical-handling" },
      { label: "Work Gloves", storeHref: "/store?industry=industrial&category=work-gloves" },
      { label: "Nitrile Disposable", storeHref: "/store?industry=industrial&category=nitrile-gloves" },
      { label: "PPE Packs", storeHref: "/store?industry=industrial&collection=ppe-packs" },
      { label: "Cold / Freezer", storeHref: "/store?industry=industrial&collection=cold-weather" },
      { label: "ANSI A3–A6", storeHref: "/store?industry=industrial&collection=cut-resistant" },
      { label: "Bulk / Case", storeHref: "/store?industry=industrial&category=bulk" },
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
