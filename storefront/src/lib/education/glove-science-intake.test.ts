import { describe, expect, it } from "vitest";
import { intakeToCriteria, type ScienceHubIntake } from "./glove-science-intake";

function intake(partial: Partial<ScienceHubIntake>): ScienceHubIntake {
  return {
    industry: "general",
    exposure: "none",
    wearDuration: "quick-change",
    environment: "dry",
    dexterity: "balanced",
    latexFree: true,
    powderFree: true,
    ...partial,
  };
}

describe("intakeToCriteria", () => {
  it("maps foodservice + food + wet + quick-change", () => {
    const c = intakeToCriteria(
      intake({
        industry: "foodservice",
        exposure: "food",
        environment: "wet",
        wearDuration: "quick-change",
        dexterity: "high",
      })
    );
    expect(c.industry).toBe("food-service");
    expect(c.foodSafe).toBe(true);
    expect(c.texturedGrip).toBe(true);
    expect(c.thickness).toBe("light");
    expect(c.dexterity).toBe("high");
    expect(c.heavyDuty).toBe(false);
  });

  it("maps cleaning + chemicals + wet + repeated-use", () => {
    const c = intakeToCriteria(
      intake({
        industry: "cleaning",
        exposure: "chemicals",
        environment: "wet",
        wearDuration: "repeated-use",
      })
    );
    expect(c.industry).toBe("janitorial");
    expect(c.chemicalExposure).toBe(true);
    expect(c.heavyDuty).toBe(true);
    expect(c.texturedGrip).toBe(true);
  });

  it("maps healthcare + biohazard + dry + extended-wear", () => {
    const c = intakeToCriteria(
      intake({
        industry: "healthcare",
        exposure: "biohazard",
        environment: "dry",
        wearDuration: "extended-wear",
        dexterity: "durability-first",
      })
    );
    expect(c.industry).toBe("healthcare");
    expect(c.chemicalExposure).toBe(true);
    expect(c.heavyDuty).toBe(true);
    expect(c.thickness).toBe("heavy");
  });

  it("maps warehouse + cuts + dry + repeated-use", () => {
    const c = intakeToCriteria(
      intake({
        industry: "warehouse",
        exposure: "cuts",
        environment: "dry",
        wearDuration: "repeated-use",
      })
    );
    expect(c.industry).toBe("industrial");
    expect(c.heavyDuty).toBe(true);
    expect(c.texturedGrip).toBe(false);
  });

  it("maps automotive + oils + oily + extended-wear", () => {
    const c = intakeToCriteria(
      intake({
        industry: "automotive",
        exposure: "oils",
        environment: "oily",
        wearDuration: "extended-wear",
        dexterity: "durability-first",
      })
    );
    expect(c.industry).toBe("industrial");
    expect(c.chemicalExposure).toBe(true);
    expect(c.texturedGrip).toBe(true);
    expect(c.heavyDuty).toBe(true);
  });
});
