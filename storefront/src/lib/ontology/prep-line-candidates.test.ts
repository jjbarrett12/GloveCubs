import { describe, expect, it } from "vitest";
import { RESTAURANT_PREP_LINE_SEMANTICS } from "@/lib/ontology/operational-environments";

describe("prep-line ontology evidence", () => {
  it("uses governed attribute value unions only", () => {
    expect(RESTAURANT_PREP_LINE_SEMANTICS.evidence.certifications_any_of).toContain("food_safe");
    expect(RESTAURANT_PREP_LINE_SEMANTICS.evidence.uses_any_of).toContain("food_handling");
    expect(RESTAURANT_PREP_LINE_SEMANTICS.evidence.evidence_mode).toBe("union_of_attribute_hits");
  });
});
