import { describe, expect, it } from "vitest";
import {
  applySkuProposalsToNormalizedData,
  buildCatalogOsSkuProposalsFromStagingRows,
} from "./staging-sku-proposals";
import { resolvePublishSkusFromStaging } from "./publish-sku-apply";
import { evaluateSkuReadinessFromStaging } from "./sku-readiness";

const HOSPECO_ROWS = ["XS", "S", "M", "L", "XL"].map((size, i) => ({
  normalized_data: {
    supplier_sku: `GL-N125F-${size}`,
    sku: `GL-N125F-${size}`,
    source_url:
      "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl",
    commerce_packaging: {
      inners_per_case: 10,
      units_per_inner: 200,
      units_per_case: 2000,
      case_label: "10 boxes × 200 gloves = 2,000 gloves",
    },
  },
  attributes: { size: size.toLowerCase() },
  inferred_size: size,
}));

describe("buildCatalogOsSkuProposalsFromStagingRows", () => {
  it("derives GLV-GL-N125 and five variant SKUs from Hospeco-style family rows", () => {
    const proposals = buildCatalogOsSkuProposalsFromStagingRows(HOSPECO_ROWS);
    expect(proposals.proposed_parent_sku).toBe("GLV-GL-N125");
    expect(proposals.variants.map((v) => v.proposed_glovecubs_sku)).toEqual([
      "GLV-GL-N125XS",
      "GLV-GL-N125S",
      "GLV-GL-N125M",
      "GLV-GL-N125L",
      "GLV-GL-N125XL",
    ]);
    expect(proposals.variants.map((v) => v.manufacturer_sku)).toEqual([
      "GL-N125F-XS",
      "GL-N125F-S",
      "GL-N125F-M",
      "GL-N125F-L",
      "GL-N125F-XL",
    ]);
  });

  it("preserves commerce_packaging on normalized_data when applying proposals", () => {
    const nd = {
      ...HOSPECO_ROWS[0]!.normalized_data,
      sku_proposals: buildCatalogOsSkuProposalsFromStagingRows(HOSPECO_ROWS),
    };
    const next = applySkuProposalsToNormalizedData(nd);
    expect(next.commerce_packaging).toEqual(nd.commerce_packaging);
    expect(next.sku_proposals).toBeDefined();
  });
});

describe("resolvePublishSkusFromStaging", () => {
  it("uses proposed GLV SKUs when safe apply is enabled", () => {
    const nd = {
      supplier_sku: "GL-N125F-M",
      sku_proposals: buildCatalogOsSkuProposalsFromStagingRows(HOSPECO_ROWS),
    };
    const resolved = resolvePublishSkusFromStaging({
      normalizedData: nd,
      sizeCode: "M",
      fallbackParentSku: "GL-N125F-M",
      fallbackVariantSku: "GL-N125F-M",
      applyProposals: true,
    });
    expect(resolved.parentSku).toBe("GLV-GL-N125");
    expect(resolved.variantSku).toBe("GLV-GL-N125M");
    expect(resolved.manufacturerSku).toBe("GL-N125F-M");
  });

  it("keeps fallback when proposals disabled", () => {
    const nd = {
      supplier_sku: "GL-N125F-M",
      sku_proposals: buildCatalogOsSkuProposalsFromStagingRows(HOSPECO_ROWS),
    };
    const resolved = resolvePublishSkusFromStaging({
      normalizedData: nd,
      sizeCode: "M",
      fallbackParentSku: "LEGACY-PARENT",
      fallbackVariantSku: "LEGACY-VAR",
      applyProposals: false,
    });
    expect(resolved.parentSku).toBe("LEGACY-PARENT");
    expect(resolved.variantSku).toBe("LEGACY-VAR");
  });
});

describe("evaluateSkuReadinessFromStaging", () => {
  it("blocks when manufacturer SKU would be used as variant SKU", () => {
    const items = evaluateSkuReadinessFromStaging({
      normalizedData: { supplier_sku: "GL-N125F-M" },
      attributes: { size: "m" },
      inferredSize: "M",
      requireVariantSku: true,
    });
    expect(items.some((i) => i.code === "manufacturer_sku_used_as_variant_sku")).toBe(true);
  });
});
