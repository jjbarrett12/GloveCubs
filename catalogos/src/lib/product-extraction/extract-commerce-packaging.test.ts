import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { extractCommercePackagingFromHtml } from "@commerce-packaging/extract";
import { extractCommercePackagingFields } from "./extract-commerce-packaging";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOSPECO_FIXTURE = path.resolve(
  __dirname,
  "../../../../lib/commerce-packaging/fixtures/hospeco-proworks-nitrile.html"
);

describe("extractCommercePackagingFields", () => {
  it("delegates to canonical extractor and wraps FieldEvidence", () => {
    const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
    const canonical = extractCommercePackagingFromHtml({
      html,
      categorySlug: "disposable_gloves",
    });
    const wrapped = extractCommercePackagingFields({
      html,
      categorySlug: "disposable_gloves",
    });

    expect(wrapped.unitsPerCase?.value).toBe(canonical.units_per_case);
    expect(wrapped.innersPerCase?.value).toBe(canonical.inners_per_case);
    expect(wrapped.unitsPerInner?.value).toBe(canonical.units_per_inner);
    expect(wrapped.unitsPerCase?.confidence).toBeGreaterThan(0);
    expect(wrapped.unitsPerCase?.trust).toBeTruthy();
    expect(wrapped.packTextRaw?.value).toBeTruthy();
  });

  it("surfaces parse warnings from canonical extractor", () => {
    const wrapped = extractCommercePackagingFields({
      pageText: "mystery pack size only",
      categorySlug: "disposable_gloves",
    });
    expect(Array.isArray(wrapped.parseWarnings)).toBe(true);
  });

  it("maps caseLabel when canonical extractor provides it", () => {
    const wrapped = extractCommercePackagingFields({
      pageText: "100 gloves per box. 10 boxes per case. 1,000 gloves per case.",
      categorySlug: "disposable_gloves",
    });
    expect(wrapped.unitsPerCase?.value).toBe(1000);
    expect(wrapped.caseLabel?.value ?? wrapped.unitNoun?.value).toBeTruthy();
  });
});
