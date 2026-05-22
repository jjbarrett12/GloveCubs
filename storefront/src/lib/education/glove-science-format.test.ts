import { describe, expect, it } from "vitest";
import { formatClassRecommendation } from "./glove-science-format";
import type { ScienceHubIntake } from "./glove-science-intake";

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

describe("formatClassRecommendation", () => {
  it("foodservice + food + wet + quick-change", () => {
    const r = formatClassRecommendation(
      intake({
        industry: "foodservice",
        exposure: "food",
        environment: "wet",
        wearDuration: "quick-change",
        dexterity: "high",
      })
    );
    expect(r.material).toMatch(/Food-safe|Nitrile/i);
    expect(r.thicknessRange).toMatch(/2–3|3–4/);
    expect(r.texture).toMatch(/Textured/i);
    expect(r.cutLevel).toBeUndefined();
    expect(r.nextStepHref).toBe("/glove-finder");
    expect(r.disclaimer).toMatch(/Educational guidance/i);
    expect(r.rationale.length).toBeGreaterThan(0);
  });

  it("cleaning + chemicals + wet + repeated-use", () => {
    const r = formatClassRecommendation(
      intake({
        industry: "cleaning",
        exposure: "chemicals",
        environment: "wet",
        wearDuration: "repeated-use",
      })
    );
    expect(r.material).toMatch(/Nitrile|chemical/i);
    expect(r.thicknessRange).toMatch(/6–8/);
    expect(r.cuff).toMatch(/Extended cuff/i);
  });

  it("healthcare + biohazard + dry + extended-wear", () => {
    const r = formatClassRecommendation(
      intake({
        industry: "healthcare",
        exposure: "biohazard",
        environment: "dry",
        wearDuration: "extended-wear",
        dexterity: "durability-first",
      })
    );
    expect(r.profileTitle).toMatch(/Healthcare/i);
    expect(r.thicknessRange).toMatch(/6–8|8\+/);
    expect(r.cuff).toMatch(/Extended cuff/i);
  });

  it("warehouse + cuts + dry + repeated-use", () => {
    const r = formatClassRecommendation(
      intake({
        industry: "warehouse",
        exposure: "cuts",
        environment: "dry",
        wearDuration: "repeated-use",
      })
    );
    expect(r.cutLevel).toMatch(/ANSI A2–A4/);
    expect(r.material).toMatch(/Heavy-duty|Nitrile/i);
  });

  it("automotive + oils + oily + extended-wear", () => {
    const r = formatClassRecommendation(
      intake({
        industry: "automotive",
        exposure: "oils",
        environment: "oily",
        wearDuration: "extended-wear",
        dexterity: "durability-first",
      })
    );
    expect(r.texture).toMatch(/Textured/i);
    expect(r.thicknessRange).toMatch(/6–8|8\+/);
    expect(r.disclaimer).toMatch(/Rule-based|not live AI/i);
  });
});
