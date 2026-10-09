import { describe, expect, it } from "vitest";
import { evaluateInvoiceLineComparison, type InvoiceLineComparisonInput } from "@/lib/procurement/invoice-line-comparison";
import {
  assertCustomerInvoiceComparisonLineShape,
  customerDtoContainsForbiddenField,
  CUSTOMER_SAVINGS_PROMOTION_MIN_PER_1000_USD,
  toCustomerInvoiceComparisonLine,
  type CustomerProductAvailability,
} from "@/lib/procurement/customer-invoice-comparison";
import { identifyCompetitorProduct, memoryAliasRepo, normalizeCompetitorAlias } from "@/lib/procurement/competitor-identify";
import { classifyGloveCubsSavingsReadiness } from "@/lib/procurement/glovecubs-savings-readiness";
import { parseGloveInvoiceLine } from "@invoice-line-parse";
import { readFileSync } from "node:fs";
import path from "node:path";

const nitrileExam4mil200: InvoiceLineComparisonInput["specs"] = {
  material: "nitrile",
  grade: "exam",
  thickness_mil: 4,
  powder: "powder_free",
  size: "l",
  color: "blue",
};

const sellable: CustomerProductAvailability = {
  catalog_product_id: "gc-prod-1",
  catalog_variant_id: "gc-var-1",
  slug: "glovecubs-nitrile-exam-4mil",
  name: "GloveCubs nitrile exam",
  status: "active",
  variant_is_active: true,
  size_code: "l",
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
    equivalency: { id: "eq-1", status: "approved", catalog_product_id: "gc-prod-1", catalog_variant_id: "gc-var-1" },
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

/** Independent of the engine — first-principles glove economics. */
function handCalc(unitPrice: number, glovesPerUnit: number, qty: number, gcUnit: number, gcGloves: number) {
  const currentPerGlove = unitPrice / glovesPerUnit;
  const gcPerGlove = gcUnit / gcGloves;
  return {
    current_per_glove: currentPerGlove,
    current_per_100: currentPerGlove * 100,
    current_per_1000: currentPerGlove * 1000,
    glovecubs_per_glove: gcPerGlove,
    glovecubs_per_100: gcPerGlove * 100,
    glovecubs_per_1000: gcPerGlove * 1000,
    dollar_savings_per_1000: currentPerGlove * 1000 - gcPerGlove * 1000,
    percent_savings: ((currentPerGlove * 1000 - gcPerGlove * 1000) / (currentPerGlove * 1000)) * 100,
    invoice_dollar_savings: (currentPerGlove - gcPerGlove) * qty * glovesPerUnit,
  };
}

describe("hand-calc vs engine", () => {
  it("A/B box-priced approved match agrees with independent arithmetic", () => {
    const r = evaluateInvoiceLineComparison(baseGood());
    const h = handCalc(20, 200, 4, 16, 200);
    expect(r.savings).not.toBeNull();
    expect(r.savings!.current.per_glove).toBeCloseTo(h.current_per_glove, 10);
    expect(r.savings!.current.per_100).toBeCloseTo(h.current_per_100, 10);
    expect(r.savings!.current.per_1000).toBeCloseTo(h.current_per_1000, 10);
    expect(r.savings!.glovecubs.per_glove).toBeCloseTo(h.glovecubs_per_glove, 10);
    expect(r.savings!.glovecubs.per_100).toBeCloseTo(h.glovecubs_per_100, 10);
    expect(r.savings!.glovecubs.per_1000).toBeCloseTo(h.glovecubs_per_1000, 10);
    expect(r.savings!.dollar_savings_per_1000).toBeCloseTo(h.dollar_savings_per_1000, 10);
    expect(r.savings!.percent_savings).toBeCloseTo(h.percent_savings, 10);
    expect(r.savings!.invoice_dollar_savings).toBeCloseTo(h.invoice_dollar_savings, 10);
  });

  it("C case 100×10 vs 200×5 agrees with independent arithmetic", () => {
    const r = evaluateInvoiceLineComparison(
      baseGood({
        pack: { quantity_uom: "CS", gloves_per_box: 100, boxes_per_case: 10, gloves_per_case: null },
        unit_price: 96,
        line_total: 384,
        quantity: 4,
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
    const h = handCalc(96, 1000, 4, 80, 1000);
    expect(r.savings!.current.per_1000).toBeCloseTo(h.current_per_1000, 10);
    expect(r.savings!.glovecubs.per_1000).toBeCloseTo(h.glovecubs_per_1000, 10);
    expect(r.savings!.dollar_savings_per_1000).toBeCloseTo(h.dollar_savings_per_1000, 10);
  });
});

describe("realistic fixtures → customer DTO", () => {
  it("A/B clear box-priced nitrile: savings_ready with recommendation", () => {
    const comparison = evaluateInvoiceLineComparison(baseGood());
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-a",
      description: baseGood().description,
      comparison,
      product: sellable,
    });
    assertCustomerInvoiceComparisonLineShape(dto);
    expect(dto.status).toBe("savings_ready");
    expect(dto.savings).not.toBeNull();
    expect(dto.recommendation?.slug).toBe("glovecubs-nitrile-exam-4mil");
    expect(customerDtoContainsForbiddenField(dto)).toBe(false);
  });

  it("D abbreviated description still identifies via competitor SKU alias", async () => {
    const parsed = parseGloveInvoiceLine("NITR GLV BLK XL 100/BX");
    expect(parsed.material).toBe("nitrile");
    expect(parsed.color).toBe("black");
    expect(parsed.size).toBe("xl");
    expect(parsed.gloves_per_box).toBe(100);
    expect(parsed.quantity_uom).toBe("BX");
    const repo = memoryAliasRepo([{ type: "sku", normalized: "MDS192086", competitor_product_id: "comp-1" }]);
    const hit = await identifyCompetitorProduct({ sku: "mds192086", description: "NITR GLV BLK XL 100/BX", repo });
    expect(hit?.competitor_product_id).toBe("comp-1");
  });

  it("E missing pack never exposes savings", () => {
    const comparison = evaluateInvoiceLineComparison(
      baseGood({
        pack: { quantity_uom: null, gloves_per_box: null, boxes_per_case: null, gloves_per_case: null },
        competitor: {
          ...baseGood().competitor!,
          pack: { quantity_uom: null, gloves_per_box: null, boxes_per_case: null, gloves_per_case: null },
        },
      }),
    );
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-e",
      description: "Nitrile",
      comparison,
      product: sellable,
    });
    expect(dto.status).toBe("insufficient_information");
    expect(dto.savings).toBeNull();
    expect(dto.recommendation).toBeNull();
  });

  it("F unknown competitor SKU: no recommendation, no savings", () => {
    const comparison = evaluateInvoiceLineComparison({
      description: "mystery gloves",
      quantity: 1,
      unit_price: 20,
      line_total: 20,
      sku: "UNKNOWN-SKU",
      pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
      specs: nitrileExam4mil200,
      competitor: null,
      equivalency: null,
      gloveCubs: null,
    });
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-f",
      description: "mystery gloves",
      comparison,
      product: null,
    });
    expect(dto.status).toBe("no_match");
    expect(dto.savings).toBeNull();
    expect(dto.recommendation).toBeNull();
  });

  it("G wrong material never exposes recommendation", () => {
    const comparison = evaluateInvoiceLineComparison(
      baseGood({
        gloveCubs: { ...baseGood().gloveCubs!, specs: { ...nitrileExam4mil200, material: "vinyl" } },
      }),
    );
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-g",
      description: "Nitrile",
      comparison,
      product: sellable,
    });
    expect(dto.status).toBe("no_match");
    expect(dto.recommendation).toBeNull();
    expect(dto.savings).toBeNull();
  });

  it("H wrong grade never exposes recommendation", () => {
    const comparison = evaluateInvoiceLineComparison(
      baseGood({
        gloveCubs: { ...baseGood().gloveCubs!, specs: { ...nitrileExam4mil200, grade: "general_purpose" } },
      }),
    );
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-h",
      description: "Exam nitrile",
      comparison,
      product: sellable,
    });
    expect(dto.status).toBe("no_match");
    expect(dto.recommendation).toBeNull();
    expect(dto.savings).toBeNull();
  });

  it("I different color remains eligible", () => {
    const comparison = evaluateInvoiceLineComparison(baseGood());
    const color = comparison.explain.match_reasons.find((c) => c.attribute === "color");
    expect(color?.result).toBe("DIFFERENT");
    expect(color?.blocking).toBe(false);
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-i",
      description: baseGood().description,
      comparison,
      product: sellable,
    });
    expect(dto.status).toBe("savings_ready");
    expect(dto.why_this_matches.some((r) => r.attribute === "color" && r.result === "DIFFERENT")).toBe(true);
  });

  it("J price arithmetic conflict is insufficient_information with no savings", () => {
    const comparison = evaluateInvoiceLineComparison(baseGood({ quantity: 4, unit_price: 96, line_total: 10 }));
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-j",
      description: baseGood().description,
      comparison,
      product: sellable,
    });
    expect(dto.status).toBe("insufficient_information");
    expect(dto.savings).toBeNull();
    expect(dto.recommendation).toBeNull();
  });

  it("candidate never exposes savings", () => {
    const comparison = evaluateInvoiceLineComparison(
      baseGood({ equivalency: { id: "eq-1", status: "candidate", catalog_product_id: "gc-prod-1", catalog_variant_id: null } }),
    );
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-cand",
      description: "Nitrile",
      comparison,
      product: sellable,
    });
    expect(dto.status).toBe("reviewing");
    expect(dto.savings).toBeNull();
    expect(dto.recommendation).toBeNull();
  });

  it("rejected equivalent never exposes recommendation", () => {
    const comparison = evaluateInvoiceLineComparison(
      baseGood({ equivalency: { id: "eq-1", status: "rejected", catalog_product_id: "gc-prod-1", catalog_variant_id: null } }),
    );
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-rej",
      description: "Nitrile",
      comparison,
      product: sellable,
    });
    expect(dto.recommendation).toBeNull();
    expect(dto.savings).toBeNull();
    expect(dto.status).toBe("no_match");
  });

  it("inactive product cannot be recommended", () => {
    const comparison = evaluateInvoiceLineComparison(baseGood());
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-inact",
      description: baseGood().description,
      comparison,
      product: { ...sellable, status: "draft" },
    });
    expect(dto.status).toBe("no_match");
    expect(dto.recommendation).toBeNull();
    expect(dto.savings).toBeNull();
  });

  it("negative price difference is verified_match_no_savings, not labeled savings", () => {
    const comparison = evaluateInvoiceLineComparison(
      baseGood({
        gloveCubs: { ...baseGood().gloveCubs!, sell_unit_price: 30 },
      }),
    );
    expect(comparison.savings!.dollar_savings_per_1000).toBeLessThan(0);
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-neg",
      description: baseGood().description,
      comparison,
      product: sellable,
    });
    expect(dto.status).toBe("verified_match_no_savings");
    expect(dto.savings).toBeNull();
    expect(dto.recommendation).not.toBeNull();
  });

  it("tiny savings stay accurate in the engine but are not promoted", () => {
    const comparison = evaluateInvoiceLineComparison(
      baseGood({
        gloveCubs: { ...baseGood().gloveCubs!, sell_unit_price: 19.99 },
      }),
    );
    expect(comparison.savings!.dollar_savings_per_1000).toBeGreaterThan(0);
    expect(comparison.savings!.dollar_savings_per_1000).toBeLessThan(CUSTOMER_SAVINGS_PROMOTION_MIN_PER_1000_USD);
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-tiny",
      description: baseGood().description,
      comparison,
      product: sellable,
    });
    expect(dto.status).toBe("verified_match_no_savings");
    expect(dto.savings).toBeNull();
    expect(dto.recommendation).not.toBeNull();
  });

  it("never serializes forbidden internal fields", () => {
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "line-priv",
      description: baseGood().description,
      comparison: evaluateInvoiceLineComparison(baseGood()),
      product: sellable,
    });
    expect(customerDtoContainsForbiddenField(dto)).toBe(false);
    expect(JSON.stringify(dto)).not.toMatch(/"cost":/);
    expect(JSON.stringify(dto)).not.toMatch(/"evidence":/);
    expect(JSON.stringify(dto)).not.toMatch(/"approved_by":/);
  });
});

describe("operator learning", () => {
  it("approved SKU alias resolves the next invoice without AI", async () => {
    const rows: Array<{ type: "sku"; normalized: string; competitor_product_id: string }> = [];
    const repo = memoryAliasRepo(rows);
    expect(await identifyCompetitorProduct({ sku: "MDS192086", repo })).toBeNull();
    rows.push({ type: "sku", normalized: normalizeCompetitorAlias("sku", "MDS192086"), competitor_product_id: "comp-1" });
    const again = await identifyCompetitorProduct({ sku: "MDS192086", repo });
    expect(again?.identified_by).toBe("sku");
    const comparison = evaluateInvoiceLineComparison(baseGood({ competitor: { ...baseGood().competitor!, identified_by: "sku" } }));
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "second-invoice",
      description: "MDS192086 NITRILE",
      comparison,
      product: sellable,
    });
    expect(dto.status).toBe("savings_ready");
  });
});

describe("GloveCubs product readiness classifier", () => {
  it("requires specs, packaging, sell price, and active variant", () => {
    const ready = classifyGloveCubsSavingsReadiness({
      catalog_product_id: "p1",
      name: "GC",
      slug: "gc",
      status: "active",
      size: "l",
      catalog_variant_id: "v1",
      variant_is_active: true,
      material: "nitrile",
      grade: "exam",
      thickness_mil: 4,
      powder: "powder_free",
      gloves_per_box: 200,
      list_unit_price_major: 16,
    });
    expect(ready.savings_eligible).toBe(true);
    const missing = classifyGloveCubsSavingsReadiness({
      catalog_product_id: "p1",
      name: "GC",
      slug: "gc",
      status: "active",
      size: "l",
      catalog_variant_id: "v1",
      variant_is_active: true,
      material: "nitrile",
      grade: "exam",
      thickness_mil: 4,
      powder: "powder_free",
      gloves_per_box: null,
      list_unit_price_major: 16,
    });
    expect(missing.savings_eligible).toBe(false);
    expect(missing.blockers).toContain("missing_packaging");
  });
});

describe("pricing parity policy", () => {
  it("savings engine uses PA V2 RPC; PDP batch uses the same family", () => {
    const run = readFileSync(path.resolve(__dirname, "invoice-line-comparison-run.ts"), "utf8");
    const pdp = readFileSync(path.resolve(__dirname, "../pricing/variant-pricing-contracts.ts"), "utf8");
    const resolve = readFileSync(path.resolve(__dirname, "../pricing/resolve-buyer-unit-price.ts"), "utf8");
    expect(run).toMatch(/resolveBuyerUnitPriceViaRpc/);
    expect(resolve).toContain("gc_resolve_buyer_unit_price");
    expect(pdp).toContain("gc_resolve_buyer_unit_prices_batch");
    expect(run).not.toMatch(/\bsupplier_cost\b/);
  });
});

describe("customer DTO forged-internal gates", () => {
  const forgedSavings = {
    current: { per_glove: 0.1, per_100: 10, per_1000: 100, per_case: null },
    glovecubs: { per_glove: 0.08, per_100: 8, per_1000: 80, per_case: null },
    dollar_savings_per_1000: 50,
    percent_savings: 20,
    invoice_dollar_savings: 10,
    invoice_glove_count: 800,
  };

  it("candidate snapshot cannot expose savings even if savings object is present", () => {
    const comparison = evaluateInvoiceLineComparison(
      baseGood({ equivalency: { id: "eq-1", status: "candidate", catalog_product_id: "gc-prod-1", catalog_variant_id: null } }),
    );
    const dirty = { ...comparison, savings: forgedSavings };
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "forge-cand",
      description: "Nitrile",
      comparison: dirty,
      product: sellable,
    });
    expect(dto.status).toBe("reviewing");
    expect(dto.savings).toBeNull();
    expect(dto.recommendation).toBeNull();
  });

  it("unknown UoM cannot expose savings even if savings object is present", () => {
    const comparison = evaluateInvoiceLineComparison(
      baseGood({
        pack: { quantity_uom: null, gloves_per_box: null, boxes_per_case: null, gloves_per_case: null },
        competitor: {
          ...baseGood().competitor!,
          pack: { quantity_uom: null, gloves_per_box: null, boxes_per_case: null, gloves_per_case: null },
        },
      }),
    );
    const dirty = { ...comparison, savings: forgedSavings };
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "forge-uom",
      description: "Nitrile",
      comparison: dirty,
      product: sellable,
    });
    expect(dto.status).toBe("insufficient_information");
    expect(dto.savings).toBeNull();
    expect(dto.recommendation).toBeNull();
  });

  it("spec review (missing GC spec) is reviewing, not a recommendation", () => {
    const comparison = evaluateInvoiceLineComparison(
      baseGood({
        gloveCubs: { ...baseGood().gloveCubs!, specs: { ...nitrileExam4mil200, thickness_mil: null } },
      }),
    );
    expect(comparison.trust_status).toBe("spec_review_required");
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "spec-rev",
      description: "Nitrile",
      comparison,
      product: sellable,
    });
    expect(dto.status).toBe("reviewing");
    expect(dto.savings).toBeNull();
    expect(dto.recommendation).toBeNull();
  });

  it("strips cost/evidence/operator fields from a dirty engine snapshot", () => {
    const comparison = evaluateInvoiceLineComparison(baseGood());
    const dirty = {
      ...comparison,
      explain: {
        ...comparison.explain,
        current: {
          ...comparison.explain.current,
          cost: 1.11,
          supplier_cost: 0.9,
          approved_by: "op-1",
          evidence: { prompt: "x" },
        },
      },
    };
    const dto = toCustomerInvoiceComparisonLine({
      line_id: "dirty",
      description: baseGood().description,
      comparison: dirty,
      product: sellable,
    });
    expect(customerDtoContainsForbiddenField(dto)).toBe(false);
    expect(JSON.stringify(dto)).not.toMatch(/"cost":/);
    expect(JSON.stringify(dto)).not.toMatch(/"supplier_cost":/);
    expect(JSON.stringify(dto)).not.toMatch(/"approved_by":/);
  });
});

describe("A case-priced nitrile", () => {
  it("agrees with independent arithmetic", () => {
    const r = evaluateInvoiceLineComparison(
      baseGood({
        pack: { quantity_uom: "CS", gloves_per_box: 100, boxes_per_case: 10, gloves_per_case: 1000 },
        unit_price: 96,
        line_total: 384,
        quantity: 4,
        competitor: {
          ...baseGood().competitor!,
          pack: { quantity_uom: "CS", gloves_per_box: 100, boxes_per_case: 10, gloves_per_case: 1000 },
        },
        gloveCubs: {
          ...baseGood().gloveCubs!,
          pack: { quantity_uom: "CS", gloves_per_box: 100, boxes_per_case: 10, gloves_per_case: 1000 },
          sell_unit_price: 80,
          sell_gloves_per_unit: 1000,
        },
      }),
    );
    const h = handCalc(96, 1000, 4, 80, 1000);
    expect(r.trust_status).toBe("savings_ready");
    expect(r.savings!.dollar_savings_per_1000).toBeCloseTo(h.dollar_savings_per_1000, 10);
    expect(r.savings!.invoice_dollar_savings).toBeCloseTo(h.invoice_dollar_savings, 10);
  });
});
