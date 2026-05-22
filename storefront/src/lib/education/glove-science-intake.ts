import type { GloveEducationCriteria } from "@/config/homeAuthority";

export type ScienceHubIndustry =
  | "foodservice"
  | "cleaning"
  | "healthcare"
  | "automotive"
  | "warehouse"
  | "industrial"
  | "general";

export type ScienceHubExposure =
  | "none"
  | "food"
  | "chemicals"
  | "biohazard"
  | "oils"
  | "cuts"
  | "abrasion";

export type ScienceHubWearDuration = "quick-change" | "repeated-use" | "extended-wear";

export type ScienceHubEnvironment = "dry" | "wet" | "oily" | "mixed";

export type ScienceHubDexterity = "high" | "balanced" | "durability-first";

export type ScienceHubIntake = {
  industry: ScienceHubIndustry;
  exposure: ScienceHubExposure;
  wearDuration: ScienceHubWearDuration;
  environment: ScienceHubEnvironment;
  dexterity: ScienceHubDexterity;
  latexFree: boolean;
  powderFree: boolean;
};

export const DEFAULT_SCIENCE_HUB_INTAKE: ScienceHubIntake = {
  industry: "general",
  exposure: "none",
  wearDuration: "quick-change",
  environment: "dry",
  dexterity: "balanced",
  latexFree: true,
  powderFree: true,
};

const INDUSTRY_TO_CRITERIA: Record<ScienceHubIndustry, GloveEducationCriteria["industry"]> = {
  foodservice: "food-service",
  cleaning: "janitorial",
  healthcare: "healthcare",
  automotive: "industrial",
  warehouse: "industrial",
  industrial: "industrial",
  general: "industrial",
};

export function intakeToCriteria(intake: ScienceHubIntake): GloveEducationCriteria {
  const heavyDuty =
    intake.exposure === "cuts" ||
    intake.exposure === "abrasion" ||
    intake.exposure === "chemicals" ||
    intake.wearDuration === "extended-wear";

  const foodSafe = intake.exposure === "food" || intake.industry === "foodservice";

  const chemicalExposure =
    intake.exposure === "chemicals" || intake.exposure === "biohazard" || intake.exposure === "oils";

  const texturedGrip =
    intake.environment === "wet" || intake.environment === "oily" || intake.environment === "mixed";

  const thickness: GloveEducationCriteria["thickness"] =
    intake.dexterity === "durability-first" || heavyDuty
      ? "heavy"
      : intake.dexterity === "high"
        ? "light"
        : "standard";

  const dexterity: GloveEducationCriteria["dexterity"] =
    intake.dexterity === "high" ? "high" : "standard";

  return {
    industry: INDUSTRY_TO_CRITERIA[intake.industry],
    foodSafe,
    chemicalExposure,
    thickness,
    dexterity,
    latexFree: intake.latexFree,
    powderFree: intake.powderFree,
    heavyDuty,
    texturedGrip,
  };
}
