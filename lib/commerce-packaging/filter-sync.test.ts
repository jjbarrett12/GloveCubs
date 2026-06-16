import { describe, expect, it } from "vitest";
import { normalizeCommercePackaging } from "./labels";
import {
  commercePackagingToFilterAttributes,
  mergeCommercePackagingIntoFilterAttributes,
} from "./filter-sync";

describe("commercePackagingToFilterAttributes", () => {
  it("maps units_per_case to nearest storefront bucket", () => {
    const cp = normalizeCommercePackaging({ units_per_case: 1980 }, "disposable_gloves");
    expect(commercePackagingToFilterAttributes(cp).units_per_case).toBe("2000");
  });

  it("maps units_per_case 10000 to exact bucket when available", () => {
    const cp = normalizeCommercePackaging({ units_per_case: 10000 }, "disposable_gloves");
    expect(commercePackagingToFilterAttributes(cp).units_per_case).toBe("10000");
  });
});

describe("mergeCommercePackagingIntoFilterAttributes", () => {
  it("fills empty filter keys without overwriting existing values", () => {
    const cp = normalizeCommercePackaging({ units_per_case: 1000 }, "disposable_gloves");
    const merged = mergeCommercePackagingIntoFilterAttributes({ color: "blue" }, cp);
    expect(merged.units_per_case).toBe("1000");
    expect(merged.color).toBe("blue");

    const preserved = mergeCommercePackagingIntoFilterAttributes({ units_per_case: "500" }, cp);
    expect(preserved.units_per_case).toBe("500");
  });
});
