import { describe, expect, it, afterEach } from "vitest";
import { normalizeCommercePackaging } from "@commerce-packaging/labels";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";
import type { ProductWriteInput } from "@/lib/admin/product-write";
import {
  evaluateActivePublishReadinessSync,
  type ActivePublishReadinessDeps,
} from "@/lib/admin/product-write-active-readiness";
import { CATALOGOS_CANONICAL_PUBLISH_MESSAGE } from "@/lib/admin/canonical-publish-policy";

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
  const prev = process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH;

  afterEach(() => {
    if (prev === undefined) delete process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH;
    else process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH = prev;
  });

  it("ignores draft saves", () => {
    expect(
      evaluateActivePublishReadinessSync(
        activeInput({ status: "draft", brandName: "" }),
        { metadata: {} },
        deps
      )
    ).toBeNull();
  });

  it("blocks URL-import metadata with CatalogOS publish message", () => {
    const err = evaluateActivePublishReadinessSync(activeInput(), { metadata: { import_staging_id: "st-1" } }, deps);
    expect(err).toContain("CatalogOS");
  });

  it("blocks storefront active publish by default even when readiness passes", () => {
    expect(
      evaluateActivePublishReadinessSync(
        activeInput(),
        { metadata: { product_line_code: "other_product" } },
        deps
      )
    ).toBe(CATALOGOS_CANONICAL_PUBLISH_MESSAGE);
  });

  it("allows emergency storefront active publish when flag enabled", () => {
    process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH = "1";
    expect(
      evaluateActivePublishReadinessSync(
        activeInput(),
        { metadata: { product_line_code: "other_product" } },
        deps
      )
    ).toBeNull();
  });

  it("blocks active save when editor readiness fails under emergency flag", () => {
    process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH = "1";
    const err = evaluateActivePublishReadinessSync(activeInput({ brandName: "" }), { metadata: {} }, deps);
    expect(err).toContain("Brand required");
  });
});

describe("product-write active readiness policy", () => {
  it("product-write uses evaluateActivePublishReadiness and canonical publish guard", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const s = readFileSync(join(__dirname, "product-write.ts"), "utf8");
    expect(s).toContain("evaluateActivePublishReadiness");
    expect(s).toContain("evaluateStorefrontManualActivePublishGuard");
    expect(s).not.toMatch(/\brunPublish\b/);
  });
});
