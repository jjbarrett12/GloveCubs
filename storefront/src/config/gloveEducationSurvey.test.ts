import { describe, expect, it } from "vitest";
import { buildSurveyIndustryOptions } from "@/config/gloveEducationSurvey";
import { homeIndustryCatalogCount } from "@/config/homeIndustryIntelligence";

describe("gloveEducationSurvey", () => {
  it("lists every catalog industry from site nav", () => {
    const options = buildSurveyIndustryOptions();
    expect(options.length).toBe(homeIndustryCatalogCount());
    expect(options.length).toBe(28);
    expect(new Set(options.map((o) => o.value)).size).toBe(28);
  });
});
