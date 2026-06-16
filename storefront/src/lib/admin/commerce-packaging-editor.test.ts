import { describe, expect, it } from "vitest";
import { normalizeCommercePackaging } from "@commerce-packaging/labels";
import {
  commercePackagingToFilterAttributes,
  initCommercePackagingFromEditor,
  resolveEffectiveCasePrice,
} from "@/lib/admin/commerce-packaging-editor";
import { emptyCommercePackaging } from "@commerce-packaging/labels";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import { IMPORT_DRAFT_PARSER_VERSION, IMPORT_DRAFT_SCHEMA_VERSION } from "@/lib/admin/import-draft-types";

describe("commerce-packaging-editor", () => {
  it("auto-calculates units_per_case from inner fields", () => {
    const cp = normalizeCommercePackaging(
      { units_per_inner: 100, inners_per_case: 10, inner_unit_type: "box", unit_noun: "gloves" },
      "disposable_gloves"
    );
    expect(cp.units_per_case).toBe(1000);
  });

  it("auto-calculates units_per_pallet", () => {
    const cp = normalizeCommercePackaging(
      {
        units_per_case: 1000,
        cases_per_pallet: 84,
        inner_unit_type: "box",
        units_per_inner: 100,
        inners_per_case: 10,
        unit_noun: "gloves",
      },
      "disposable_gloves"
    );
    expect(cp.units_per_pallet).toBe(84000);
  });

  it("preserves manual units_per_case override", () => {
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

  it("syncs filter attributes from commerce packaging", () => {
    const cp = normalizeCommercePackaging(
      {
        units_per_case: 1000,
        cases_per_pallet: 84,
        pallet_price: 2950,
        sell_by_pallet_enabled: true,
        inner_unit_type: "box",
        units_per_inner: 100,
        inners_per_case: 10,
        unit_noun: "gloves",
      },
      "disposable_gloves"
    );
    const attrs = commercePackagingToFilterAttributes(cp);
    expect(attrs.units_per_case).toBe("1000");
    expect(attrs.cases_per_pallet).toBe("84");
    expect(attrs.pallet_pricing_available).toBe("yes");
  });

  it("initializes from import draft commerce_packaging", () => {
    const draftCp = emptyCommercePackaging("disposable_gloves");
    draftCp.units_per_case = 1000;
    draftCp.units_per_inner = 100;
    draftCp.inners_per_case = 10;
    draftCp.inner_unit_type = "box";
    const cp = initCommercePackagingFromEditor({
      importDraft: {
        schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
        parser_version: IMPORT_DRAFT_PARSER_VERSION,
        source_url: "https://example.com",
        product_name: "G",
        brand: null,
        category_hint: null,
        description: null,
        image_url: null,
        sku: null,
        mpn: null,
        gtin: null,
        material: null,
        color: null,
        thickness_mil: null,
        case_pack: null,
        units_per_case: null,
        powder_free: null,
        latex_free: null,
        exam_grade: null,
        glove_grade: null,
        size: null,
        variants: [],
        confidence: { overall: 0, fields: {} },
        field_provenance: {},
        parse_warnings: [],
        commerce_packaging: draftCp,
      } satisfies ImportDraftProductV1,
    });
    expect(cp.units_per_case).toBe(1000);
  });

  it("resolves case price from variant list price fallback", () => {
    const cp = emptyCommercePackaging();
    expect(resolveEffectiveCasePrice(cp, [{ listPrice: "42.00" }])).toBe(42);
  });
});

describe("CasePalletSetupPanel logic", () => {
  it("derives case label for 10 boxes × 100 gloves", () => {
    const cp = normalizeCommercePackaging(
      {
        inner_unit_type: "box",
        units_per_inner: 100,
        inners_per_case: 10,
        unit_noun: "gloves",
      },
      "disposable_gloves"
    );
    expect(cp.case_label).toMatch(/10 boxes × 100 gloves = 1,000 gloves/);
  });

  it("derives pallet label for 84 cases", () => {
    const cp = normalizeCommercePackaging(
      {
        units_per_case: 1000,
        cases_per_pallet: 84,
        unit_noun: "gloves",
      },
      "disposable_gloves"
    );
    expect(cp.pallet_label).toMatch(/84 cases = 84,000 gloves/);
  });
});
