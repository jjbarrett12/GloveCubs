import { getStoreHrefForIntent } from "@/lib/discovery/intent-routes";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";

/** Educational procurement regions — illustrative, not live analytics. */
export const HOME_PROCUREMENT_REGIONS = [
  {
    id: "northeast",
    label: "Northeast",
    summary: "Healthcare density & multi-site facilities",
    detail:
      "Dense healthcare and foodservice operations drive recurring nitrile and vinyl programs—consolidation matters more than SKU count.",
    x: 78,
    y: 28,
  },
  {
    id: "southeast",
    label: "Southeast",
    summary: "Hospitality & janitorial corridors",
    detail:
      "High-turnover disposable demand across restaurants, contract cleaning, and light industrial—case pricing and reorder discipline dominate.",
    x: 72,
    y: 58,
  },
  {
    id: "midwest",
    label: "Midwest",
    summary: "Manufacturing & warehouse fulfillment",
    detail:
      "Industrial mechanical gloves, cut programs, and bulk disposables for production floors—spec clarity reduces downtime from wrong material.",
    x: 58,
    y: 38,
  },
  {
    id: "southwest",
    label: "Southwest",
    summary: "Automotive & industrial safety",
    detail:
      "Shop-floor oil resistance, mechanic disposables, and ANSI-rated work gloves—operators standardize by task, not by brand nostalgia.",
    x: 38,
    y: 52,
  },
  {
    id: "west",
    label: "West",
    summary: "Logistics hubs & coastal distribution",
    detail:
      "Fulfillment corridors connect coastal ports to inland DCs—national distributors need variant-level truth, not catalog noise.",
    x: 18,
    y: 42,
  },
  {
    id: "mountain",
    label: "Mountain",
    summary: "Salt Lake origin · western reach",
    detail:
      "GloveCubs headquarters in Salt Lake City anchors western fulfillment routes into nationwide programs.",
    x: 32,
    y: 38,
    highlight: true,
  },
] as const;

export type HomeIndustrySolution = {
  key: string;
  name: string;
  pain: string;
  gloveClasses: string;
  education: string;
  href: string;
  imageTone: "dark" | "light";
};

export const HOME_INDUSTRY_SOLUTIONS: HomeIndustrySolution[] = [
  {
    key: "food-service",
    name: "Food service",
    pain: "Glove changes every task, food-safe compliance, and prep-line speed cannot tolerate wrong material or thickness.",
    gloveClasses: "Food-safe nitrile & vinyl · powder-free · textured grip for wet prep",
    education: "Match thickness to task risk—lighter vinyl for low-contact, nitrile for heat, oil, and extended prep.",
    href: "/industries/hospitality",
    imageTone: "light",
  },
  {
    key: "janitorial",
    name: "Janitorial",
    pain: "Chemical exposure, multi-building variance, and invoice drift make standardized SKUs hard to maintain.",
    gloveClasses: "Chemical-resistant nitrile · extended cuff · high-volume disposables",
    education: "Standardize one SKU set per contract type so crews and procurement share the same source of truth.",
    href: "/industries/janitorial",
    imageTone: "dark",
  },
  {
    key: "automotive",
    name: "Automotive",
    pain: "Shop floors need oil-resistant disposables without confusing consumer checkout paths.",
    gloveClasses: "Mechanic nitrile · industrial disposable · task-specific work gloves",
    education: "Separate disposable programs from cut/chemical work gloves—quote-first keeps pack sizes honest.",
    href: getStoreHrefForIntent("store.search.automotive"),
    imageTone: "light",
  },
  {
    key: "manufacturing",
    name: "Manufacturing",
    pain: "Cut, chemical, and line-speed requirements collide—buyers need governed alternates, not a wall of lookalikes.",
    gloveClasses: "ANSI cut levels · chemical-resistant · high-dexterity nitrile",
    education: "Document task → glove class mapping so reorders do not drift off-spec across shifts.",
    href: "/industries/industrial",
    imageTone: "dark",
  },
  {
    key: "medical",
    name: "Medical & healthcare",
    pain: "Compliance, patient-care continuity, and supplier transparency outweigh coupon-driven switching.",
    gloveClasses: "Exam nitrile · procedure fit · chemo-rated where published on SKU",
    education: "Verify certifications on each listing—industry pages summarize typical specs; your policies govern final selection.",
    href: "/industries/healthcare",
    imageTone: "light",
  },
  {
    key: "tattoo",
    name: "Tattoo & body art",
    pain: "Barrier protection, dexterity, and client-facing presentation demand consistent black nitrile programs.",
    gloveClasses: "Black nitrile · powder-free · exam-grade dexterity",
    education: "Standardize thickness and texture for artist preference—recurring case orders reduce mid-week stock-outs.",
    href: buildStoreCatalogHref({ industries: ["tattoo_body_art"] }),
    imageTone: "dark",
  },
  {
    key: "industrial-safety",
    name: "Industrial safety",
    pain: "PPE programs span disposables and mechanical gloves—procurement needs one governed path per site.",
    gloveClasses: "Cut-resistant · impact · chemical · high-visibility work",
    education: "Map hazards to glove class first, then select SKUs from catalog attributes—not the reverse.",
    href: getStoreHrefForIntent("store.gf.safety"),
    imageTone: "light",
  },
];

export const HOME_FAQ_CATEGORIES = [
  {
    category: "Procurement",
    items: [
      {
        q: "Is GloveCubs built for one-off retail orders?",
        a: "No—we are quote-first B2B. You request pricing or upload invoices; our team confirms cases, SKUs, and fulfillment before anything ships.",
      },
      {
        q: "How do net terms work?",
        a: "Approved business accounts may qualify for net terms. Start with request pricing or invoice review—terms are confirmed during onboarding, not implied on the site.",
      },
      {
        q: "Can we standardize gloves across multiple sites?",
        a: "Yes. Industry pages and invoice matching help align SKUs. Recurring programs use the same variant truth whether you reorder from the catalog or a saved quote path.",
      },
    ],
  },
  {
    category: "Glove selection",
    items: [
      {
        q: "How do I choose thickness (mil)?",
        a: "Thicker gloves add barrier time and chemical holdout; thinner gloves improve dexterity. Use the education hub on the homepage or /glove-finder for task-based guidance—always verify against your SOP.",
      },
      {
        q: "Nitrile vs vinyl vs latex?",
        a: "Nitrile is the default for chemical and puncture needs; vinyl for value food-safe tasks; latex only where policy allows. We flag latex-free options where published on listings.",
      },
      {
        q: "What about food-safe or medical claims?",
        a: "Read certifications on each SKU. Industry pages describe typical use; your facility policies and regulators govern final selection.",
      },
    ],
  },
  {
    category: "Fulfillment & sourcing",
    items: [
      {
        q: "Where do you ship from?",
        a: "Operations are anchored in Salt Lake City, UT with nationwide B2B fulfillment. Lead times depend on SKU, volume, and program—request pricing for scoped answers.",
      },
      {
        q: "Do you support pallet and case programs?",
        a: "Yes. Case and pallet context appears on listings and in RFQ flows. High-volume programs route to a rep for scoped pricing.",
      },
    ],
  },
  {
    category: "AI & invoice analysis",
    items: [
      {
        q: "What does invoice upload actually do?",
        a: "You send a PDF or photo at /invoice-savings. We extract line items and map them to catalog options where possible—optional governed alternates, not random substitutes.",
      },
      {
        q: "Is the glove finder AI?",
        a: "/glove-finder is our guided wizard—it recommends from task, materials, and constraints using catalog-backed logic. It supports quotes; it does not replace your compliance review.",
      },
    ],
  },
  {
    category: "Recurring ordering",
    items: [
      {
        q: "How do repeat buyers reorder?",
        a: "Use request pricing with volume context, browse the store with case attributes, or upload updated invoices to refresh matches. Account tools extend for approved buyers.",
      },
      {
        q: "What if our invoice SKUs do not match your catalog?",
        a: "We reconcile descriptions to variants where we can. When we cannot map a line, we say so—no fabricated matches.",
      },
    ],
  },
] as const;

export type GloveEducationCriteria = {
  industry: string;
  foodSafe: boolean;
  chemicalExposure: boolean;
  thickness: "light" | "standard" | "heavy";
  dexterity: "high" | "standard";
  latexFree: boolean;
  powderFree: boolean;
  heavyDuty: boolean;
  texturedGrip: boolean;
};

export function deriveGloveEducationGuidance(c: GloveEducationCriteria): {
  headline: string;
  materials: string[];
  guidance: string[];
  procurementNote: string;
} {
  const materials: string[] = [];
  const guidance: string[] = [];

  if (c.foodSafe) {
    materials.push("Food-safe nitrile or vinyl");
    guidance.push("Powder-free, single-use gloves for direct food contact per your HACCP procedures.");
  }
  if (c.chemicalExposure) {
    materials.push("Nitrile (chemical barrier)");
    guidance.push("Prefer thicker nitrile when solvents or disinfectants are in the task path.");
  }
  if (c.heavyDuty) {
    materials.push("Heavy-duty nitrile or supported work glove class");
    guidance.push("Extended wear and abrasion—match mil or mechanical class to task severity.");
  }

  if (materials.length === 0) {
    if (c.latexFree) {
      materials.push("Nitrile or vinyl (latex-free)");
      guidance.push("Default to synthetic disposables when latex is excluded from your program.");
    } else {
      materials.push("Nitrile for general industrial disposable");
      guidance.push("Standardize thickness by task tier so reorders do not drift across shifts.");
    }
  } else if (c.latexFree) {
    guidance.push("Keep selections latex-free—nitrile or vinyl rather than natural rubber.");
  }

  if (c.heavyDuty || c.thickness === "heavy") {
    guidance.push("Heavy-duty / higher mil improves barrier time; trade off dexterity on precision tasks.");
  } else if (c.dexterity === "high" || c.thickness === "light") {
    guidance.push("Lighter mil preserves tactile sensitivity—pair with shorter task cycles if chemicals are present.");
  }

  if (c.powderFree) guidance.push("Powder-free reduces contamination risk in food and clean environments.");
  if (c.texturedGrip) guidance.push("Textured fingertips improve wet grip for prep, wash-down, and tool handling.");
  if (c.chemicalExposure && !c.heavyDuty) {
    guidance.push("Chemical tasks without heavy-duty rating may need extended cuff or a secondary glove class.");
  }

  const industryLabel =
    c.industry === "food-service"
      ? "food service"
      : c.industry === "healthcare"
        ? "healthcare"
        : c.industry === "janitorial"
          ? "janitorial"
          : c.industry === "industrial"
            ? "industrial"
            : "your operating environment";

  return {
    headline: `Directional guidance for ${industryLabel}`,
    materials: Array.from(new Set(materials)),
    guidance,
    procurementNote:
      "Rule-based educational guidance only—not live AI or automated SKU picks. Confirm final selection against published attributes and your facility policies. For catalog-backed paths, use request pricing or /glove-finder.",
  };
}
