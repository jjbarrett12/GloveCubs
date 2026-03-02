// src/config/industries.ts
// GloveCubs — Industry Landing Page Config
// NOTE: Adjust heroImage.src paths to match your actual /public assets or CDN URLs.
// NOTE: productFilter.industryTag MUST match whatever tagging system your product catalog uses.

export type IndustrySlug =
  | "medical"
  | "janitorial"
  | "food-service"
  | "industrial"
  | "automotive";

export interface IndustryConfig {
  slug: IndustrySlug;
  label: string;
  navLabel: string;
  seo: {
    title: string;
    description: string;
  };
  hero: {
    headline: string;
    subheadline: string;
    ctaPrimary: { label: string; href: string };
    ctaSecondary?: { label: string; href: string };
    heroImage: { src: string; alt: string };
    overlayStyle?: "gradient" | "soft" | "none";
  };
  highlights: Array<{ title: string; body: string; icon?: string }>;
  complianceBadges?: Array<{ label: string; tooltip?: string; icon?: string }>;
  productFilter: {
    industryTag: string;
    defaults?: {
      gloveType?:
        | "nitrile"
        | "vinyl"
        | "latex"
        | "cut"
        | "impact"
        | "work"
        | "disposable";
      thicknessMilMin?: number;
      thicknessMilMax?: number;
      powderFree?: boolean;
      latexFree?: boolean;
      foodSafe?: boolean;
      extendedCuff?: boolean;
      texturedGrip?: boolean;
      chemoRated?: boolean;
      blackColorPreferred?: boolean;
      oilResistant?: boolean;
      cutLevelMin?: "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A8" | "A9";
      impactRated?: boolean;
    };
    // These drive your QuickPickerBar chips (use keys your UI understands)
    quickChips?: Array<{
      label: string;
      params: Record<string, string | number | boolean>;
    }>;
  };
  proof: {
    stats: Array<{ label: string; value: string }>;
    testimonials?: Array<{
      quote: string;
      name: string;
      title?: string;
      company?: string;
    }>;
  };
  faq: Array<{ q: string; a: string }>;
}

export const industries: Record<IndustrySlug, IndustryConfig> = {
  medical: {
    slug: "medical",
    label: "Medical & Healthcare",
    navLabel: "Medical",
    seo: {
      title: "Medical Gloves | Clinical-Grade Nitrile & Exam Gloves | GloveCubs",
      description:
        "Clinical-grade exam gloves for healthcare teams—powder-free, latex-free options, textured grip, and bulk pricing for clinics, labs, and urgent care.",
    },
    hero: {
      headline: "Clinical-Grade Protection. Zero Compromise.",
      subheadline:
        "For clinics, labs, and urgent care—gloves that feel great, grip well, and stand up to real shifts.",
      ctaPrimary: { label: "Shop Medical Gloves", href: "#shop" },
      ctaSecondary: { label: "Get Bulk Pricing", href: "/bulk-pricing?industry=medical" },
      heroImage: {
        src: "/images/industries/medical-hero.jpg",
        alt: "Healthcare professional putting on nitrile exam gloves in a clinical setting",
      },
      overlayStyle: "soft",
    },
    highlights: [
      {
        title: "Comfort for Long Shifts",
        body: "Soft, flexible materials that reduce hand fatigue—without sacrificing strength.",
        icon: "hand",
      },
      {
        title: "Reliable Barrier + Grip",
        body: "Textured fingertips and consistent thickness to help prevent slips during exams and procedures.",
        icon: "shield",
      },
      {
        title: "Options for Sensitive Teams",
        body: "Powder-free and latex-free selections for workplaces that prioritize skin comfort.",
        icon: "sparkle",
      },
    ],
    complianceBadges: [
      {
        label: "Powder-Free Options",
        tooltip: "Many exam glove options are powder-free to reduce irritation and mess.",
        icon: "badge",
      },
      {
        label: "Latex-Free Options",
        tooltip: "Latex-free selections available for teams managing sensitivities.",
        icon: "badge",
      },
      {
        label: "Textured Grip",
        tooltip: "Grip-forward options for confident handling.",
        icon: "badge",
      },
    ],
    productFilter: {
      industryTag: "medical",
      defaults: {
        gloveType: "nitrile",
        powderFree: true,
        latexFree: true,
        texturedGrip: true,
        thicknessMilMin: 3,
        thicknessMilMax: 6,
      },
      quickChips: [
        { label: "Best Sellers", params: { sort: "bestsellers" } },
        { label: "Powder-Free", params: { powderFree: true } },
        { label: "Latex-Free", params: { latexFree: true } },
        { label: "Extra Grip", params: { texturedGrip: true } },
        { label: "Thicker (6–8 mil)", params: { thickness: "6-8" } },
      ],
    },
    proof: {
      stats: [
        { label: "Common Use", value: "Clinics • Labs • Urgent Care" },
        { label: "Popular Picks", value: "Nitrile • Textured • Powder-Free" },
        { label: "Ordering", value: "Box & Case Options" },
      ],
      testimonials: [
        {
          quote:
            "We switched to a thicker nitrile option and stopped dealing with constant glove tears during busy days.",
          name: "Practice Manager",
          company: "Outpatient Clinic",
        },
        {
          quote:
            "The grip is noticeably better—especially when moving fast and handling small instruments.",
          name: "Lead Tech",
          company: "Diagnostics Lab",
        },
      ],
    },
    faq: [
      {
        q: "Nitrile vs latex—what should we choose?",
        a: "Nitrile is the go-to for many healthcare teams because it offers strong puncture resistance and avoids latex sensitivity issues. Latex can feel very elastic, but many workplaces prefer nitrile for compatibility and comfort.",
      },
      {
        q: "Are powder-free gloves better for healthcare?",
        a: "In most clinical environments, powder-free is preferred because it reduces residue, irritation, and cleanup. It also supports a cleaner workflow during exams and procedures.",
      },
      {
        q: "What thickness should we buy?",
        a: "For general exams, 3–6 mil is common. If you need more durability (frequent glove changes, rougher tasks, or higher tear risk), 6–8 mil can be a solid upgrade.",
      },
      {
        q: "Do you offer case pricing for clinics?",
        a: "Yes. Most products support case ordering, and higher-volume teams can request bulk pricing directly from the page.",
      },
    ],
  },

  janitorial: {
    slug: "janitorial",
    label: "Janitorial & Facility Maintenance",
    navLabel: "Janitorial",
    seo: {
      title: "Janitorial Gloves | Chemical-Resistant & Crew-Ready | GloveCubs",
      description:
        "Gloves built for facility work—restrooms, floor care, chemicals, and long shifts. Durable nitrile options with bulk pricing for crews.",
    },
    hero: {
      headline: "Built for Commercial Cleaning Crews.",
      subheadline:
        "Restrooms. Floor care. Chemicals. Real facilities. Gloves that last the shift and keep crews moving.",
      ctaPrimary: { label: "Shop Facility Gloves", href: "#shop" },
      ctaSecondary: { label: "Get Crew Pricing", href: "/bulk-pricing?industry=janitorial" },
      heroImage: {
        src: "/images/industries/janitorial-hero.jpg",
        alt: "Commercial cleaning professional wearing gloves while cleaning a facility",
      },
      overlayStyle: "gradient",
    },
    highlights: [
      {
        title: "Chemical-Ready Options",
        body: "Choose gloves that stand up to disinfectants, degreasers, and daily exposure.",
        icon: "flask",
      },
      {
        title: "Shift Durability",
        body: "Thicker nitrile options reduce blowouts and keep crews productive.",
        icon: "bolt",
      },
      {
        title: "Comfort That Doesn't Quit",
        body: "Tactile feel + secure grip so teams don't fight their PPE all day.",
        icon: "sparkle",
      },
    ],
    complianceBadges: [
      {
        label: "Chemical Resistance",
        tooltip: "Select thicker options for tougher chemical workflows.",
        icon: "badge",
      },
      {
        label: "Textured Grip",
        tooltip: "Grip-focused gloves help reduce slips when handling tools and wet surfaces.",
        icon: "badge",
      },
      {
        label: "Extended Cuff Options",
        tooltip: "Extra coverage for splash zones and heavy-duty tasks.",
        icon: "badge",
      },
    ],
    productFilter: {
      industryTag: "janitorial",
      defaults: {
        gloveType: "nitrile",
        powderFree: true,
        latexFree: true,
        texturedGrip: true,
        thicknessMilMin: 5,
        thicknessMilMax: 8,
        extendedCuff: false,
      },
      quickChips: [
        { label: "Best Sellers", params: { sort: "bestsellers" } },
        { label: "Restroom Work", params: { thickness: "6-8", texturedGrip: true } },
        { label: "Floor Care", params: { thickness: "6-8", texturedGrip: true } },
        { label: "Extended Cuff", params: { extendedCuff: true } },
        { label: "Extra Thick (8–10 mil)", params: { thickness: "8-10" } },
      ],
    },
    proof: {
      stats: [
        { label: "Built For", value: "Restrooms • Floor Care • Turnovers" },
        { label: "Most Popular", value: "6–8 mil Nitrile" },
        { label: "Ordering", value: "Crew & Case Pricing" },
      ],
      testimonials: [
        {
          quote:
            "Our crews stopped burning through boxes as fast once we standardized on thicker nitrile.",
          name: "Operations Manager",
          company: "Commercial Cleaning Co.",
        },
        {
          quote:
            "Grip matters. The textured option helped when everything is wet and moving fast.",
          name: "Field Supervisor",
          company: "Facilities Team",
        },
      ],
    },
    faq: [
      {
        q: "What gloves are best for restroom chemicals?",
        a: "Look for thicker nitrile options (often 6–8 mil or higher) with good grip. Thicker gloves generally last longer in chemical-heavy environments and reduce blowouts during tough cleans.",
      },
      {
        q: "Should crews use black nitrile or blue nitrile?",
        a: "Either can work—black nitrile is popular for appearance and hiding stains, while blue is common in many supply closets. Choose based on your team preference and the job demands (thickness + grip usually matter more).",
      },
      {
        q: "Do you offer bulk/crew pricing?",
        a: "Yes. If you order by the case or have multiple crews, request crew pricing and we'll help standardize the right SKUs.",
      },
      {
        q: "What thickness is a good standard for janitorial crews?",
        a: "Many commercial cleaning teams standardize around 6–8 mil nitrile for durability and confidence without getting too stiff.",
      },
    ],
  },

  "food-service": {
    slug: "food-service",
    label: "Food Service & Restaurants",
    navLabel: "Food Service",
    seo: {
      title: "Food Service Gloves | Fast, Clean, Food-Safe Options | GloveCubs",
      description:
        "Food-safe glove options for restaurants and kitchens—quick changeover, strong grip, and bulk pricing. Choose black nitrile, vinyl, and more.",
    },
    hero: {
      headline: "Safe Food Handling Starts Here.",
      subheadline:
        "Prep. Serve. Repeat. Gloves that keep up with fast kitchens—clean, comfortable, and easy to swap.",
      ctaPrimary: { label: "Shop Food-Service Gloves", href: "#shop" },
      ctaSecondary: { label: "Get Restaurant Pricing", href: "/bulk-pricing?industry=food-service" },
      heroImage: {
        src: "/images/industries/food-hero.jpg",
        alt: "Chef wearing disposable gloves preparing food in a commercial kitchen",
      },
      overlayStyle: "soft",
    },
    highlights: [
      {
        title: "Fast Changeovers",
        body: "Easy on/off for high-velocity prep lines and frequent glove swaps.",
        icon: "timer",
      },
      {
        title: "Confident Grip",
        body: "Textured options help with wet ingredients and slick packaging.",
        icon: "hand",
      },
      {
        title: "Kitchen-Friendly Choices",
        body: "Popular picks like black nitrile and value-friendly options for high-volume teams.",
        icon: "utensils",
      },
    ],
    complianceBadges: [
      {
        label: "Food-Safe Options",
        tooltip: "Choose gloves intended for food handling workflows.",
        icon: "badge",
      },
      {
        label: "Powder-Free Options",
        tooltip: "Powder-free helps keep prep areas cleaner.",
        icon: "badge",
      },
      {
        label: "High-Volume Ready",
        tooltip: "Case ordering and restaurant pricing available.",
        icon: "badge",
      },
    ],
    productFilter: {
      industryTag: "food-service",
      defaults: {
        gloveType: "disposable",
        powderFree: true,
        foodSafe: true,
        texturedGrip: true,
        thicknessMilMin: 3,
        thicknessMilMax: 6,
        blackColorPreferred: true,
      },
      quickChips: [
        { label: "Best Sellers", params: { sort: "bestsellers" } },
        { label: "Black Nitrile", params: { color: "black", gloveType: "nitrile" } },
        { label: "Value Option", params: { sort: "price_asc" } },
        { label: "Extra Grip", params: { texturedGrip: true } },
        { label: "Thicker (6–8 mil)", params: { thickness: "6-8" } },
      ],
    },
    proof: {
      stats: [
        { label: "Designed For", value: "Prep Lines • Catering • Back-of-House" },
        { label: "Most Popular", value: "Black Nitrile" },
        { label: "Ordering", value: "Case & Restaurant Pricing" },
      ],
      testimonials: [
        {
          quote:
            "Black nitrile became our standard—looks clean, feels solid, and holds up during rush.",
          name: "Kitchen Manager",
          company: "Restaurant Group",
        },
        {
          quote:
            "We needed something fast to swap and still grippy. These hit the sweet spot.",
          name: "Chef",
          company: "Catering Team",
        },
      ],
    },
    faq: [
      {
        q: "Are black nitrile gloves food-safe?",
        a: "Many black nitrile options are used in food-service workflows. The key is selecting gloves intended for food handling and choosing the thickness/grip that matches your kitchen's pace.",
      },
      {
        q: "Nitrile vs vinyl for restaurants?",
        a: "Nitrile usually offers better durability and puncture resistance, while vinyl can be a value option for lower-risk tasks. High-volume kitchens often standardize nitrile for fewer tears mid-shift.",
      },
      {
        q: "What thickness is best for kitchen work?",
        a: "For most prep tasks, 3–6 mil works well. If you're tearing gloves during rush or handling rough packaging, consider 6–8 mil for extra durability.",
      },
      {
        q: "Do you offer case pricing for restaurants?",
        a: "Yes. Order by the case, or request restaurant pricing if you run multiple locations or high monthly volume.",
      },
    ],
  },

  industrial: {
    slug: "industrial",
    label: "Industrial & Construction",
    navLabel: "Industrial",
    seo: {
      title: "Industrial Gloves | Heavy-Duty, Cut & Impact Options | GloveCubs",
      description:
        "Heavy-duty gloves built for real work—abrasion, oils, and harsh environments. Shop cut-resistant, impact-rated, and thick disposable options with bulk pricing.",
    },
    hero: {
      headline: "Serious Protection for Serious Work.",
      subheadline:
        "Abrasion. Oils. Impact. Tough environments demand gloves that don't quit—spec-forward options for crews.",
      ctaPrimary: { label: "Shop Heavy-Duty Gloves", href: "#shop" },
      ctaSecondary: { label: "Request Contractor Pricing", href: "/bulk-pricing?industry=industrial" },
      heroImage: {
        src: "/images/industries/industrial-hero.jpg",
        alt: "Industrial worker wearing protective gloves in a job site environment",
      },
      overlayStyle: "gradient",
    },
    highlights: [
      {
        title: "Spec-Driven Selection",
        body: "Choose by cut level, impact rating, thickness, and grip—fast.",
        icon: "ruler",
      },
      {
        title: "Built for Abrasion + Oils",
        body: "Options designed for harsh handling, rough materials, and greasy environments.",
        icon: "gear",
      },
      {
        title: "Crew-Ready Ordering",
        body: "Case pricing and contractor-friendly workflows so you can standardize PPE.",
        icon: "truck",
      },
    ],
    complianceBadges: [
      {
        label: "Cut-Resistant Options",
        tooltip: "Choose higher cut levels for sharper materials and risk-heavy workflows.",
        icon: "badge",
      },
      {
        label: "Impact-Rated Options",
        tooltip: "For jobs with crush/impact risk—select impact-rated gloves where needed.",
        icon: "badge",
      },
      {
        label: "Oil + Abrasion Focus",
        tooltip: "Grip and durability options for tough industrial environments.",
        icon: "badge",
      },
    ],
    productFilter: {
      industryTag: "industrial",
      defaults: {
        gloveType: "work",
        thicknessMilMin: 6,
        texturedGrip: true,
        oilResistant: true,
      },
      quickChips: [
        { label: "Best Sellers", params: { sort: "bestsellers" } },
        { label: "Cut Resistant (A3+)", params: { cutLevelMin: "A3" } },
        { label: "Impact Rated", params: { impactRated: true } },
        { label: "Oil Resistant", params: { oilResistant: true } },
        { label: "Extra Thick Disposable", params: { gloveType: "nitrile", thickness: "8-10" } },
      ],
    },
    proof: {
      stats: [
        { label: "Use Cases", value: "Construction • Warehouse • Industrial Ops" },
        { label: "Shop By", value: "Cut • Impact • Thickness" },
        { label: "Pricing", value: "Contractor & Case Rates" },
      ],
      testimonials: [
        {
          quote:
            "We stopped guessing and standardized on a cut level that actually matched the job. Fewer incidents, fewer complaints.",
          name: "Safety Lead",
          company: "Industrial Contractor",
        },
        {
          quote:
            "The thicker options hold up when crews are handling rough materials all day.",
          name: "Site Supervisor",
          company: "Construction Team",
        },
      ],
    },
    faq: [
      {
        q: "How do I pick the right cut-resistant level?",
        a: "Start with the material risk: sharper handling generally calls for higher cut levels. If you're unsure, choose a mid-range cut option and adjust based on tear/incident feedback from crews.",
      },
      {
        q: "Do disposable nitrile gloves make sense for industrial work?",
        a: "Yes—thicker disposable nitrile can be great for oily or dirty tasks, but for abrasion-heavy handling you may want dedicated work gloves designed for that environment.",
      },
      {
        q: "What's the best glove for oily environments?",
        a: "Look for oil-resistant materials and strong grip textures. Thickness and surface texture make a big difference when everything is slick.",
      },
      {
        q: "Can we get contractor pricing for multiple job sites?",
        a: "Yes. Request contractor pricing and include your monthly case volume and job site count so we can recommend a standard SKU set.",
      },
    ],
  },

  automotive: {
    slug: "automotive",
    label: "Automotive & Mechanical",
    navLabel: "Automotive",
    seo: {
      title: "Automotive Gloves | Oil-Resistant, High-Grip Nitrile | GloveCubs",
      description:
        "Mechanic-grade gloves built for grease and torque. Shop thick nitrile, textured grip, and shop-standard options with bulk pricing by the case.",
    },
    hero: {
      headline: "Grip. Oil Resistance. Zero Slips.",
      subheadline:
        "Built for grease, torque, and long days in the bay. Thick nitrile options that hold up under real shop work.",
      ctaPrimary: { label: "Shop Mechanic Gloves", href: "#shop" },
      ctaSecondary: { label: "Get Shop Pricing", href: "/bulk-pricing?industry=automotive" },
      heroImage: {
        src: "/images/industries/automotive-hero.jpg",
        alt: "Auto mechanic wearing black nitrile gloves working on an engine",
      },
      overlayStyle: "gradient",
    },
    highlights: [
      {
        title: "Shop-Grade Thickness",
        body: "Choose thicker options that survive greasy work without constant swapping.",
        icon: "layers",
      },
      {
        title: "Textured Grip That Holds",
        body: "Grip-forward textures help when everything is slick and moving fast.",
        icon: "hand",
      },
      {
        title: "Standardize Your Bay",
        body: "Lock in a few go-to SKUs for the whole team—case pricing and shop bundles.",
        icon: "wrench",
      },
    ],
    complianceBadges: [
      {
        label: "Oil-Resistant Options",
        tooltip: "Grip + material selection matters most for greasy environments.",
        icon: "badge",
      },
      {
        label: "Thick Nitrile Picks",
        tooltip: "Many shops prefer 6–10 mil for durability and fewer blowouts.",
        icon: "badge",
      },
      {
        label: "Textured Grip",
        tooltip: "Better control when handling tools and parts.",
        icon: "badge",
      },
    ],
    productFilter: {
      industryTag: "automotive",
      defaults: {
        gloveType: "nitrile",
        powderFree: true,
        texturedGrip: true,
        oilResistant: true,
        thicknessMilMin: 6,
        thicknessMilMax: 10,
        blackColorPreferred: true,
      },
      quickChips: [
        { label: "Best Sellers", params: { sort: "bestsellers" } },
        { label: "6–8 mil (Standard)", params: { thickness: "6-8" } },
        { label: "8–10 mil (Heavy)", params: { thickness: "8-10" } },
        { label: "Black Nitrile", params: { color: "black", gloveType: "nitrile" } },
        { label: "Max Grip", params: { texturedGrip: true } },
      ],
    },
    proof: {
      stats: [
        { label: "Built For", value: "Repair Shops • Quick Lube • Fleet" },
        { label: "Most Popular", value: "Black Nitrile • 6–10 mil" },
        { label: "Ordering", value: "Case & Shop Pricing" },
      ],
      testimonials: [
        {
          quote:
            "Once we went thicker, the team stopped complaining about tearing gloves every other job.",
          name: "Shop Owner",
          company: "Auto Repair",
        },
        {
          quote:
            "Grip is the difference. Textured black nitrile is our default now.",
          name: "Lead Tech",
          company: "Fleet Maintenance",
        },
      ],
    },
    faq: [
      {
        q: "What thickness do most shops use?",
        a: "Many shops standardize on 6–8 mil for everyday work and keep 8–10 mil on hand for heavy grease, tougher jobs, or longer wear time.",
      },
      {
        q: "Why is black nitrile so common in automotive?",
        a: "It hides grease and looks cleaner in a shop environment. More importantly, it's commonly available in thicker, grippy options that techs prefer.",
      },
      {
        q: "Are powder-free gloves better for mechanics?",
        a: "Powder-free is usually preferred because it's less messy and more comfortable during long wear—especially when switching gloves frequently.",
      },
      {
        q: "Can I get bulk pricing for multiple bays or locations?",
        a: "Yes. Request shop pricing and include your monthly case volume and how many techs you're outfitting so we can recommend a standard set.",
      },
    ],
  },
};

export const industrySlugs: IndustrySlug[] = [
  "medical",
  "janitorial",
  "food-service",
  "industrial",
  "automotive",
];

// Helpful for nav dropdowns / linking
export const industryNavItems = industrySlugs.map((slug) => ({
  slug,
  label: industries[slug].navLabel,
  href: `/industries/${slug}`,
}));

// Utility: safe getter (optional)
export function getIndustryConfig(slug: string): IndustryConfig | null {
  if (!slug) return null;
  return (industries as any)[slug] ?? null;
}
