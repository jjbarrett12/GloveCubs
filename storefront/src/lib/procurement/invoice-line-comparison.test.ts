import { describe, expect, it } from "vitest";
import { evaluateInvoiceLineComparison, type InvoiceLineComparisonInput } from "@/lib/procurement/invoice-line-comparison";
import { evaluateCompatibility } from "@/lib/procurement/glove-compatibility";
import { resolveGlovesPerPurchasedUnit } from "@/lib/procurement/invoice-pack-authority";

const nitrileExam4mil200: InvoiceLineComparisonInput["specs"] = {
  material: "nitrile",
  grade: "exam",
  thickness_mil: 4,
  powder: "powder_free",
  size: "l",
  color: "blue",
};

function baseGood(over: Partial<InvoiceLineComparisonInput> = {}): InvoiceLineComparisonInput {
  return {
    description: "Nitrile exam 4 mil 200/BX",
    quantity: 4,
    unit_price: 20,
    line_total: 80,
    sku: "MDS192086",
    pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
    specs: nitrileExam4mil200,
    competitor: {
      id: "comp-1",
      manufacturer: "Medline",
      brand: "Medline",
      sku: "MDS192086",
      upc_gtin: null,
      product_name: "Medline nitrile exam",
      specs: nitrileExam4mil200,
      pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
      identified_by: "sku",
    },
    equivalency: {
      id: "eq-1",
      status: "approved",
      catalog_product_id: "gc-prod-1",
      catalog_variant_id: "gc-var-1",
    },
    gloveCubs: {
      catalog_product_id: "gc-prod-1",
      catalog_variant_id: "gc-var-1",
      name: "GloveCubs nitrile exam",
      sku: "GC-NIT-EX-4",
      specs: { ...nitrileExam4mil200, color: "violet" },
      pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
      available_sizes: ["s", "m", "l", "xl"],
      sell_unit_price: 16,
      sell_gloves_per_unit: 200,
      pricing_source: "site_variant_list_x_company_tier_v1",
      published_list_approved: true,
    },
    ...over,
  };
}

describe("pack authority", () => {
  it("does not infer missing box count", () => {
    const r = resolveGlovesPerPurchasedUnit({
      quantity_uom: "BX",
      gloves_per_box: null,
      boxes_per_case: 10,
      gloves_per_case: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UOM_REVIEW_REQUIRED");
  });

  it("treats 100×10 and 200×5 as 1000 gloves/case", () => {
    const a = resolveGlovesPerPurchasedUnit({
      quantity_uom: "CS",
      gloves_per_box: 100,
      boxes_per_case: 10,
      gloves_per_case: null,
    });
    const b = resolveGlovesPerPurchasedUnit({
      quantity_uom: "CS",
      gloves_per_box: 200,
      boxes_per_case: 5,
      gloves_per_case: null,
    });
    expect(a.ok && a.gloves_per_purchased_unit).toBe(1000);
    expect(b.ok && b.gloves_per_purchased_unit).toBe(1000);
  });
});

describe("evaluateInvoiceLineComparison", () => {
  it("GOOD MATCH: approved equivalency + complete UoM calculates savings", () => {
    const r = evaluateInvoiceLineComparison(baseGood());
    expect(r.trust_status).toBe("savings_ready");
    expect(r.savings).not.toBeNull();
    expect(r.block_reason).toBeNull();
    expect(r.savings!.current.per_1000).toBeCloseTo(100, 6);
    expect(r.savings!.glovecubs.per_1000).toBeCloseTo(80, 6);
    expect(r.savings!.dollar_savings_per_1000).toBeCloseTo(20, 6);
    expect(r.explain.match_reasons.some((c) => c.attribute === "color" && c.result === "DIFFERENT" && !c.blocking)).toBe(
      true,
    );
  });

  it("WRONG MATERIAL: nitrile vs vinyl blocks savings", () => {
    const r = evaluateInvoiceLineComparison(
      baseGood({
        gloveCubs: {
          ...baseGood().gloveCubs!,
          specs: { ...nitrileExam4mil200, material: "vinyl" },
        },
      }),
    );
    expect(r.savings).toBeNull();
    expect(r.block_reason).toBe("material_incompatible");
    expect(r.trust_status).toBe("incompatible");
  });

  it("WRONG GRADE: exam vs general purpose blocks savings", () => {
    const r = evaluateInvoiceLineComparison(
      baseGood({
        gloveCubs: {
          ...baseGood().gloveCubs!,
          specs: { ...nitrileExam4mil200, grade: "general_purpose" },
        },
      }),
    );
    expect(r.savings).toBeNull();
    expect(r.block_reason).toBe("grade_incompatible");
  });

  it("UNKNOWN UOM: pack unknown → savings null", () => {
    const r = evaluateInvoiceLineComparison(
      baseGood({
        pack: { quantity_uom: null, gloves_per_box: null, boxes_per_case: null, gloves_per_case: null },
        competitor: {
          ...baseGood().competitor!,
          pack: { quantity_uom: null, gloves_per_box: null, boxes_per_case: null, gloves_per_case: null },
        },
      }),
    );
    expect(r.savings).toBeNull();
    expect(r.trust_status).toBe("uom_review_required");
    expect(r.block_reason === "unknown_uom" || r.block_reason === "unknown_packaging").toBe(true);
  });

  it("UNKNOWN SELL PRICE: compatible but no PA V2 price → savings null", () => {
    const r = evaluateInvoiceLineComparison(
      baseGood({
        gloveCubs: { ...baseGood().gloveCubs!, sell_unit_price: null, sell_gloves_per_unit: null },
      }),
    );
    expect(r.savings).toBeNull();
    expect(r.block_reason).toBe("missing_authoritative_sell_price");
  });

  it("100/box vs 200/box normalizes per 1,000", () => {
    const current100 = evaluateInvoiceLineComparison(
      baseGood({
        pack: { quantity_uom: "BX", gloves_per_box: 100, boxes_per_case: 10, gloves_per_case: 1000 },
        competitor: {
          ...baseGood().competitor!,
          pack: { quantity_uom: "BX", gloves_per_box: 100, boxes_per_case: 10, gloves_per_case: 1000 },
        },
        unit_price: 10,
        line_total: 40,
        gloveCubs: {
          ...baseGood().gloveCubs!,
          pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 5, gloves_per_case: 1000 },
          sell_unit_price: 16,
          sell_gloves_per_unit: 200,
        },
      }),
    );
    expect(current100.savings!.current.per_1000).toBeCloseTo(100, 6);
    expect(current100.savings!.glovecubs.per_1000).toBeCloseTo(80, 6);
  });

  it("CASE PACK: 100×10 vs 200×5 compare as 1,000 gloves/case", () => {
    const r = evaluateInvoiceLineComparison(
      baseGood({
        pack: { quantity_uom: "CS", gloves_per_box: 100, boxes_per_case: 10, gloves_per_case: null },
        unit_price: 96,
        line_total: 384,
        competitor: {
          ...baseGood().competitor!,
          pack: { quantity_uom: "CS", gloves_per_box: 100, boxes_per_case: 10, gloves_per_case: null },
        },
        gloveCubs: {
          ...baseGood().gloveCubs!,
          pack: { quantity_uom: "CS", gloves_per_box: 200, boxes_per_case: 5, gloves_per_case: null },
          sell_unit_price: 80,
          sell_gloves_per_unit: 1000,
        },
      }),
    );
    expect(r.savings).not.toBeNull();
    expect(r.savings!.current.per_1000).toBeCloseTo(96, 6);
    expect(r.savings!.glovecubs.per_1000).toBeCloseTo(80, 6);
  });

  it("FUZZY DESCRIPTION ONLY: candidate, no savings", () => {
    const r = evaluateInvoiceLineComparison({
      description: "blue gloves large",
      quantity: 4,
      unit_price: 20,
      line_total: 80,
      sku: null,
      pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
      specs: nitrileExam4mil200,
      competitor: null,
      equivalency: null,
      gloveCubs: null,
      catalogos_candidate: { catalog_product_id: "gc-maybe", match_reason: "fuzzy_title" },
    });
    expect(r.trust_status).toBe("candidate_match");
    expect(r.savings).toBeNull();
    expect(r.block_reason).toBe("equivalency_not_approved");
  });

  it("OPERATOR / SKU: candidate equivalency cannot produce savings", () => {
    const r = evaluateInvoiceLineComparison(baseGood({ equivalency: { id: "eq-1", status: "candidate", catalog_product_id: "gc-prod-1", catalog_variant_id: null } }));
    expect(r.savings).toBeNull();
    expect(r.block_reason).toBe("candidate_only_substitute");
  });

  it("PRICE ARITHMETIC CONFLICT: qty × unit disagrees with line total", () => {
    const r = evaluateInvoiceLineComparison(baseGood({ quantity: 4, unit_price: 96, line_total: 10 }));
    expect(r.trust_status).toBe("price_review_required");
    expect(r.savings).toBeNull();
    expect(r.block_reason).toBe("price_arithmetic_conflict");
  });

  it("unapproved published list blocks savings", () => {
    const r = evaluateInvoiceLineComparison(
      baseGood({
        gloveCubs: { ...baseGood().gloveCubs!, published_list_approved: false },
      }),
    );
    expect(r.savings).toBeNull();
    expect(r.block_reason).toBe("missing_authoritative_sell_price");
  });
});

describe("compatibility thickness", () => {
  it("3 mil vs 5 mil is a hard mismatch", () => {
    const v = evaluateCompatibility({
      current: { material: "nitrile", grade: "exam", thickness_mil: 3, powder: "powder_free", size: "m" },
      gloveCubs: { material: "nitrile", grade: "exam", thickness_mil: 5, powder: "powder_free", size: "m" },
      gloveCubsAvailableSizes: ["m"],
    });
    expect(v.verdict).toBe("incompatible");
  });
});

describe("sell price authority", () => {
  it("blocks savings when published list is not approved", () => {
    const r = evaluateInvoiceLineComparison(
      baseGood({
        gloveCubs: { ...baseGood().gloveCubs!, published_list_approved: false },
      }),
    );
    expect(r.block_reason).toBe("missing_authoritative_sell_price");
  });
});
