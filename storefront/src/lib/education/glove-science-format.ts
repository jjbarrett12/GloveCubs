import { deriveGloveEducationGuidance } from "@/config/homeAuthority";
import { SCIENCE_DISCLAIMER } from "@/config/gloveScienceLab";
import { intakeToCriteria, type ScienceHubIntake } from "@/lib/education/glove-science-intake";

export type ClassRecommendation = {
  profileTitle: string;
  material: string;
  thicknessRange: string;
  cutLevel?: string;
  texture: string;
  cuff?: string;
  useCase: string;
  rationale: string[];
  disclaimer: string;
  nextStepHref: string;
  nextStepLabel: string;
};

const INDUSTRY_PROFILE_LABEL: Record<ScienceHubIntake["industry"], string> = {
  foodservice: "Food service & prep",
  cleaning: "Cleaning & janitorial",
  healthcare: "Healthcare & exam",
  automotive: "Automotive & shop floor",
  warehouse: "Warehouse & material handling",
  industrial: "Industrial & maintenance",
  general: "General disposable barrier",
};

function thicknessRangeFor(intake: ScienceHubIntake, criteria: ReturnType<typeof intakeToCriteria>): string {
  if (criteria.thickness === "light" || criteria.dexterity === "high") {
    return criteria.chemicalExposure ? "3–4 mil" : "2–3 mil or 3–4 mil";
  }
  if (criteria.thickness === "heavy" || criteria.heavyDuty) {
    return criteria.chemicalExposure || intake.wearDuration === "extended-wear" ? "6–8 mil" : "8+ mil";
  }
  if (criteria.chemicalExposure || intake.wearDuration === "extended-wear") {
    return "6–8 mil";
  }
  return "4–5 mil";
}

function textureFor(intake: ScienceHubIntake, criteria: ReturnType<typeof intakeToCriteria>): string {
  if (criteria.texturedGrip || ["wet", "oily", "mixed"].includes(intake.environment)) {
    return "Textured or raised grip";
  }
  if (criteria.dexterity === "high" || intake.dexterity === "high") {
    return "Light texture or fingertip texture";
  }
  return "Standard texture — match to grip needs";
}

function cutLevelFor(intake: ScienceHubIntake, criteria: ReturnType<typeof intakeToCriteria>): string | undefined {
  if (intake.exposure === "cuts" || intake.exposure === "abrasion") {
    return "Consider ANSI A2–A4 depending on sharpness and task severity.";
  }
  if (criteria.heavyDuty && intake.industry !== "foodservice" && intake.exposure !== "food") {
    return "Consider ANSI A2–A4 if cut or sheet-metal hazards are present beyond disposables.";
  }
  return undefined;
}

function cuffFor(intake: ScienceHubIntake, criteria: ReturnType<typeof intakeToCriteria>): string | undefined {
  if (
    criteria.chemicalExposure ||
    intake.exposure === "biohazard" ||
    intake.wearDuration === "extended-wear"
  ) {
    return "Extended cuff worth considering";
  }
  return undefined;
}

function buildUseCase(intake: ScienceHubIntake, derived: ReturnType<typeof deriveGloveEducationGuidance>): string {
  const industry = INDUSTRY_PROFILE_LABEL[intake.industry];
  const exposure =
    intake.exposure === "none"
      ? "general barrier tasks"
      : `${intake.exposure.replace("-", " ")} exposure`;
  return `${industry} — ${exposure}. ${derived.headline.replace(/^Directional guidance for /i, "")}.`;
}

export function formatClassRecommendation(intake: ScienceHubIntake): ClassRecommendation {
  const criteria = intakeToCriteria(intake);
  const derived = deriveGloveEducationGuidance(criteria);

  const material = derived.materials.length > 0 ? derived.materials.join(" · ") : "Nitrile or vinyl (latex-free)";
  const thicknessRange = thicknessRangeFor(intake, criteria);
  const texture = textureFor(intake, criteria);
  const cutLevel = cutLevelFor(intake, criteria);
  const cuff = cuffFor(intake, criteria);

  const profileTitle = `${INDUSTRY_PROFILE_LABEL[intake.industry]} profile`;

  return {
    profileTitle,
    material,
    thicknessRange,
    cutLevel,
    texture,
    cuff,
    useCase: buildUseCase(intake, derived),
    rationale: derived.guidance.slice(0, 5),
    disclaimer: `${SCIENCE_DISCLAIMER} ${derived.procurementNote}`,
    nextStepHref: "/glove-finder",
    nextStepLabel: "Find matching gloves",
  };
}
