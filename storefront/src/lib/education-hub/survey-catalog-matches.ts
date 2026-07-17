import type { StoreCatalogUrlState } from "@/lib/catalog/store-filter-types";
import type { StoreProductCommercialAttrs, StoreProductRow } from "@/lib/catalog/store-products";
import {
  intakeIndustrySlug,
  scoringIndustryBucket,
  type SurveyIndustryScoringBucket,
} from "@/config/gloveEducationSurvey";
import type { SurveyIntakeState } from "@/lib/education-hub/intake-types";

export type EducationHubCatalogCandidate = {
  product: StoreProductRow;
  attrs: StoreProductCommercialAttrs;
};

const FOOD_CERT_SLUGS = ["food_safe", "fda_food_contact"] as const;

function industrySlugsForBucket(bucket: SurveyIndustryScoringBucket): string[] {
  switch (bucket) {
    case "food-service":
      return ["food_service", "food_processing"];
    case "healthcare":
      return ["healthcare", "dental", "veterinary", "laboratories", "pharmaceuticals"];
    case "janitorial":
      return ["janitorial", "sanitation"];
    case "automotive":
      return ["automotive"];
    case "industrial":
      return [
        "industrial",
        "construction",
        "warehousing_logistics",
        "metal_fabrication",
        "chemical_processing",
        "electronics_assembly",
        "agriculture",
        "oil_gas_energy",
        "landscaping_grounds",
        "cold_chain_outdoor",
      ];
    default:
      return [];
  }
}

function primaryUseForTask(task: string): string | null {
  switch (task) {
    case "food-handling":
      return "food_handling";
    case "patient-care":
      return "patient_care";
    case "cleaning":
      return "cleaning";
    case "assembly":
      return "material_handling";
    case "mechanical":
      return "mechanical_work";
    case "general-disposable":
      return "general_purpose";
    default:
      return null;
  }
}

function secondaryUsesForTask(task: string): string[] {
  switch (task) {
    case "food-handling":
      return ["food_preparation"];
    case "patient-care":
      return ["medical_exam"];
    case "cleaning":
      return ["janitorial", "sanitation"];
    case "assembly":
      return ["general_purpose"];
    case "mechanical":
      return ["grip_work", "industrial_maintenance"];
    default:
      return [];
  }
}

function attrsIncludeAny(attrs: StoreProductCommercialAttrs, key: keyof StoreProductCommercialAttrs, values: string[]): boolean {
  const bucket = attrs[key];
  return values.some((v) => bucket.includes(v));
}

function haystackForProduct(product: StoreProductRow): string {
  return [
    product.name,
    product.materialHint,
    product.commercialUseSummary,
    product.protectionHint,
    product.certificationHints.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoringStepActive(stepId: string, answeredSteps?: ReadonlySet<string>): boolean {
  return !answeredSteps || answeredSteps.has(stepId);
}

/** Score a published catalog row against survey intake (rule-based, not ML). */
export function scoreCatalogCandidate(
  candidate: EducationHubCatalogCandidate,
  intake: SurveyIntakeState,
  answeredSteps?: ReadonlySet<string>,
): number {
  const { product, attrs } = candidate;
  let score = 0;
  const haystack = haystackForProduct(product);

  if (scoringStepActive("industry", answeredSteps) && intake.industry.trim()) {
    const industrySlug = intakeIndustrySlug(intake.industry);
    const industryBucket = scoringIndustryBucket(intake.industry);
    const bucketSlugs = industrySlugsForBucket(industryBucket);

    if (attrs.industries.includes(industrySlug)) score += 4;
    else if (bucketSlugs.some((s) => attrs.industries.includes(s))) score += 3;
    else if (industryBucket === "general") score += 1;
    else score -= 2;
  }

  if (scoringStepActive("task", answeredSteps) && intake.task.trim()) {
    const primaryUse = primaryUseForTask(intake.task);
    const taskUses = [primaryUse, ...secondaryUsesForTask(intake.task)].filter(Boolean) as string[];
    if (taskUses.some((u) => attrs.uses.includes(u))) score += 3;
  }

  if (scoringStepActive("foodSafe", answeredSteps)) {
    if (intake.foodSafe) {
      if (attrsIncludeAny(attrs, "uses", ["food_handling", "food_preparation"])) score += 2;
      if (attrsIncludeAny(attrs, "certifications", [...FOOD_CERT_SLUGS])) score += 3;
      if (/food/i.test(haystack)) score += 1;
    } else if (/food handling|food preparation|food safe/i.test(haystack)) {
      score -= 2;
    }
  }

  if (scoringStepActive("chemical", answeredSteps) || scoringStepActive("exposure", answeredSteps)) {
    const hasChem =
      (scoringStepActive("chemical", answeredSteps) && intake.chemicalExposure) ||
      (scoringStepActive("exposure", answeredSteps) && intake.exposureRisks.includes("chemicals"));
    if (hasChem) {
      if (attrs.protection_tags.includes("chemical_resistant")) score += 3;
      if (/nitrile/i.test(haystack)) score += 2;
    }
  }

  if (scoringStepActive("exposure", answeredSteps)) {
    if (intake.exposureRisks.includes("wet-oily")) {
      if (attrs.protection_tags.includes("grip_enhanced") || /textur|grip|diamond/i.test(haystack)) score += 2;
    }

    if (intake.exposureRisks.includes("abrasion")) {
      if (attrs.protection_tags.includes("abrasion_enhanced") || /heavy|8 mil|industrial/i.test(haystack)) score += 2;
    }

    if (intake.exposureRisks.includes("biological")) {
      if (attrs.protection_tags.includes("viral_barrier") || attrs.protection_tags.includes("biohazard")) score += 2;
      if (/exam|medical|patient/i.test(haystack)) score += 1;
    }
  }

  if (scoringStepActive("thickness", answeredSteps)) {
    if (intake.thickness === "heavy" && /heavy|8|6–8|6 mil|8 mil/i.test(haystack)) score += 2;
    if (intake.thickness === "light" && /light|3|4 mil|vinyl/i.test(haystack)) score += 1;
  }

  if (scoringStepActive("powder", answeredSteps) && intake.powderFree && attrs.certifications.includes("powder_free")) {
    score += 2;
  }

  if (scoringStepActive("priority", answeredSteps)) {
    if (intake.programPriority === "value" && /vinyl|value|turnover/i.test(haystack)) score += 2;
    if (intake.programPriority === "durability" && /heavy|nitrile|extended|mechanic/i.test(haystack)) score += 2;
  }

  if (scoringStepActive("dexterity", answeredSteps) && intake.dexterity === "high") {
    if (/dexterity|tactile|3 mil|4 mil/i.test(haystack)) score += 1;
  }

  return Math.max(0, score);
}

/** Rank catalog candidates for intake; returns scored rows (highest first). */
export function rankScoredCatalogCandidates(
  candidates: EducationHubCatalogCandidate[],
  intake: SurveyIntakeState,
  limit = 9,
  answeredSteps?: ReadonlySet<string>,
): Array<{ product: StoreProductRow; score: number }> {
  if (candidates.length === 0) return [];

  const scored = candidates.map((c) => ({
    product: c.product,
    score: scoreCatalogCandidate(c, intake, answeredSteps),
  }));
  scored.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));

  return scored.slice(0, limit);
}

/** Rank catalog candidates for intake; returns up to `limit` product rows. */
export function rankCatalogCandidatesForIntake(
  candidates: EducationHubCatalogCandidate[],
  intake: SurveyIntakeState,
  limit = 9,
  answeredSteps?: ReadonlySet<string>,
): StoreProductRow[] {
  return rankScoredCatalogCandidates(candidates, intake, limit, answeredSteps).map((s) => s.product);
}

/** Store URL filters aligned with survey intake for “browse more” links. */
export function intakeToStoreCatalogFilters(intake: SurveyIntakeState): Partial<StoreCatalogUrlState> {
  const filters: Partial<StoreCatalogUrlState> = {};
  const industrySlug = intakeIndustrySlug(intake.industry);
  if (industrySlug && industrySlug !== "general") {
    filters.industries = [industrySlug];
  }

  const primaryUse = primaryUseForTask(intake.task);
  if (primaryUse) filters.uses = [primaryUse];

  if (intake.foodSafe) {
    filters.certifications = ["food_safe"];
  }

  return filters;
}
