import { describe, expect, it } from "vitest";
import {
  clusterSkuFamily,
  deriveGloveCubsParentSku,
  deriveGloveCubsVariantSku,
  deriveSkuProposalsFromInput,
  detectSkuCollisionIssues,
  isSafeGloveCubsSkuProposal,
  stripKnownManufacturerGradeSuffix,
  stripKnownSizeSuffix,
  type GloveSkuProposalInput,
} from "./index";

const HOSPECO_SKUS = ["GL-N125F-XS", "GL-N125F-S", "GL-N125F-M", "GL-N125F-L", "GL-N125F-XL"];

function hospecoInput(): GloveSkuProposalInput {
  return {
    productName: "Proworks Nitrile Gloves",
    brand: "Proworks",
    sourceSku: "GL-N125F-L",
    url: "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl",
    variants: ["XS", "S", "M", "L", "XL"].map((code, i) => ({
      size_code: code,
      manufacturer_sku: HOSPECO_SKUS[i]!,
      source_sku: HOSPECO_SKUS[i]!,
    })),
  };
}

describe("deriveSkuProposalsFromInput", () => {
  it("proposes parent and five variant SKUs for Hospeco input", () => {
    const result = deriveSkuProposalsFromInput(hospecoInput());
    expect(result.parent_sku.value).toBe("GLV-GL-N125");
    expect(result.variants).toHaveLength(5);
    expect(result.variants.map((v) => v.proposed_glovecubs_sku)).toEqual([
      "GLV-GL-N125XS",
      "GLV-GL-N125S",
      "GLV-GL-N125M",
      "GLV-GL-N125L",
      "GLV-GL-N125XL",
    ]);
    expect(isSafeGloveCubsSkuProposal(result)).toBe(true);
  });
});

describe("stripKnownSizeSuffix", () => {
  it("strips hyphenated and compact Hospeco suffixes", () => {
    expect(stripKnownSizeSuffix("GL-N125F-L")).toBe("GL-N125F");
    expect(stripKnownSizeSuffix("GL-N125FL")).toBe("GL-N125F");
  });

  it("strips F-base compact suffixes without X/XL collision", () => {
    expect(stripKnownSizeSuffix("N105ORFXL")).toBe("N105ORF");
    expect(stripKnownSizeSuffix("N105ORFX")).toBe("N105ORF");
  });
});

describe("N105ORF family cluster", () => {
  const SKUS = ["N105ORFS", "N105ORFM", "N105ORFL", "N105ORFX", "N105ORFXL"];

  it("clusters to parent base N105ORF with five distinct sizes", () => {
    const cluster = clusterSkuFamily(SKUS);
    expect(cluster?.parentBase).toBe("N105ORF");
    expect(cluster?.sizeCodes).toEqual(expect.arrayContaining(["S", "M", "L", "X", "XL"]));
    expect(cluster?.members).toHaveLength(5);
  });

  it("derives GLV parent from multi-size N105ORF SKUs", () => {
    const proposal = deriveGloveCubsParentSku({ manufacturerSkus: SKUS });
    expect(proposal.value).toBe("GLV-N105ORF");
    expect(proposal.confidence).toBeGreaterThanOrEqual(0.95);
  });
});

describe("stripKnownManufacturerGradeSuffix", () => {
  it("strips F from GL-N125F when allowed", () => {
    expect(stripKnownManufacturerGradeSuffix("GL-N125F", { allowGradeStrip: true })).toBe("GL-N125");
  });
});

describe("deriveGloveCubsParentSku", () => {
  it("derives GLV-GL-N125 from multi-size Hospeco SKUs", () => {
    const proposal = deriveGloveCubsParentSku({
      manufacturerSkus: HOSPECO_SKUS,
      productSku: "GL-N125F-L",
    });
    expect(proposal.value).toBe("GLV-GL-N125");
  });
});

describe("detectSkuCollisionIssues", () => {
  it("flags manufacturer SKU used as variant SKU", () => {
    const issues = detectSkuCollisionIssues({
      parentSku: "GLV-GL-N125",
      variantSkus: ["GL-N125F-M"],
      manufacturerSkusByVariant: ["GL-N125F-M"],
    });
    expect(issues.some((i) => i.code === "manufacturer_sku_used_as_variant_sku")).toBe(true);
  });
});
