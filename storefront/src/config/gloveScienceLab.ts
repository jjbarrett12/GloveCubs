/**
 * Static educational data for the homepage "Science behind the glove" lab.
 * Directional guidance only — not lab-certified or SKU-specific scores.
 */

export type LabMode = "disposable" | "reusable";
export type PerfLevel = 0 | 1 | 2;

export const PERF_LEVEL_LABELS = ["Low", "Medium", "High"] as const;

/* ─── Disposable ─── */

export type DispMaterial = "nitrile" | "vinyl" | "poly" | "synthetic-blended";
export type DispThickness = 3 | 4 | 5 | 6 | 8;
export type DispTexture = "smooth" | "fingertip" | "full";
export type DispCuff = "standard" | "extended";
export type DispTask = "food-prep" | "cleaning" | "assembly" | "chemical" | "exam";
export type DispGloveClass =
  | "exam-medical"
  | "food-service"
  | "industrial"
  | "chemo-rated"
  | "general-purpose";

export type DisposableState = {
  material: DispMaterial;
  thickness: DispThickness;
  texture: DispTexture;
  cuff: DispCuff;
  task: DispTask;
  gloveClass: DispGloveClass;
};

export const DISP_DEFAULT: DisposableState = {
  material: "nitrile",
  thickness: 5,
  texture: "fingertip",
  cuff: "standard",
  task: "food-prep",
  gloveClass: "food-service",
};

export const DISP_MATERIALS: {
  id: DispMaterial;
  label: string;
  color: string;
  traits: string[];
}[] = [
  {
    id: "nitrile",
    label: "Nitrile",
    color: "#3b82f6",
    traits: ["Strong barrier", "Chemical resistant", "Food-safe options", "Latex-free"],
  },
  {
    id: "vinyl",
    label: "Vinyl",
    color: "#a855f7",
    traits: ["Cost-effective", "Good for short tasks", "Light duty", "Not for harsh chemicals"],
  },
  {
    id: "poly",
    label: "Poly",
    color: "#22c55e",
    traits: ["Lightweight", "Economical", "Short-duration tasks", "Limited chemical holdout"],
  },
  {
    id: "synthetic-blended",
    label: "Synthetic / blended",
    color: "#f59e0b",
    traits: ["Value-oriented", "Mixed polymer performance", "General barrier", "Verify blend on SKU"],
  },
];

export const DISP_THICKNESS_GUIDE: {
  mil: DispThickness;
  tagline: string;
  duty: string;
  highlight?: boolean;
}[] = [
  { mil: 3, tagline: "Max dexterity", duty: "Light duty" },
  { mil: 4, tagline: "Balanced", duty: "General use" },
  { mil: 5, tagline: "Best balance", duty: "Most popular", highlight: true },
  { mil: 6, tagline: "More protection", duty: "Less dexterity" },
  { mil: 8, tagline: "Max protection", duty: "Heavy duty" },
];

export const DISP_TEXTURE_GUIDE: {
  id: DispTexture;
  label: string;
  grip: string;
  dexterity: string;
}[] = [
  { id: "smooth", label: "Smooth", grip: "Light grip", dexterity: "Max dexterity" },
  { id: "fingertip", label: "Fingertip", grip: "Balanced grip", dexterity: "Wet / dry" },
  { id: "full", label: "Fully textured", grip: "Max grip", dexterity: "Wet / oily" },
];

export const DISP_PERF = [
  { key: "barrier", label: "Barrier protection" },
  { key: "dexterity", label: "Dexterity" },
  { key: "chemical", label: "Chemical holdout" },
  { key: "puncture", label: "Puncture resistance" },
  { key: "comfort", label: "Comfort" },
  { key: "cost", label: "Cost $$$" },
] as const;

/* ─── Lab industry context (presentation only) ─── */

export type LabIndustry =
  | "general"
  | "healthcare"
  | "foodservice"
  | "janitorial"
  | "automotive"
  | "warehouse"
  | "industrial";

export const LAB_INDUSTRY_DEFAULT: LabIndustry = "general";

export const LAB_INDUSTRY_OPTIONS = [
  { id: "general", label: "General" },
  { id: "healthcare", label: "Healthcare" },
  { id: "foodservice", label: "Foodservice" },
  { id: "janitorial", label: "Cleaning / Janitorial" },
  { id: "automotive", label: "Automotive" },
  { id: "warehouse", label: "Warehouse" },
  { id: "industrial", label: "Industrial" },
] as const;

export type LabIndustryContext = {
  title: string;
  description: string;
  visual: string;
};

export const LAB_INDUSTRY_CONTEXTS: Record<LabIndustry, LabIndustryContext> = {
  general: {
    title: "General application",
    description:
      "Use this view when you are comparing glove profiles across mixed tasks, teams, or facilities.",
    visual: "/images/education/glove-science/industry/general.webp",
  },
  healthcare: {
    title: "Healthcare application",
    description:
      "Exam use, patient care, labs, cleaning, and biohazard-adjacent tasks where fit, compliance, and frequent changes matter.",
    visual: "/images/education/glove-science/industry/healthcare.webp",
  },
  foodservice: {
    title: "Foodservice application",
    description:
      "Food prep, handling, sanitation, and cross-contamination control where comfort, color, grip, and change frequency matter.",
    visual: "/images/education/glove-science/industry/foodservice.webp",
  },
  janitorial: {
    title: "Cleaning / janitorial application",
    description:
      "Sanitation, wet work, degreasers, chemicals, trash handling, and repeated glove changes across facilities.",
    visual: "/images/education/glove-science/industry/janitorial.webp",
  },
  automotive: {
    title: "Automotive application",
    description:
      "Oils, grease, tools, parts handling, solvents, abrasion, and longer wear periods where grip and durability matter.",
    visual: "/images/education/glove-science/industry/automotive.webp",
  },
  warehouse: {
    title: "Warehouse application",
    description:
      "Picking, packing, cardboard, pallets, equipment handling, and repetitive tasks where grip, durability, and dexterity matter.",
    visual: "/images/education/glove-science/industry/warehouse.webp",
  },
  industrial: {
    title: "Industrial application",
    description:
      "Maintenance, assembly, rough materials, machinery-adjacent tasks, and higher-abrasion environments where task-specific protection matters.",
    visual: "/images/education/glove-science/industry/industrial.webp",
  },
};

export const DISP_GLOVE_CLASSES_BY_MATERIAL: Record<DispMaterial, { id: DispGloveClass; label: string }[]> = {
  nitrile: [
    { id: "exam-medical", label: "Exam / medical" },
    { id: "food-service", label: "Food service" },
    { id: "industrial", label: "Industrial" },
    { id: "chemo-rated", label: "Chemo-rated (verify SKU)" },
  ],
  vinyl: [
    { id: "general-purpose", label: "General purpose" },
    { id: "food-service", label: "Food service" },
  ],
  poly: [
    { id: "food-service", label: "Food service / light duty" },
    { id: "general-purpose", label: "General purpose" },
  ],
  "synthetic-blended": [
    { id: "general-purpose", label: "General purpose" },
    { id: "industrial", label: "Industrial" },
    { id: "food-service", label: "Food service (verify SKU)" },
  ],
};

export const DISP_BOTTOM = [
  {
    icon: "thickness" as const,
    title: "Thickness is not everything.",
    body: "Thicker gloves may improve barrier time but can reduce dexterity, comfort, and productivity.",
  },
  {
    icon: "material" as const,
    title: "Material changes the job fit.",
    body: "Nitrile, vinyl, poly, and synthetic blends are engineered for different environments and risks.",
  },
  {
    icon: "cost" as const,
    title: "Cost per use beats unit price.",
    body: "The right glove reduces waste, changes, failures, and rework across your operation.",
  },
];

/* ─── Reusable ─── */

export type ReuseCategory = "leather" | "dipped" | "cotton" | "knit-cut";
export type DippedCoating = "nitrile" | "latex" | "pu" | "pvc" | "foam-nitrile";
export type KnitShell = "hppe" | "nylon" | "polyester" | "aramid-blend";
export type CutLevel = "A1" | "A2" | "A3" | "A4" | "A5";
export type ReuseTexture = "smooth-coat" | "microfoam" | "sandy" | "uncoated";
export type GripEnv = "dry" | "wet" | "oil" | "abrasion";
export type ReuseTask = "construction" | "warehouse" | "automotive" | "manufacturing" | "oil-gas" | "agriculture";
export type ReuseCuff = "knit-wrist" | "safety-cuff" | "gauntlet";

export type ReusableState = {
  category: ReuseCategory;
  dippedCoating: DippedCoating;
  knitShell: KnitShell;
  cutLevel: CutLevel;
  texture: ReuseTexture;
  gripEnv: GripEnv;
  task: ReuseTask;
  cuff: ReuseCuff;
};

export const REUSE_CUFF_OPTIONS: { id: ReuseCuff; label: string }[] = [
  { id: "knit-wrist", label: "Knit wrist" },
  { id: "safety-cuff", label: "Safety cuff" },
  { id: "gauntlet", label: "Gauntlet" },
];

export const REUSE_DEFAULT: ReusableState = {
  category: "leather",
  dippedCoating: "nitrile",
  knitShell: "hppe",
  cutLevel: "A3",
  texture: "uncoated",
  gripEnv: "abrasion",
  task: "construction",
  cuff: "safety-cuff",
};

export const REUSE_CATEGORIES: {
  id: ReuseCategory;
  label: string;
  description: string;
}[] = [
  { id: "leather", label: "Leather", description: "Drivers, rigging, abrasion-heavy work" },
  { id: "dipped", label: "Dipped / coated", description: "Nitrile, latex, PU, PVC on knit or jersey liner" },
  { id: "cotton", label: "Cotton / canvas", description: "General work, liners, light abrasion" },
  { id: "knit-cut", label: "Knit / cut-resistant", description: "HPPE, nylon, aramid — ANSI A1–A5" },
];

export const REUSE_CUT_GUIDE: {
  level: CutLevel;
  grams: string;
  taskFit: string;
}[] = [
  { level: "A1", grams: "~200 g", taskFit: "Light handling, minimal cut hazard" },
  { level: "A2", grams: "~500 g", taskFit: "Warehouse, packaging, general material handling" },
  { level: "A3", grams: "~1000 g", taskFit: "Metal handling, assembly with moderate cut risk" },
  { level: "A4", grams: "~1500 g", taskFit: "Sharp sheet, glass, stamping — higher cut exposure" },
  { level: "A5", grams: "~2200+ g", taskFit: "Heavy cut hazard — confirm dexterity tradeoff" },
];

export const REUSE_TEXTURE_GUIDE: {
  id: ReuseTexture;
  label: string;
  grip: string;
  environments: string;
}[] = [
  { id: "smooth-coat", label: "Smooth coat", grip: "Dry grip", environments: "Assembly, dry handling" },
  { id: "microfoam", label: "Microfoam", grip: "Balanced wet/dry", environments: "Oily parts, general industrial" },
  { id: "sandy", label: "Sandy / crinkle", grip: "Max grip", environments: "Wet, oily, outdoor" },
  { id: "uncoated", label: "Uncoated / leather", grip: "Natural feel", environments: "Drivers, rigging, heat" },
];

export const REUSE_PERF = [
  { key: "cut", label: "Cut protection" },
  { key: "abrasion", label: "Abrasion resistance" },
  { key: "grip", label: "Grip security" },
  { key: "dexterity", label: "Dexterity" },
  { key: "wetOil", label: "Oil / wet handling" },
  { key: "durability", label: "Durability" },
] as const;

export const REUSE_BOTTOM = [
  {
    icon: "cut" as const,
    title: "Cut level must match the hazard.",
    body: "ANSI A1–A5 ratings reflect standardized cut testing — higher is not always better if dexterity suffers.",
  },
  {
    icon: "coating" as const,
    title: "Coating changes grip and durability.",
    body: "Dipped nitrile, latex, PU, and PVC perform differently in dry, wet, oily, and abrasive environments.",
  },
  {
    icon: "durability" as const,
    title: "Durability changes total cost.",
    body: "Reusable gloves should be evaluated by lifespan, failure rate, comfort, and worker acceptance.",
  },
];

export const REUSE_VISUALS: Record<ReuseCategory, string> = {
  leather: "/images/education/glove-science/reusable/leather.webp",
  dipped: "/images/education/glove-science/reusable/dipped.webp",
  cotton: "/images/education/glove-science/reusable/cotton.webp",
  "knit-cut": "/images/education/glove-science/reusable/knit-cut.webp",
};

export const DISP_VISUALS: Record<DispMaterial, string> = {
  nitrile: "/images/education/glove-science/materials/nitrile.webp",
  vinyl: "/images/education/glove-science/materials/vinyl.webp",
  poly: "/images/education/glove-science/materials/poly.webp",
  "synthetic-blended": "/images/education/glove-science/materials/synthetic-blended.webp",
};

export const SCIENCE_DISCLAIMER =
  "Educational guidance only. Confirm final glove selection against published SKU specifications, SDS requirements, and your organization's safety policies.";

export const SCIENCE_PERF_FOOTNOTE =
  "Typical directional ratings — validate against specific chemicals, tasks, and published ASTM / ANSI test data on each SKU.";

export const TRUST_CARDS = [
  {
    title: "Evidence-based guidance",
    body: "Performance tradeoffs based on real-world use patterns and material science.",
  },
  {
    title: "Built for procurement",
    body: "Compare what matters: protection, dexterity, durability, and cost per use.",
  },
  {
    title: "Safer standardization",
    body: "Make informed decisions that protect people and control total cost.",
  },
] as const;

/** Homepage science lab header — aligned with marketing mockup. */
export const SCIENCE_HEADER_VALUES = [
  {
    title: "Smarter Choices",
    body: "Match glove performance to real workplace demands.",
  },
  {
    title: "Better Outcomes",
    body: "Improve safety, comfort, and productivity.",
  },
  {
    title: "Lower True Cost",
    body: "Compare cost-per-use, not just unit price.",
  },
] as const;

export type ScienceJobContext =
  | "construction"
  | "cleaning-janitorial"
  | "automotive"
  | "warehouse"
  | "manufacturing"
  | "chemical-handling";

export const SCIENCE_JOB_DEFAULT: ScienceJobContext = "construction";

export const SCIENCE_JOB_OPTIONS: {
  id: ScienceJobContext;
  label: string;
  rfqIndustry: string;
  disposableTask: DispTask;
  reuseTask: ReuseTask;
  reusePreset: Partial<ReusableState>;
  disposablePreset: Partial<DisposableState>;
}[] = [
  {
    id: "construction",
    label: "Construction",
    rfqIndustry: "construction",
    disposableTask: "assembly",
    reuseTask: "construction",
    reusePreset: { category: "leather", texture: "uncoated", gripEnv: "abrasion", cutLevel: "A3", cuff: "safety-cuff" },
    disposablePreset: { material: "nitrile", thickness: 6, texture: "full", gloveClass: "industrial", task: "assembly" },
  },
  {
    id: "cleaning-janitorial",
    label: "Cleaning / Janitorial",
    rfqIndustry: "janitorial",
    disposableTask: "cleaning",
    reuseTask: "warehouse",
    reusePreset: {
      category: "dipped",
      dippedCoating: "nitrile",
      texture: "microfoam",
      gripEnv: "wet",
      cutLevel: "A2",
      cuff: "knit-wrist",
    },
    disposablePreset: { material: "nitrile", thickness: 5, texture: "fingertip", gloveClass: "industrial", task: "cleaning" },
  },
  {
    id: "automotive",
    label: "Automotive",
    rfqIndustry: "automotive",
    disposableTask: "assembly",
    reuseTask: "automotive",
    reusePreset: {
      category: "dipped",
      dippedCoating: "foam-nitrile",
      texture: "sandy",
      gripEnv: "oil",
      cutLevel: "A3",
      cuff: "safety-cuff",
    },
    disposablePreset: { material: "nitrile", thickness: 6, texture: "full", gloveClass: "industrial", task: "assembly" },
  },
  {
    id: "warehouse",
    label: "Warehouse / Material Handling",
    rfqIndustry: "warehousing_logistics",
    disposableTask: "assembly",
    reuseTask: "warehouse",
    reusePreset: {
      category: "knit-cut",
      knitShell: "hppe",
      texture: "microfoam",
      gripEnv: "dry",
      cutLevel: "A2",
      cuff: "knit-wrist",
    },
    disposablePreset: { material: "nitrile", thickness: 5, texture: "fingertip", gloveClass: "general-purpose", task: "assembly" },
  },
  {
    id: "manufacturing",
    label: "Manufacturing / Industrial",
    rfqIndustry: "industrial",
    disposableTask: "assembly",
    reuseTask: "manufacturing",
    reusePreset: {
      category: "knit-cut",
      knitShell: "hppe",
      texture: "microfoam",
      gripEnv: "oil",
      cutLevel: "A4",
      cuff: "safety-cuff",
    },
    disposablePreset: { material: "nitrile", thickness: 6, texture: "full", gloveClass: "industrial", task: "assembly" },
  },
  {
    id: "chemical-handling",
    label: "Chemical Handling",
    rfqIndustry: "chemical_processing",
    disposableTask: "chemical",
    reuseTask: "oil-gas",
    reusePreset: {
      category: "dipped",
      dippedCoating: "nitrile",
      texture: "smooth-coat",
      gripEnv: "dry",
      cutLevel: "A3",
      cuff: "gauntlet",
    },
    disposablePreset: { material: "nitrile", thickness: 8, texture: "full", gloveClass: "chemo-rated", task: "chemical" },
  },
];

export const SCIENCE_MOCKUP_PERF = [
  { key: "grip", label: "Grip" },
  { key: "abrasion", label: "Abrasion Resistance" },
  { key: "chemical", label: "Chemical Resistance" },
  { key: "cut", label: "Cut Protection" },
  { key: "comfort", label: "Comfort" },
  { key: "costPerUse", label: "Cost-per-use" },
] as const;

export type ScienceMockupPerfKey = (typeof SCIENCE_MOCKUP_PERF)[number]["key"];

export const SCIENCE_LEARN_GUIDES = [
  {
    title: "Material Guide",
    body: "Understand materials and when to use each.",
    href: "/glove-science/nitrile-vs-vinyl-vs-latex",
  },
  {
    title: "Coating Guide",
    body: "Compare coatings and their real-world performance.",
    href: "/glove-science/ansi-cut-resistance-explained",
  },
  {
    title: "Grip Guide",
    body: "Match grip textures to your working conditions.",
    href: "/glove-science/glove-texture-science",
  },
  {
    title: "Cost-per-use Trap",
    body: "Avoid hidden costs and false savings.",
    href: "/glove-science/why-gloves-fail",
  },
] as const;

export const SCIENCE_REUSABLE_DISCLAIMER =
  "Reusable filters: coating, liner, grip finish, cuff style, cut level, washability — not exam grade.";

export function getScienceJobOption(id: ScienceJobContext) {
  return SCIENCE_JOB_OPTIONS.find((j) => j.id === id) ?? SCIENCE_JOB_OPTIONS[0]!;
}

export function applyScienceJobPreset(
  job: ScienceJobContext,
  mode: LabMode
): { disposable: DisposableState; reusable: ReusableState } {
  const opt = getScienceJobOption(job);
  return {
    disposable: {
      ...DISP_DEFAULT,
      ...opt.disposablePreset,
      task: opt.disposableTask,
      gloveClass:
        opt.disposablePreset.gloveClass ??
        defaultGloveClassForMaterial(opt.disposablePreset.material ?? DISP_DEFAULT.material),
    },
    reusable: {
      ...REUSE_DEFAULT,
      ...opt.reusePreset,
      task: opt.reuseTask,
    },
  };
}

export function mapDisposableToMockupPerf(
  performance: ReturnType<typeof deriveDisposableProfile>["performance"],
  texture: DispTexture
): Record<ScienceMockupPerfKey, PerfLevel> {
  const gripBonus = texture === "full" ? 1 : texture === "fingertip" ? 0 : -1;
  return {
    grip: clampLevel(performance.dexterity + gripBonus),
    abrasion: performance.barrier,
    chemical: performance.chemical,
    cut: performance.puncture,
    comfort: performance.comfort,
    costPerUse: performance.cost,
  };
}

export function mapReusableToMockupPerf(
  performance: ReturnType<typeof deriveReusableProfile>["performance"]
): Record<ScienceMockupPerfKey, PerfLevel> {
  return {
    grip: performance.grip,
    abrasion: performance.abrasion,
    chemical: clampLevel(Math.round((performance.wetOil + performance.durability) / 2)),
    cut: performance.cut,
    comfort: performance.dexterity,
    costPerUse: clampLevel(2 - performance.durability),
  };
}

function clampLevel(v: number): PerfLevel {
  return Math.max(0, Math.min(2, Math.round(v))) as PerfLevel;
}

export function defaultGloveClassForMaterial(material: DispMaterial): DispGloveClass {
  return DISP_GLOVE_CLASSES_BY_MATERIAL[material][0]?.id ?? "general-purpose";
}

export function deriveDisposableProfile(s: DisposableState) {
  const matBase: Record<(typeof DISP_PERF)[number]["key"], number> = {
    nitrile: { barrier: 2, dexterity: 1, chemical: 2, puncture: 2, comfort: 1, cost: 1 },
    vinyl: { barrier: 1, dexterity: 1, chemical: 0, puncture: 0, comfort: 2, cost: 2 },
    poly: { barrier: 0, dexterity: 2, chemical: 0, puncture: 0, comfort: 2, cost: 2 },
    "synthetic-blended": { barrier: 1, dexterity: 1, chemical: 1, puncture: 1, comfort: 1, cost: 2 },
  }[s.material];

  const thickMod =
    s.thickness <= 4
      ? { barrier: -1, dexterity: 1, puncture: -1 }
      : s.thickness >= 8
        ? { barrier: 2, dexterity: -2, puncture: 1 }
        : s.thickness === 6
          ? { barrier: 1, dexterity: -1 }
          : { barrier: 0, dexterity: 0 };

  const texMod =
    s.texture === "smooth"
      ? { dexterity: 1, puncture: -1 }
      : s.texture === "full"
        ? { dexterity: -1, puncture: 1, grip: 0 }
        : { dexterity: 0 };

  const classMod =
    s.gloveClass === "chemo-rated"
      ? { chemical: 2, barrier: 1 }
      : s.gloveClass === "exam-medical"
        ? { barrier: 1, dexterity: 1 }
        : s.gloveClass === "industrial"
          ? { barrier: 1, puncture: 1 }
          : {};

  const taskMod =
    s.task === "chemical"
      ? { chemical: 2, barrier: 1, dexterity: -1 }
      : s.task === "food-prep" || s.task === "exam"
        ? { dexterity: 1, chemical: -1 }
        : s.task === "cleaning"
          ? { chemical: 1, barrier: 1 }
          : { dexterity: 1 };

  const performance = DISP_PERF.reduce(
    (acc, { key }) => {
      acc[key] = clampLevel(
        (matBase[key] ?? 1) +
          (thickMod[key as keyof typeof thickMod] ?? 0) +
          (texMod[key as keyof typeof texMod] ?? 0) +
          (classMod[key as keyof typeof classMod] ?? 0) +
          (taskMod[key as keyof typeof taskMod] ?? 0)
      );
      return acc;
    },
    {} as Record<(typeof DISP_PERF)[number]["key"], PerfLevel>
  );

  const materialMeta = DISP_MATERIALS.find((m) => m.id === s.material)!;
  const texLabel = DISP_TEXTURE_GUIDE.find((t) => t.id === s.texture)!.label;
  const cuffLabel = s.cuff === "extended" ? "Extended cuff" : "Standard cuff";
  const classLabel = DISP_GLOVE_CLASSES_BY_MATERIAL[s.material].find((c) => c.id === s.gloveClass)?.label ?? s.gloveClass;

  const takeaways: Record<DispTask, { best: string; watch: string; note: string }> = {
    "food-prep": {
      best: "Food prep, light cleaning, assembly, handling, frequent changes",
      watch: "Solvent exposure, sharp edges, heavy abrasion, high heat",
      note: "Do not compare gloves by unit price alone. Model cost per use and task fit.",
    },
    cleaning: {
      best: "Sanitation, disinfecting, wet work with frequent changes",
      watch: "Long solvent contact without verifying published SKU compatibility",
      note: "Standardize thickness per contract type so crews and procurement share one spec truth.",
    },
    assembly: {
      best: "Precision handling, tool work, moderate barrier needs",
      watch: "Heavy oils, abrasion, tasks needing mechanical glove class",
      note: "Match mil to task tier so reorders do not drift across shifts.",
    },
    chemical: {
      best: "Intermittent chemical contact with published compatibility review",
      watch: "Assuming any disposable covers all solvent classes",
      note: "Validate polymer and thickness against SDS and published SKU attributes.",
    },
    exam: {
      best: "Patient contact, exams, procedures requiring tactile sensitivity",
      watch: "Chemotherapy or hazardous drug handling without chemo-rated SKU proof",
      note: "Confirm exam-grade claims and powder-free status on each listing.",
    },
  };

  const t = takeaways[s.task];
  const taskLabel = s.task.replace("-", " ");

  return {
    profileTitle: `${materialMeta.label} · ${s.thickness} mil`,
    profileSubtitle: `${texLabel} · ${cuffLabel}`,
    summary: `Balanced protection and dexterity for ${taskLabel} and light industrial tasks—directional guidance only.`,
    performance,
    takeaway: t,
    classLabel,
    visual: DISP_VISUALS[s.material],
  };
}

export function deriveReusableProfile(s: ReusableState) {
  const cutIndex = { A1: 0, A2: 1, A3: 2, A4: 3, A5: 4 }[s.cutLevel];

  const catMod =
    s.category === "leather"
      ? { abrasion: 2, durability: 2, cut: 0, dexterity: 0 }
      : s.category === "cotton"
        ? { comfort: 1, abrasion: 0, cut: -1 }
        : s.category === "dipped"
          ? { grip: 1, wetOil: 1 }
          : { cut: 1, dexterity: 0 };

  const coatMod =
    s.category === "dipped"
      ? s.dippedCoating === "nitrile" || s.dippedCoating === "foam-nitrile"
        ? { grip: 2, wetOil: 2, durability: 1 }
        : s.dippedCoating === "latex"
          ? { grip: 1, dexterity: 1 }
          : s.dippedCoating === "pu"
            ? { dexterity: 2, grip: 0 }
            : { wetOil: 1, durability: 1 }
      : {};

  const shellMod =
    s.category === "knit-cut"
      ? s.knitShell === "hppe"
        ? { cut: 2, abrasion: 1 }
        : s.knitShell === "aramid-blend"
          ? { cut: 2, abrasion: 2 }
          : { dexterity: 1 }
      : {};

  const texMod =
    s.texture === "sandy"
      ? { grip: 2, wetOil: 1 }
      : s.texture === "microfoam"
        ? { grip: 1, wetOil: 1 }
        : s.texture === "smooth-coat"
          ? { dexterity: 1 }
          : { dexterity: 1, grip: 0 };

  const gripMod =
    s.gripEnv === "oil"
      ? { wetOil: 2, grip: 1 }
      : s.gripEnv === "wet"
        ? { wetOil: 1, grip: 1 }
        : s.gripEnv === "abrasion"
          ? { abrasion: 2, durability: 1 }
          : { grip: 0 };

  const cuffMod =
    s.cuff === "gauntlet"
      ? { wetOil: 1, durability: 1 }
      : s.cuff === "knit-wrist"
        ? { dexterity: 1 }
        : { abrasion: 1 };

  const cutMod = {
    cut: s.category === "knit-cut" ? (cutIndex >= 3 ? 2 : cutIndex >= 2 ? 1 : 0) : cutIndex >= 2 ? 1 : 0,
    dexterity: cutIndex >= 4 ? -2 : cutIndex >= 3 ? -1 : 0,
  };

  const performance = REUSE_PERF.reduce(
    (acc, { key }) => {
      const base = key === "cut" && s.category !== "knit-cut" && s.category !== "leather" ? 0 : 1;
      acc[key] = clampLevel(
        base +
          (catMod[key as keyof typeof catMod] ?? 0) +
          (coatMod[key as keyof typeof coatMod] ?? 0) +
          (shellMod[key as keyof typeof shellMod] ?? 0) +
          (texMod[key as keyof typeof texMod] ?? 0) +
          (gripMod[key as keyof typeof gripMod] ?? 0) +
          (cuffMod[key as keyof typeof cuffMod] ?? 0) +
          (cutMod[key as keyof typeof cutMod] ?? 0)
      );
      return acc;
    },
    {} as Record<(typeof REUSE_PERF)[number]["key"], PerfLevel>
  );

  const catMeta = REUSE_CATEGORIES.find((c) => c.id === s.category)!;
  const texLabel = REUSE_TEXTURE_GUIDE.find((t) => t.id === s.texture)!.label;
  const cutGuide = REUSE_CUT_GUIDE.find((c) => c.level === s.cutLevel)!;

  const coatingLabel =
    s.category === "dipped"
      ? { nitrile: "Nitrile dip", latex: "Latex dip", pu: "PU dip", pvc: "PVC dip", "foam-nitrile": "Foam nitrile dip" }[
          s.dippedCoating
        ]
      : s.category === "knit-cut"
        ? { hppe: "HPPE shell", nylon: "Nylon shell", polyester: "Polyester shell", "aramid-blend": "Aramid blend shell" }[
            s.knitShell
          ]
        : catMeta.label;

  const takeaways: Record<ReuseTask, { best: string; watch: string; note: string }> = {
    construction: {
      best: "Rough handling, abrasion, and tool work in outdoor or site environments",
      watch: "Oily surfaces without compatible coating; cut level mismatch",
      note: "Confirm ANSI/EN cut ratings on published SKU—do not assume class from marketing copy.",
    },
    warehouse: {
      best: "Material handling, box work, mixed dry and occasional wet grip",
      watch: "Fine motor tasks at high cut levels without dexterity tradeoff review",
      note: "Evaluate lifespan and failure rate, not carton price alone.",
    },
    automotive: {
      best: "Shop floor, oily parts, tool handling, assembly sequences",
      watch: "Disposable substitution where cut or impact rating is required",
      note: "Pair coating to oil/wet environment—PU and nitrile behave differently.",
    },
    manufacturing: {
      best: "Handling sharp materials, oily parts, and industrial assembly environments",
      watch: "Over-specifying cut level at the cost of dexterity and throughput",
      note: "Pilot worker acceptance before fleet-wide standardization.",
    },
    "oil-gas": {
      best: "Harsh environments needing grip in oil/wet conditions and durable shells",
      watch: "Chemical compatibility beyond cut rating—verify coating and liner",
      note: "Treat reusable class as program inventory with defined inspection cycles.",
    },
    agriculture: {
      best: "Field handling, wet/dry mix, moderate abrasion and grip variability",
      watch: "Heat buildup and comfort over long wear in coated gloves",
      note: "Balance durability with breathability for seasonal task changes.",
    },
  };

  const t = takeaways[s.task];

  return {
    profileTitle: `${catMeta.label} · ${s.category === "knit-cut" ? s.cutLevel : coatingLabel}`,
    profileSubtitle: `${texLabel} · ${s.gripEnv} environment`,
    summary: `${cutGuide.taskFit} — confirm ${s.category === "knit-cut" ? "ANSI cut" : "abrasion and coating"} ratings on each SKU.`,
    performance,
    takeaway: t,
    cutGuide,
    visual: REUSE_VISUALS[s.category],
  };
}
