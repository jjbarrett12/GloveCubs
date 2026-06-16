import {
  type DisposableState,
  type LabMode,
  type ReusableState,
  type ScienceJobContext,
  DISP_GLOVE_CLASSES_BY_MATERIAL,
  DISP_MATERIALS,
  DISP_TEXTURE_GUIDE,
  REUSE_CATEGORIES,
  REUSE_CUT_GUIDE,
  REUSE_CUFF_OPTIONS,
  REUSE_TEXTURE_GUIDE,
  SCIENCE_MOCKUP_PERF,
  deriveDisposableProfile,
  deriveReusableProfile,
  getScienceJobOption,
  mapDisposableToMockupPerf,
  mapReusableToMockupPerf,
  PERF_LEVEL_LABELS,
} from "@/config/gloveScienceLab";
import { buildRequestPricingHref, type RequestPricingQueryParams } from "@/lib/discovery/request-pricing-url";

export type GloveScienceRfqInput = {
  mode: LabMode;
  job: ScienceJobContext;
  disposable: DisposableState;
  reusable: ReusableState;
};

function reusableMaterialLabel(s: ReusableState): string {
  if (s.category === "dipped") {
    const coat = { nitrile: "Nitrile dip", latex: "Latex dip", pu: "PU dip", pvc: "PVC dip", "foam-nitrile": "Foam nitrile dip" }[
      s.dippedCoating
    ];
    return coat;
  }
  if (s.category === "knit-cut") {
    const shell = { hppe: "HPPE shell", nylon: "Nylon shell", polyester: "Polyester shell", "aramid-blend": "Aramid blend shell" }[
      s.knitShell
    ];
    return shell;
  }
  return REUSE_CATEGORIES.find((c) => c.id === s.category)?.label ?? s.category;
}

export function buildGloveScienceRfqSpecNotes(input: GloveScienceRfqInput): string {
  const job = getScienceJobOption(input.job);
  const modeLabel = input.mode === "disposable" ? "Disposable gloves" : "Reusable (work) gloves";

  if (input.mode === "disposable") {
    const profile = deriveDisposableProfile(input.disposable);
    const mockupPerf = mapDisposableToMockupPerf(profile.performance, input.disposable.texture);
    const material = DISP_MATERIALS.find((m) => m.id === input.disposable.material)?.label ?? input.disposable.material;
    const texture = DISP_TEXTURE_GUIDE.find((t) => t.id === input.disposable.texture)?.label ?? input.disposable.texture;
    const classLabel =
      DISP_GLOVE_CLASSES_BY_MATERIAL[input.disposable.material].find((c) => c.id === input.disposable.gloveClass)?.label ??
      input.disposable.gloveClass;

    const perfLines = SCIENCE_MOCKUP_PERF.map(
      ({ key, label }) => `${label}: ${PERF_LEVEL_LABELS[mockupPerf[key]]}`
    ).join("\n");

    return [
      "Glove Science Lab — RFQ-ready spec",
      `Job context: ${job.label}`,
      `Program: ${modeLabel}`,
      "",
      "Build glove profile:",
      `Material: ${material}`,
      `Thickness: ${input.disposable.thickness} mil`,
      `Grip finish: ${texture}`,
      `Cuff: ${input.disposable.cuff === "extended" ? "Extended" : "Standard"}`,
      `Protection / class: ${classLabel}`,
      `Use pattern: ${input.disposable.task.replace("-", " ")}`,
      "",
      "Directional performance (lab guidance):",
      perfLines,
      "",
      "Buyer takeaway:",
      `Best fit: ${profile.summary}`,
      `Best for: ${profile.takeaway.best}`,
      `Watch out for: ${profile.takeaway.watch}`,
      `Procurement note: ${profile.takeaway.note}`,
    ].join("\n");
  }

  const profile = deriveReusableProfile(input.reusable);
  const mockupPerf = mapReusableToMockupPerf(profile.performance);
  const category = REUSE_CATEGORIES.find((c) => c.id === input.reusable.category)?.label ?? input.reusable.category;
  const texture = REUSE_TEXTURE_GUIDE.find((t) => t.id === input.reusable.texture)?.label ?? input.reusable.texture;
  const cuff = REUSE_CUFF_OPTIONS.find((c) => c.id === input.reusable.cuff)?.label ?? input.reusable.cuff;
  const cut = REUSE_CUT_GUIDE.find((c) => c.level === input.reusable.cutLevel)?.level ?? input.reusable.cutLevel;

  const perfLines = SCIENCE_MOCKUP_PERF.map(
    ({ key, label }) => `${label}: ${PERF_LEVEL_LABELS[mockupPerf[key]]}`
  ).join("\n");

  return [
    "Glove Science Lab — RFQ-ready spec",
    `Job context: ${job.label}`,
    `Program: ${modeLabel}`,
    "",
    "Build glove profile:",
    `Glove material / coating: ${category} · ${reusableMaterialLabel(input.reusable)}`,
    `Liner / shell: ${reusableMaterialLabel(input.reusable)}`,
    `Grip finish: ${texture}`,
    `Cuff style: ${cuff}`,
    `Protection need: ANSI cut ${cut}`,
    `Use pattern: ${input.reusable.task.replace("-", " ")} (${input.reusable.gripEnv} environment)`,
    "",
    "Directional performance (lab guidance):",
    perfLines,
    "",
    "Buyer takeaway:",
    `Best fit: ${profile.summary}`,
    `Best for: ${profile.takeaway.best}`,
    `Watch out for: ${profile.takeaway.watch}`,
    `Procurement note: ${profile.takeaway.note}`,
  ].join("\n");
}

export function buildGloveScienceRfqHref(input: GloveScienceRfqInput): string {
  const job = getScienceJobOption(input.job);
  const spec = buildGloveScienceRfqSpecNotes(input);
  const params: RequestPricingQueryParams = {
    source: "glove_science_lab",
    industry: job.rfqIndustry,
    type: input.mode === "disposable" ? "exam_disposable" : "industrial",
    product: spec,
  };

  if (input.mode === "disposable") {
    params.material = input.disposable.material;
  } else if (input.reusable.category === "dipped") {
    params.material = input.reusable.dippedCoating;
  } else if (input.reusable.category === "knit-cut") {
    params.material = input.reusable.knitShell;
  } else {
    params.material = input.reusable.category;
  }

  return buildRequestPricingHref(params);
}
