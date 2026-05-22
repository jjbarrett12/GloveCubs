export type GloveScienceArticleSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  callout?: string;
};

export type GloveScienceArticle = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  keywords: string[];
  published: boolean;
  updatedAt: string;
  readingTime: string;
  sections: GloveScienceArticleSection[];
  relatedSlugs?: string[];
};

export const GLOVE_SCIENCE_ARTICLES: GloveScienceArticle[] = [
  {
    slug: "what-does-mil-mean",
    title: "What Does Mil Mean in Gloves?",
    description:
      "Mil measures disposable glove thickness in thousandths of an inch. Learn what 2–3, 4–5, 6–7, and 8+ mil mean for dexterity, durability, and cost.",
    eyebrow: "Thickness",
    keywords: ["glove mil", "glove thickness", "mil meaning", "disposable glove thickness", "4 mil nitrile"],
    published: true,
    updatedAt: "2026-05-22",
    readingTime: "6 min read",
    relatedSlugs: ["nitrile-vs-vinyl-vs-latex", "ansi-cut-resistance-explained"],
    sections: [
      {
        heading: "What mil actually means",
        paragraphs: [
          "Mil is short for one-thousandth of an inch (0.001\"). On a disposable glove spec sheet, mil describes how thick the film is — not a brand name, color, or certification.",
          "Most nitrile, vinyl, and latex disposables are discussed in roughly 2–8 mil ranges. The number helps buyers compare barrier time, feel, and durability — but it is only one variable.",
        ],
      },
      {
        heading: "Thicker is not automatically better",
        paragraphs: [
          "A higher mil glove often lasts longer before tear-through, but it can also reduce tactile sensitivity, increase hand fatigue, and cost more per change.",
          "Teams that standardize on 8 mil everywhere frequently overbuy: prep lines may need dexterity, while wash-down tasks may need a longer barrier window.",
        ],
        callout:
          "Match mil to task length, chemical exposure, and change frequency — not to habit or supplier defaults.",
      },
      {
        heading: "Common mil ranges and when they fit",
        paragraphs: ["Use these as educational starting points. Always confirm published SKU specs and your facility policies."],
        bullets: [
          "2–3 mil: light duty, short tasks, high dexterity — quick changes, low-risk handling.",
          "4–5 mil: everyday balance — food prep, general cleaning, most high-volume disposable programs.",
          "6–7 mil: more durability — longer wear, tougher tasks, more chemical or wet work.",
          "8+ mil: heavy-duty disposable barrier — higher exposure windows, lower dexterity tradeoff.",
        ],
      },
      {
        heading: "Dexterity, fatigue, and total cost",
        paragraphs: [
          "Thicker gloves can slow fine motor work. When workers double-glove or change more often because they cannot feel the task, total cost rises even if unit price looked attractive.",
          "Cost per use — changes per shift, tear rate, and rework — usually matters more than the cheapest case price.",
        ],
      },
      {
        heading: "How to choose mil for your program",
        paragraphs: [
          "Start with the hazard and wear time: short food handling, extended cleaning with disinfectants, or oily shop work each point to different mil bands.",
          "Document a simple task → mil map so reorders do not drift. Pair mil with material (nitrile vs vinyl) and texture for wet or oily grip.",
        ],
        callout: "Use the class-level profile wizard on our glove science hub or /glove-finder when you are ready to match task to catalog listings.",
      },
    ],
  },
  {
    slug: "nitrile-vs-vinyl-vs-latex",
    title: "Nitrile vs Vinyl vs Latex Gloves",
    description:
      "Compare nitrile, vinyl, and latex disposable gloves — barrier traits, economics, allergies, and when material alone is not enough to pick the right glove.",
    eyebrow: "Materials",
    keywords: ["nitrile vs vinyl", "nitrile vs latex", "disposable glove materials", "food service gloves", "latex free gloves"],
    published: true,
    updatedAt: "2026-05-22",
    readingTime: "7 min read",
    relatedSlugs: ["what-does-mil-mean", "ansi-cut-resistance-explained"],
    sections: [
      {
        heading: "Why material matters more than color",
        paragraphs: [
          "Black, blue, or purple gloves do not define protection. Polymer type, formulation, thickness, texture, and certifications determine how a glove performs in food, medical, cleaning, or industrial tasks.",
        ],
      },
      {
        heading: "Nitrile",
        paragraphs: [
          "Nitrile is a synthetic rubber widely used for food service, healthcare, janitorial, and industrial disposables. It generally offers stronger puncture and chemical resistance than vinyl, with good stretch when formulated well.",
          "Most B2B programs standardize on latex-free nitrile when allergies or food-contact policies exclude natural rubber.",
        ],
        bullets: [
          "Strong all-around barrier for many oils, greases, and disinfectants (verify against your SDS list).",
          "Available in exam, food-service, and industrial classes — read the listing, not the color.",
          "Often the default when teams need one synthetic workhorse material.",
        ],
      },
      {
        heading: "Vinyl",
        paragraphs: [
          "Vinyl is economical and common for light-duty, short-contact tasks. It can be a fit for high-turnover programs where tasks are brief and chemical exposure is limited.",
        ],
        bullets: [
          "Lower cost per glove for low-risk handling.",
          "Less stretch and durability than nitrile — tears and changes may increase on rough work.",
          "Not a substitute for nitrile on harsh chemicals or extended wear.",
        ],
      },
      {
        heading: "Latex",
        paragraphs: [
          "Natural rubber latex offers comfort and stretch that some teams still prefer for dexterity-heavy work where latex is allowed.",
          "Allergy risk for workers and patients, plus facility latex-free policies, push many operators to nitrile or vinyl instead.",
        ],
        callout: "If latex is excluded, document nitrile or vinyl alternatives by task — not just by price.",
      },
      {
        heading: "Food service and cleaning considerations",
        paragraphs: [
          "Food programs usually require powder-free gloves acceptable for food contact per your HACCP and supplier documentation — material and compliance trump color coding.",
          "Cleaning and janitorial work often needs nitrile with adequate mil for disinfectants and wet grip; vinyl may suffice only for light, short tasks.",
        ],
      },
      {
        heading: "Material alone does not determine fit",
        paragraphs: [
          "Thickness, texture, cuff style, and certifications still decide whether a glove is appropriate. Two nitrile gloves with the same material name can perform very differently.",
          "Use task-based guidance first, then validate against published SKU attributes.",
        ],
        callout: "Try the glove profile wizard at /glove-science#finder or continue to /glove-finder for catalog-backed next steps.",
      },
    ],
  },
  {
    slug: "ansi-cut-resistance-explained",
    title: "ANSI Cut Resistance Explained",
    description:
      "ANSI cut levels (A1–A5) help compare reusable safety gloves. Learn what cut ratings mean, what they do not cover, and when disposables are not enough.",
    eyebrow: "Cut resistance",
    keywords: ["ANSI cut resistance", "cut level A3", "cut resistant gloves", "A1 A2 A3 A4 A5", "reusable work gloves"],
    published: true,
    updatedAt: "2026-05-22",
    readingTime: "7 min read",
    relatedSlugs: ["what-does-mil-mean", "nitrile-vs-vinyl-vs-latex"],
    sections: [
      {
        heading: "Cut resistance is mainly for reusable safety gloves",
        paragraphs: [
          "ANSI/ISEA cut levels describe how cut-resistant knit, coated, and mechanical gloves compare in standardized testing. They are not a rating for thin disposable nitrile or vinyl — those rely on film barrier, not cut yarn structure.",
          "If your hazard includes sharp sheet metal, glass, or blade contact, you may need a reusable cut program — not a thicker disposable alone.",
        ],
      },
      {
        heading: "What ANSI cut levels communicate",
        paragraphs: [
          "Levels A1 through A5 give buyers a shared scale for cut protection on reusable gloves. Higher levels generally indicate more cut resistance, often with tradeoffs in flexibility and cost.",
          "Published gram-force values on spec sheets should come from the manufacturer’s test data — use them to compare SKUs, not as a guarantee in your specific task.",
        ],
        bullets: [
          "A1–A2: light handling, packaging, low cut exposure.",
          "A3: moderate cut risk — metal handling, assembly with sharps nearby.",
          "A4–A5: higher cut exposure — sheet metal, glass, stamping; confirm dexterity needs.",
        ],
      },
      {
        heading: "Do not treat cut level as the only buying factor",
        paragraphs: [
          "Coating (nitrile, PU, foam), shell fiber (HPPE, aramid blends), abrasion resistance, grip in oil or water, and cuff design all affect whether a glove works on the floor.",
          "A high cut label on the wrong coating for oily parts can still feel slippery and drive glove changes.",
        ],
      },
      {
        heading: "Dexterity, coating, and task severity",
        paragraphs: [
          "Higher cut levels can reduce feel and flexibility. Operators may remove gloves or switch brands if they cannot handle small parts — creating a safety and compliance gap.",
          "Match level to actual sharp exposure, not to worst-case fear. Document exceptions for glass or metal tasks separately from general warehouse handling.",
        ],
        callout: "Cut level is one line on the spec sheet — grip, abrasion, and wear time complete the picture.",
      },
      {
        heading: "When to use reusables instead of disposables",
        paragraphs: [
          "Disposables excel at hygiene barriers, frequent changes, and fluid contact. Reusable cut gloves excel when mechanical cut hazard is real and gloves are worn for a shift on tools and materials.",
          "Many sites run both programs: nitrile disposables for contamination control, cut-rated reusables for production zones.",
        ],
        callout: "Explore thickness and task fit on /glove-science#guides, then use /glove-science#finder for a class-level profile.",
      },
    ],
  },
  {
    slug: "why-gloves-fail",
    title: "Why Gloves Fail in Real Use",
    description: "Coming soon — tear points, wrong material, and change-frequency mistakes that drive waste.",
    eyebrow: "Reliability",
    keywords: ["glove failure", "glove tears"],
    published: false,
    updatedAt: "2026-05-22",
    readingTime: "5 min read",
    sections: [],
  },
  {
    slug: "glove-texture-science",
    title: "Glove Texture and Grip Science",
    description: "Coming soon — fingertip vs full texture in wet, oily, and food prep environments.",
    eyebrow: "Texture",
    keywords: ["glove texture", "textured nitrile grip"],
    published: false,
    updatedAt: "2026-05-22",
    readingTime: "5 min read",
    sections: [],
  },
];

export function getPublishedGloveScienceArticles(): GloveScienceArticle[] {
  return GLOVE_SCIENCE_ARTICLES.filter((a) => a.published);
}

export function getGloveScienceArticleBySlug(slug: string): GloveScienceArticle | undefined {
  return GLOVE_SCIENCE_ARTICLES.find((a) => a.slug === slug);
}

export function getPublishedGloveScienceArticleBySlug(slug: string): GloveScienceArticle | undefined {
  const article = getGloveScienceArticleBySlug(slug);
  return article?.published ? article : undefined;
}
