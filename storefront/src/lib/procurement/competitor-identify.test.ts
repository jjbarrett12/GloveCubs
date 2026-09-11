import { describe, expect, it } from "vitest";
import { identifyCompetitorProduct, memoryAliasRepo, normalizeCompetitorAlias } from "@/lib/procurement/competitor-identify";
import { evaluateInvoiceLineComparison } from "@/lib/procurement/invoice-line-comparison";

describe("competitor identify", () => {
  it("known competitor SKU resolves deterministically without AI", async () => {
    const repo = memoryAliasRepo([{ type: "sku", normalized: "MDS192086", competitor_product_id: "comp-1" }]);
    const hit = await identifyCompetitorProduct({ sku: "mds192086", repo });
    expect(hit).toEqual({ competitor_product_id: "comp-1", identified_by: "sku" });
  });

  it("operator-approved alias makes the same SKU resolve on the next invoice", async () => {
    const rows: Array<{ type: "sku"; normalized: string; competitor_product_id: string }> = [];
    const repo = memoryAliasRepo(rows);
    expect(await identifyCompetitorProduct({ sku: "MDS192086", repo })).toBeNull();
    rows.push({ type: "sku", normalized: normalizeCompetitorAlias("sku", "MDS192086"), competitor_product_id: "comp-1" });
    const again = await identifyCompetitorProduct({ sku: "MDS192086", repo });
    expect(again?.competitor_product_id).toBe("comp-1");
  });
});

describe("operator approval → savings", () => {
  it("after equivalency is approved, the same SKU identity can be savings-ready", () => {
    const before = evaluateInvoiceLineComparison({
      description: "NITRILE EXAM",
      quantity: 1,
      unit_price: 20,
      line_total: 20,
      sku: "MDS192086",
      pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
      specs: { material: "nitrile", grade: "exam", thickness_mil: 4, powder: "powder_free", size: "l" },
      competitor: {
        id: "comp-1",
        manufacturer: "Medline",
        brand: "Medline",
        sku: "MDS192086",
        upc_gtin: null,
        product_name: "Medline",
        specs: { material: "nitrile", grade: "exam", thickness_mil: 4, powder: "powder_free", size: "l" },
        pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
        identified_by: "sku",
      },
      equivalency: { id: "eq", status: "candidate", catalog_product_id: "gc-1", catalog_variant_id: null },
      gloveCubs: null,
    });
    expect(before.savings).toBeNull();
    expect(before.block_reason).toBe("candidate_only_substitute");

    const after = evaluateInvoiceLineComparison({
      description: "NITRILE EXAM",
      quantity: 1,
      unit_price: 20,
      line_total: 20,
      sku: "MDS192086",
      pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
      specs: { material: "nitrile", grade: "exam", thickness_mil: 4, powder: "powder_free", size: "l" },
      competitor: {
        id: "comp-1",
        manufacturer: "Medline",
        brand: "Medline",
        sku: "MDS192086",
        upc_gtin: null,
        product_name: "Medline",
        specs: { material: "nitrile", grade: "exam", thickness_mil: 4, powder: "powder_free", size: "l" },
        pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
        identified_by: "operator",
      },
      equivalency: { id: "eq", status: "approved", catalog_product_id: "gc-1", catalog_variant_id: "v1" },
      gloveCubs: {
        catalog_product_id: "gc-1",
        catalog_variant_id: "v1",
        name: "GC",
        sku: "GC-1",
        specs: { material: "nitrile", grade: "exam", thickness_mil: 4, powder: "powder_free", size: "l" },
        pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
        available_sizes: ["l"],
        sell_unit_price: 16,
        sell_gloves_per_unit: 200,
        pricing_source: "gc_resolve_buyer_unit_price",
        published_list_approved: true,
      },
    });
    expect(after.savings).not.toBeNull();
    expect(after.trust_status).toBe("savings_ready");
  });
});
