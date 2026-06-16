/** Survey intake state for the home glove education hub — shared by UI and catalog matching. */
export type SurveyIntakeState = {
  industry: string;
  task: string;
  exposureRisks: string[];
  dexterity: "standard" | "high";
  thickness: "light" | "standard" | "heavy";
  foodSafe: boolean;
  chemicalExposure: boolean;
  wearDuration: "short" | "extended";
  powderFree: boolean;
  programPriority: "value" | "durability";
};

export const DEFAULT_SURVEY_INTAKE: SurveyIntakeState = {
  industry: "/industries/hospitality",
  task: "food-handling",
  exposureRisks: ["wet-oily"],
  dexterity: "high",
  thickness: "standard",
  foodSafe: true,
  chemicalExposure: false,
  wearDuration: "short",
  powderFree: true,
  programPriority: "durability",
};
