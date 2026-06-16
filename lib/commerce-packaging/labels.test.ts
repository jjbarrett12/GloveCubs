import { describe, expect, it } from "vitest";
import { deriveCaseLabel, normalizeCommercePackaging } from "./labels";

describe("deriveCaseLabel unit nouns", () => {
  it("uses gloves for disposable glove categories", () => {
    const cp = normalizeCommercePackaging(
      {
        inner_unit_type: "box",
        units_per_inner: 200,
        inners_per_case: 10,
      },
      "disposable_gloves"
    );
    expect(cp.unit_noun).toBe("gloves");
    expect(deriveCaseLabel(cp)).toBe("10 boxes × 200 gloves = 2,000 gloves");
  });

  it("uses units fallback for unknown categories", () => {
    const cp = normalizeCommercePackaging(
      {
        inner_unit_type: "box",
        units_per_inner: 100,
        inners_per_case: 5,
      },
      null
    );
    expect(cp.unit_noun).toBe("units");
    expect(deriveCaseLabel(cp)).toBe("5 boxes × 100 units = 500 units");
  });
});
