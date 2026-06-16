import { describe, expect, it } from "vitest";
import { extractGloveAttributes } from "./extract-glove-attributes";

describe("extractGloveAttributes", () => {
  it("extracts disposable nitrile exam attributes with evidence", () => {
    const result = extractGloveAttributes({
      title: "Proworks Blue Violet Nitrile Exam Gloves Powder Free 3 Mil",
      description: "FDA approved ASTM tested latex free food safe chemo tested glove.",
      specTable: { material: "Nitrile", thickness: "3 Mil" },
      bullets: ["Powder free", "Ambidextrous"],
      rawTextSample: "Disposable nitrile exam glove",
    });

    expect(result.disposableReusable?.value).toBe("disposable");
    expect(result.attributes.material?.value).toBe("nitrile");
    expect(result.attributes.powderFree?.value).toBe(true);
    expect(result.attributes.latexFree?.value).toBe(true);
    expect(result.attributes.foodSafe?.value).toBe(true);
    expect(result.attributes.examGrade?.value).toBe(true);
    expect(result.attributes.thicknessMil?.value).toBe(3);
    expect(result.attributes.certifications?.value).toEqual(expect.arrayContaining(["FDA", "ASTM"]));
    expect(result.attributes.material?.confidence).toBeGreaterThan(0);
    expect(result.attributes.material?.source).toBeTruthy();
  });

  it("extracts reusable work glove ANSI/EN388 signals", () => {
    const result = extractGloveAttributes({
      title: "Reusable Nitrile Coated Work Glove",
      rawTextSample: "Cut resistant reusable work glove ANSI/ISEA cut level A3 EN 388 4543 coating polyurethane",
      specTable: { length: "12 inches" },
    });

    expect(result.disposableReusable?.value).toBe("reusable");
    expect(result.attributes.coating?.value).toMatch(/coated|polyurethane/i);
    expect(result.attributes.ansiCutLevel?.value).toBeTruthy();
    expect(result.attributes.en388Rating?.value).toBeTruthy();
  });

  it("does not map latex free or vinyl alternative phrases to material", () => {
    const result = extractGloveAttributes({
      title: "Safety Zone® Polyethylene Gloves, Powder-Free, Clear, 0.5 mil - Small",
      bullets: ["Latex free, powder free", "Cost effective alternative to vinyl gloves"],
      specTable: { material: "Polyethylene" },
    });
    expect(result.attributes.material?.value).toBe("polyethylene");
    expect(result.attributes.latexFree?.value).toBe(true);
  });

  it.each([
    ["0.5 mil", 0.5],
    [".5 mil", 0.5],
    ["0.50 mil", 0.5],
    ["5 mil", 5],
    ["3.5 mil", 3.5],
  ])("parses thickness %s as %s", (phrase, expected) => {
    const result = extractGloveAttributes({ title: `Nitrile Gloves ${phrase}` });
    expect(result.attributes.thicknessMil?.value).toBe(expected);
  });

  it("maps HDPE resin feature text to polyethylene material", () => {
    const result = extractGloveAttributes({
      title: "Clear disposable food service gloves",
      bullets: ["100% synthetic HDPE resin"],
    });
    expect(result.attributes.material?.value).toBe("polyethylene");
  });
});
