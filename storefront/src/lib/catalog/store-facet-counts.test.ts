import { describe, expect, it } from "vitest";
import { withFacetDisplayLabels } from "./store-facet-counts";

describe("withFacetDisplayLabels", () => {
  it("keeps canonical value while attaching formatted label", () => {
    const rows = withFacetDisplayLabels("material", [{ value: "polyethylene_pe", count: 3 }]);
    expect(rows).toEqual([
      { value: "polyethylene_pe", count: 3, label: "Polyethylene (PE)" },
    ]);
  });

  it("formats thickness_mil and units_per_case facet values", () => {
    const rows = withFacetDisplayLabels("thickness_mil", [
      { value: "0.5", count: 2 },
      { value: "3", count: 5 },
    ]);
    expect(rows[0]).toEqual({ value: "0.5", count: 2, label: "0.5 Mil" });
    expect(rows[1]).toEqual({ value: "3", count: 5, label: "3 Mil" });

    const units = withFacetDisplayLabels("units_per_case", [{ value: "10000", count: 1 }]);
    expect(units[0]).toEqual({ value: "10000", count: 1, label: "10,000" });
  });
});
