import { describe, expect, it } from "vitest";
import type { EducationHubCatalogCandidate } from "@/lib/education-hub/survey-catalog-matches";
import {
  intakeToStoreCatalogFilters,
  rankCatalogCandidatesForIntake,
  scoreCatalogCandidate,
} from "@/lib/education-hub/survey-catalog-matches";
import { DEFAULT_SURVEY_INTAKE } from "@/lib/education-hub/intake-types";
import type { StoreProductRow } from "@/lib/catalog/store-products";

function stubProduct(id: string, name: string): StoreProductRow {
  return {
    id,
    name,
    slug: id,
    brandName: null,
    brandId: null,
    imageUrl: null,
    internalSku: null,
    catalogVariantId: null,
    variantSku: null,
    sizeCode: null,
    materialHint: null,
    badges: [],
    bestPrice: null,
    casePrice: null,
    caseListPrice: null,
    caseOnSale: false,
    palletPrice: null,
    palletListPrice: null,
    palletOnSale: false,
    unitsPerCase: null,
    unitNoun: "gloves",
    palletPricingAvailable: false,
    caseLabel: null,
    palletLabel: null,
    commercialUseSummary: null,
    certificationHints: [],
    protectionHint: null,
    activeVariantCount: 1,
    availableSizeCodes: [],
    description: null,
    impactPerformance: null,
  };
}

function candidate(
  id: string,
  name: string,
  attrs: EducationHubCatalogCandidate["attrs"]
): EducationHubCatalogCandidate {
  return { product: stubProduct(id, name), attrs };
}

describe("survey-catalog-matches", () => {
  it("scores food-handling intake higher for food_safe catalog rows", () => {
    const food = candidate("a", "Food nitrile", {
      uses: ["food_handling"],
      industries: ["food_service"],
      protection_tags: [],
      certifications: ["food_safe"],
    });
    const industrial = candidate("b", "Industrial nitrile", {
      uses: ["general_purpose"],
      industries: ["industrial"],
      protection_tags: [],
      certifications: [],
    });
    const intake = { ...DEFAULT_SURVEY_INTAKE, task: "food-handling", foodSafe: true };
    expect(scoreCatalogCandidate(food, intake)).toBeGreaterThan(scoreCatalogCandidate(industrial, intake));
  });

  it("ranks top matches and returns up to nine rows", () => {
    const pool = [
      candidate("1", "Low", { uses: [], industries: [], protection_tags: [], certifications: [] }),
      candidate("2", "Food", {
        uses: ["food_handling"],
        industries: ["food_service"],
        protection_tags: [],
        certifications: ["food_safe"],
      }),
    ];
    const ranked = rankCatalogCandidatesForIntake(pool, DEFAULT_SURVEY_INTAKE, 8);
    expect(ranked.map((p) => p.id)).toEqual(["2", "1"]);
  });

  it("does not bias ranking until survey steps are answered", () => {
    const pool = [
      candidate("1", "Alpha", { uses: [], industries: [], protection_tags: [], certifications: [] }),
      candidate("2", "Food", {
        uses: ["food_handling"],
        industries: ["food_service"],
        protection_tags: [],
        certifications: ["food_safe"],
      }),
    ];
    const unanswered = rankCatalogCandidatesForIntake(pool, DEFAULT_SURVEY_INTAKE, 2, new Set());
    expect(unanswered.map((p) => p.id)).toEqual(["1", "2"]);

    const afterIndustry = rankCatalogCandidatesForIntake(
      pool,
      { ...DEFAULT_SURVEY_INTAKE, task: "", exposureRisks: [], foodSafe: false, powderFree: false },
      2,
      new Set(["industry"]),
    );
    expect(afterIndustry[0]?.id).toBe("2");
  });

  it("maps intake to store catalog filters", () => {
    const filters = intakeToStoreCatalogFilters(DEFAULT_SURVEY_INTAKE);
    expect(filters.industries).toEqual(["food_service"]);
    expect(filters.uses).toEqual(["food_handling"]);
    expect(filters.certifications).toEqual(["food_safe"]);
  });
});
