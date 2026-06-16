import { describe, expect, it } from "vitest";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "./types";
import {
  attachCommercePackagingToParsedRow,
  commercePackagingInputFromLegacyStagingFields,
  resolveCommercePackagingForStagingRow,
} from "./staging-bridge";
import { normalizeCommercePackaging } from "./labels";
import { evaluateCommercePackagingReadiness } from "./readiness";
import { applyCommercePackagingToMetadata } from "./metadata-mirror";

describe("commercePackagingInputFromLegacyStagingFields", () => {
  it("maps 10 boxes × 100 gloves to units_per_case 1000", () => {
    const cp = normalizeCommercePackaging(
      commercePackagingInputFromLegacyStagingFields({
        boxes_per_case: 10,
        gloves_per_box: 100,
      }),
      "disposable_gloves"
    );
    expect(cp.units_per_case).toBe(1000);
    expect(cp.inner_unit_type).toBe("box");
    expect(cp.inners_per_case).toBe(10);
    expect(cp.units_per_inner).toBe(100);
  });

  it("maps 4 boxes × 250 gloves to units_per_case 1000", () => {
    const cp = normalizeCommercePackaging(
      commercePackagingInputFromLegacyStagingFields({
        boxes_per_case: 4,
        gloves_per_box: 250,
      }),
      "disposable_gloves"
    );
    expect(cp.units_per_case).toBe(1000);
  });

  it("maps 6 dozen per case to 72 pairs", () => {
    const cp = normalizeCommercePackaging(
      commercePackagingInputFromLegacyStagingFields({ dozen_per_case: 6 }, "reusable_work_gloves"),
      "reusable_work_gloves"
    );
    expect(cp.units_per_case).toBe(72);
    expect(cp.unit_noun).toBe("pairs");
  });

  it("warns when only total_gloves_per_case is known", () => {
    const input = commercePackagingInputFromLegacyStagingFields({ total_gloves_per_case: 1000 });
    expect(input.units_per_case).toBe(1000);
    expect(input.parse_warnings).toContain("inner packaging unknown");
  });
});

describe("attachCommercePackagingToParsedRow", () => {
  it("extracts commerce_packaging from HTML via shared parser", () => {
    const html = `<p>10 boxes of 100 gloves per case. 84 cases per pallet.</p>`;
    const row = attachCommercePackagingToParsedRow(
      { boxes_per_case: 10, gloves_per_box: 100, cost: 42 },
      {
        parsedPage: { raw_html_snippet: html, spec_table: {} },
        categorySlug: "disposable_gloves",
      }
    );
    const cp = row.commerce_packaging as { schema_version: number; units_per_case?: number; cases_per_pallet?: number };
    expect(cp.schema_version).toBe(COMMERCE_PACKAGING_SCHEMA_VERSION);
    expect(cp.units_per_case).toBe(1000);
    expect(row.boxes_per_case).toBe(10);
    expect(row.gloves_per_box).toBe(100);
  });

  it("leaves pallet fields null without pallet data", () => {
    const cp = resolveCommercePackagingForStagingRow({ boxes_per_case: 10, gloves_per_box: 100 });
    expect(cp.pallet_price).toBeNull();
    expect(cp.cases_per_pallet).toBeNull();
  });
});

describe("evaluateCommercePackagingReadiness", () => {
  it("blocks missing units_per_case", () => {
    const r = evaluateCommercePackagingReadiness(null, { publishIntent: true });
    expect(r.blockers.some((b) => b.code === "missing_units_per_case")).toBe(true);
  });

  it("warns on missing pallet price only", () => {
    const cp = normalizeCommercePackaging(
      {
        units_per_case: 1000,
        case_price: 42,
        sell_by_pallet_enabled: true,
        cases_per_pallet: 84,
      },
      "disposable_gloves"
    );
    const r = evaluateCommercePackagingReadiness(cp, { publishIntent: true });
    expect(r.blockers).toHaveLength(0);
    expect(r.warnings.some((w) => w.code === "missing_pallet_price")).toBe(true);
  });
});

describe("applyCommercePackagingToMetadata", () => {
  it("writes legacy mirrors without removing other metadata", () => {
    const cp = normalizeCommercePackaging({ units_per_case: 1000, inners_per_case: 10, units_per_inner: 100, inner_unit_type: "box", case_price: 42 }, "disposable_gloves");
    const meta: Record<string, unknown> = { legacy_field: "keep" };
    applyCommercePackagingToMetadata(meta, cp);
    expect(meta.legacy_field).toBe("keep");
    expect(meta.units_per_case).toBe(1000);
    expect(meta.case_pack).toBe("10/100");
    expect((meta.commerce_packaging as { schema_version: number }).schema_version).toBe(1);
  });
});
