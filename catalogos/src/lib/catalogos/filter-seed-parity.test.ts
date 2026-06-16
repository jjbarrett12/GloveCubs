import { describe, expect, it } from "vitest";
import { normalizeCommercePackaging } from "@commerce-packaging/labels";
import { commercePackagingToFilterAttributes } from "@commerce-packaging/filter-sync";
import {
  MATERIAL_VALUES,
  THICKNESS_MIL_VALUES,
} from "./attribute-dictionary-types";
import { THICKNESS_MIL_OPTIONS } from "./filter-attributes";
import { getFallbackSynonymMap } from "./synonym-provider";
import { lookupAllowed } from "@/lib/normalization/synonym-lookup";

describe("filter seed parity (Phase 3E.C.1b)", () => {
  it("includes 0.5 in dictionary and filter attribute thickness options", () => {
    expect(THICKNESS_MIL_VALUES).toContain("0.5");
    expect(THICKNESS_MIL_OPTIONS).toContain("0.5");
  });

  it("maps thickness_mil 0.5 through lookupAllowed", () => {
    const r = lookupAllowed("thickness_mil", "0.5", THICKNESS_MIL_VALUES);
    expect(r.value).toBe("0.5");
    expect(r.unmapped).toBe(false);
  });

  it("maps units_per_case 10000 through commerce packaging filter sync", () => {
    const cp = normalizeCommercePackaging({ units_per_case: 10000 }, "disposable_gloves");
    expect(commercePackagingToFilterAttributes(cp).units_per_case).toBe("10000");
  });

  it("keeps polyethylene_pe as canonical material", () => {
    expect(MATERIAL_VALUES).toContain("polyethylene_pe");
    const r = lookupAllowed("material", "polyethylene_pe", MATERIAL_VALUES);
    expect(r.value).toBe("polyethylene_pe");
  });

  it("maps HDPE and polyethylene display text to polyethylene_pe via synonym path", () => {
    const map = getFallbackSynonymMap();
    expect(lookupAllowed("material", "hdpe", MATERIAL_VALUES, map).value).toBe("polyethylene_pe");
    expect(lookupAllowed("material", "high density polyethylene", MATERIAL_VALUES, map).value).toBe(
      "polyethylene_pe"
    );
    expect(lookupAllowed("material", "polyethylene", MATERIAL_VALUES, map).value).toBe("polyethylene_pe");
  });
});
