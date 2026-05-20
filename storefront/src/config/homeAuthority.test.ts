import { describe, expect, it } from "vitest";
import { deriveGloveEducationGuidance, type GloveEducationCriteria } from "./homeAuthority";

const base: GloveEducationCriteria = {
  industry: "food-service",
  foodSafe: false,
  chemicalExposure: false,
  thickness: "standard",
  dexterity: "standard",
  latexFree: true,
  powderFree: false,
  heavyDuty: false,
  texturedGrip: false,
};

describe("deriveGloveEducationGuidance", () => {
  it("uses directional guidance headline", () => {
    const r = deriveGloveEducationGuidance(base);
    expect(r.headline).toMatch(/^Directional guidance for /);
    expect(r.headline).not.toContain("Recommended");
  });

  it("prioritizes food-safe over default latex-free branch", () => {
    const r = deriveGloveEducationGuidance({ ...base, foodSafe: true, latexFree: true });
    expect(r.materials.some((m) => m.includes("Food-safe"))).toBe(true);
    expect(r.materials).not.toEqual(["Nitrile or vinyl (latex-free)"]);
  });

  it("prioritizes chemical exposure over default latex-free branch", () => {
    const r = deriveGloveEducationGuidance({ ...base, chemicalExposure: true, latexFree: true });
    expect(r.materials.some((m) => m.includes("chemical"))).toBe(true);
  });

  it("includes heavy-duty material when heavy-duty is selected", () => {
    const r = deriveGloveEducationGuidance({ ...base, heavyDuty: true, latexFree: false });
    expect(r.materials.some((m) => m.toLowerCase().includes("heavy-duty"))).toBe(true);
  });

  it("falls back to latex-free default only when no task flags are set", () => {
    const r = deriveGloveEducationGuidance({ ...base, latexFree: true });
    expect(r.materials).toContain("Nitrile or vinyl (latex-free)");
  });

  it("states rule-based guidance in procurement note", () => {
    const r = deriveGloveEducationGuidance(base);
    expect(r.procurementNote).toMatch(/Rule-based educational guidance/i);
    expect(r.procurementNote).toMatch(/not live AI/i);
  });
});
