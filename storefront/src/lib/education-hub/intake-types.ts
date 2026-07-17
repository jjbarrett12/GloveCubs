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

/** Blank intake before the shopper answers — used by the live education hub. */
export const EMPTY_SURVEY_INTAKE: SurveyIntakeState = {
  industry: "",
  task: "",
  exposureRisks: [],
  dexterity: "standard",
  thickness: "standard",
  foodSafe: false,
  chemicalExposure: false,
  wearDuration: "short",
  powderFree: false,
  programPriority: "value",
};

/** Fully populated fixture for tests and static scoring examples. */
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
