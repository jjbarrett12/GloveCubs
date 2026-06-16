import { describe, expect, it } from "vitest";
import { normalizeCommercePackaging } from "@commerce-packaging/labels";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";
import type { ProductWriteInput } from "@/lib/admin/product-write";
import {
  evaluateActivePublishReadinessSync,
  type ActivePublishReadinessDeps,
} from "@/lib/admin/product-write-active-readiness";

const defs: AttributeDefinitionRow[] = [
  {
    id: "def-color",
    attributeKey: "color",
    label: "Color",
    displayGroup: "Specs",
    cardinality: "single",
    isRequired: true,
    isFilterable: true,
    allowedValues: ["blue_violet"],
  },
];

const commercePackaging = normalizeCommercePackaging(
  {
    units_per_case: 1000,
    case_price: 42,
    inner_unit_type: "box",
    units_per_inner: 100,
    inners_per_case: 10,
    unit_noun: "gloves",
  },
  "disposable_gloves"
);

const deps: ActivePublishReadinessDeps = {
  categoryIdValid: true,
  categorySlug: "disposable_gloves",
  attributeDefinitions: defs,
  skuCollisions: { existingParentSkus: new Set(), existingVariantSkus: new Set() },
};

function activeInput(overrides: Partial<ProductWriteInput> = {}): ProductWriteInput {
  return {
    name: "Nitrile Glove",
    brandName: "Acme",
    categoryId: "cat-1",
    description: "",
    primaryImageUrl: "https://example.com/img.jpg",
    status: "active",
    quoteOnly: true,
    variants: [{ sizeCode: "M", variantSku: "GLV-ACME-M", listPrice: "" }],
    attributes: { color: "blue_violet" },
    commercePackaging,
    ...overrides,
  };
}

describe("evaluateActivePublishReadinessSync", () => {
  it("ignores draft saves", () => {
    expect(
      evaluateActivePublishReadinessSync(
        activeInput({ status: "draft", brandName: "" }),
        { metadata: {} },
        deps
      )
    ).toBeNull();
  });

  it("blocks URL-import metadata before other checks", () => {
    const err = evaluateActivePublishReadinessSync(activeInput(), { metadata: { import_staging_id: "st-1" } }, deps);
    expect(err).toContain("cannot be published");
  });

  it("blocks active save when editor readiness fails (missing brand)", () => {
    const err = evaluateActivePublishReadinessSync(activeInput({ brandName: "" }), { metadata: {} }, deps);
    expect(err).toContain("Brand required");
  });

  it("blocks active save when case packaging missing", () => {
    const err = evaluateActivePublishReadinessSync(
      activeInput({ commercePackaging: null }),
      { metadata: { product_line_code: "other_product" } },
      deps
    );
    expect(err).toMatch(/Case & Pallet|units per case|case product/i);
  });

  it("passes when readiness mirror is satisfied", () => {
    expect(
      evaluateActivePublishReadinessSync(
        activeInput(),
        { metadata: { product_line_code: "other_product" } },
        deps
      )
    ).toBeNull();
  });

  it("blocks when required attribute missing", () => {
    const err = evaluateActivePublishReadinessSync(
      activeInput({ attributes: {} }),
      { metadata: { product_line_code: "other_product" } },
      deps
    );
    expect(err).toContain("Required attribute: Color");
  });

  it("URL-import block wins over otherwise complete manual product", () => {
    const err = evaluateActivePublishReadinessSync(
      activeInput(),
      { metadata: { catalogos_url_import_job_id: "job-99" } },
      deps
    );
    expect(err).toContain("cannot be published");
  });
});

describe("product-write active readiness policy", () => {
  it("product-write uses evaluateActivePublishReadiness and not runPublish", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const s = readFileSync(join(__dirname, "product-write.ts"), "utf8");
    expect(s).toContain("evaluateActivePublishReadiness");
    expect(s).not.toMatch(/\brunPublish\b/);
    expect(s).not.toContain("manualActivePublishGuard");
  });
});
