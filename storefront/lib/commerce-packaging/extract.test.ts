import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractCommercePackagingFromHtml } from "./extract";
import { deriveCaseLabel, derivePalletLabel, hasPackagingMathConflict, normalizeCommercePackaging } from "./labels";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("extractCommercePackagingFromHtml", () => {
  it("parses 10 boxes × 100 gloves → 1000 units/case", () => {
    const cp = extractCommercePackagingFromHtml({
      pageText: "100 gloves per box. 10 boxes per case. 1,000 gloves per case.",
      categorySlug: "disposable_gloves",
    });
    expect(cp.inner_unit_type).toBe("box");
    expect(cp.units_per_inner).toBe(100);
    expect(cp.inners_per_case).toBe(10);
    expect(cp.units_per_case).toBe(1000);
    expect(cp.unit_noun).toBe("gloves");
  });

  it("parses 4 boxes × 250 gloves → 1000 units/case", () => {
    const cp = extractCommercePackagingFromHtml({
      pageText: "250 gloves per box. 4 boxes per case. 4/250/case",
      categorySlug: "disposable_gloves",
    });
    expect(cp.units_per_inner).toBe(250);
    expect(cp.inners_per_case).toBe(4);
    expect(cp.units_per_case).toBe(1000);
  });

  it("parses 5 boxes × 200 gloves → 1000 units/case", () => {
    const cp = extractCommercePackagingFromHtml({
      pageText: "5 boxes per case. 200 gloves per box. 5/200/case",
      categorySlug: "disposable_gloves",
    });
    expect(cp.units_per_inner).toBe(200);
    expect(cp.inners_per_case).toBe(5);
    expect(cp.units_per_case).toBe(1000);
  });

  it("parses 6 boxes × 100 gloves → 600 units/case", () => {
    const cp = extractCommercePackagingFromHtml({
      pageText: "6 boxes per case. 100 gloves per box. 6/100/case",
      categorySlug: "disposable_gloves",
    });
    expect(cp.units_per_inner).toBe(100);
    expect(cp.inners_per_case).toBe(6);
    expect(cp.units_per_case).toBe(600);
  });

  it("parses 6 dozen per case → 72 pairs/case", () => {
    const cp = extractCommercePackagingFromHtml({
      pageText: "6 dozen per case. 72 pairs per case.",
      categorySlug: "reusable_work_gloves",
    });
    expect(cp.inner_unit_type).toBe("dozen");
    expect(cp.units_per_inner).toBe(12);
    expect(cp.inners_per_case).toBe(6);
    expect(cp.units_per_case).toBe(72);
    expect(cp.unit_noun).toBe("pairs");
  });

  it("parses 84 cases per pallet × 1000 units/case → 84000 units/pallet", () => {
    const cp = extractCommercePackagingFromHtml({
      pageText: "1000 gloves per case. 84 cases per pallet.",
      categorySlug: "disposable_gloves",
    });
    expect(cp.units_per_case).toBe(1000);
    expect(cp.cases_per_pallet).toBe(84);
    expect(cp.units_per_pallet).toBe(84000);
  });

  it("sets units_per_case only with warning when inner breakdown missing", () => {
    const cp = extractCommercePackagingFromHtml({
      pageText: "1000/case disposable nitrile gloves",
      categorySlug: "disposable_gloves",
    });
    expect(cp.units_per_case).toBe(1000);
    expect(cp.units_per_inner).toBeNull();
    expect(cp.inners_per_case).toBeNull();
    expect(cp.parse_warnings.some((w) => /inner packaging/i.test(w))).toBe(true);
  });

  it("leaves cases_per_pallet null when not mentioned", () => {
    const cp = extractCommercePackagingFromHtml({
      pageText: "10 boxes per case. 100 gloves per box.",
      categorySlug: "disposable_gloves",
    });
    expect(cp.cases_per_pallet).toBeNull();
    expect(cp.units_per_pallet).toBeNull();
  });
});

describe("Hospeco-style Proworks nitrile fixture", () => {
  it("parses 10×100 case and 84-case pallet from representative HTML", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "fixtures", "hospeco-proworks-nitrile.html"),
      "utf8"
    );
    const extracted = extractCommercePackagingFromHtml({
      pageText: html,
      categorySlug: "disposable_gloves",
    });
    const cp = normalizeCommercePackaging(extracted, "disposable_gloves");

    expect(cp.inner_unit_type).toBe("box");
    expect(cp.units_per_inner).toBe(100);
    expect(cp.inners_per_case).toBe(10);
    expect(cp.units_per_case).toBe(1000);
    expect(cp.cases_per_pallet).toBe(84);
    expect(cp.units_per_pallet).toBe(84000);
    expect(cp.unit_noun).toBe("gloves");
    expect(deriveCaseLabel(cp)).toBe("10 boxes × 100 gloves = 1,000 gloves");
    expect(derivePalletLabel(cp)).toBe("84 cases = 84,000 gloves");
  });
});

describe("normalizeCommercePackaging", () => {
  it("auto-calculates units_per_case unless overridden", () => {
    const cp = normalizeCommercePackaging(
      { units_per_inner: 100, inners_per_case: 10, inner_unit_type: "box", unit_noun: "gloves" },
      "disposable_gloves"
    );
    expect(cp.units_per_case).toBe(1000);
    expect(cp.units_per_case_overridden).toBe(false);
  });

  it("preserves manual override of units_per_case", () => {
    const cp = normalizeCommercePackaging(
      {
        units_per_inner: 100,
        inners_per_case: 10,
        units_per_case: 950,
        units_per_case_overridden: true,
        inner_unit_type: "box",
        unit_noun: "gloves",
      },
      "disposable_gloves"
    );
    expect(cp.units_per_case).toBe(950);
  });

  it("detects packaging math conflict", () => {
    const cp = normalizeCommercePackaging(
      {
        units_per_inner: 100,
        inners_per_case: 10,
        units_per_case: 900,
        units_per_case_overridden: true,
        inner_unit_type: "box",
        unit_noun: "gloves",
      },
      "disposable_gloves"
    );
    expect(hasPackagingMathConflict(cp)).toBe(true);
  });

  it("parses Hospeco polyethylene put/up packaging without using pallet tier qty as case units", () => {
    const cp = extractCommercePackagingFromHtml({
      html: `<table><tr><th>Packaging Put/Up</th><td>500/bx - 20 bxs/cs</td></tr>
      <tr><th>Pallet Ti x Hi = Qty</th><td>200 x 5 = 1000</td></tr></table>`,
      pageText:
        "Safety Zone Polyethylene Gloves, Powder-Free, Embossed Grip, 20x500, Clear, 0.5 mil - Small",
      categorySlug: "disposable_gloves",
    });
    expect(cp.units_per_inner).toBe(500);
    expect(cp.inners_per_case).toBe(20);
    expect(cp.units_per_case).toBe(10000);
    expect(cp.case_label).toBe("20 boxes × 500 gloves = 10,000 gloves");
    expect(cp.units_per_case).not.toBe(1000);
  });
});
