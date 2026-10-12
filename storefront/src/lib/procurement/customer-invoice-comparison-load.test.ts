import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseInvoiceLineComparisonSnapshot } from "@/lib/procurement/customer-invoice-comparison-load";
import { toCustomerInvoiceComparison } from "@/lib/procurement/customer-invoice-comparison";
import { evaluateInvoiceLineComparison } from "@/lib/procurement/invoice-line-comparison";

describe("customer invoice comparison load", () => {
  it("does not select cost or expose comparison_snapshot on the DTO type path", () => {
    const src = readFileSync(path.resolve(__dirname, "customer-invoice-comparison-load.ts"), "utf8");
    expect(src).toContain("toCustomerInvoiceComparison");
    expect(src).not.toMatch(/supplier_cost/);
    expect(src).not.toMatch(/select\(.*cost/i);
    expect(src).toContain("Never pass the result of this function through a layer that merges invoice_lines");
  });

  it("rejects non-comparison JSON", () => {
    expect(parseInvoiceLineComparisonSnapshot({ foo: 1 })).toBeNull();
    expect(parseInvoiceLineComparisonSnapshot(null)).toBeNull();
  });

  it("maps a loaded snapshot through the customer DTO without internal keys", () => {
    const comparison = evaluateInvoiceLineComparison({
      description: "Nitrile exam 4 mil 200/BX",
      quantity: 4,
      unit_price: 20,
      line_total: 80,
      sku: "MDS192086",
      pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
      specs: { material: "nitrile", grade: "exam", thickness_mil: 4, powder: "powder_free", size: "l", color: "blue" },
      competitor: {
        id: "comp-1",
        manufacturer: "Medline",
        brand: "Medline",
        sku: "MDS192086",
        upc_gtin: null,
        product_name: "Medline nitrile exam",
        specs: { material: "nitrile", grade: "exam", thickness_mil: 4, powder: "powder_free", size: "l", color: "blue" },
        pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
        identified_by: "sku",
      },
      equivalency: { id: "eq-1", status: "approved", catalog_product_id: "gc-prod-1", catalog_variant_id: "gc-var-1" },
      gloveCubs: {
        catalog_product_id: "gc-prod-1",
        catalog_variant_id: "gc-var-1",
        name: "GloveCubs nitrile exam",
        sku: "GC-NIT-EX-4",
        specs: { material: "nitrile", grade: "exam", thickness_mil: 4, powder: "powder_free", size: "l", color: "violet" },
        pack: { quantity_uom: "BX", gloves_per_box: 200, boxes_per_case: 10, gloves_per_case: 2000 },
        available_sizes: ["s", "m", "l", "xl"],
        sell_unit_price: 16,
        sell_gloves_per_unit: 200,
        pricing_source: "site_variant_list_x_company_tier_v1",
      },
    });
    const parsed = parseInvoiceLineComparisonSnapshot(JSON.parse(JSON.stringify(comparison)));
    expect(parsed?.trust_status).toBe("savings_ready");
    const dto = toCustomerInvoiceComparison({
      vendor: "Medline",
      invoice_number: "INV-1",
      invoice_date: "2026-01-01",
      lines: [
        {
          line_id: "l1",
          description: "Nitrile exam",
          comparison: parsed!,
          product: {
            catalog_product_id: "gc-prod-1",
            catalog_variant_id: "gc-var-1",
            slug: "glovecubs-nitrile-exam-4mil",
            name: "GloveCubs nitrile exam",
            status: "active",
            variant_is_active: true,
            size_code: "l",
          },
        },
      ],
    });
    expect(dto.lines[0].status).toBe("savings_ready");
    expect(JSON.stringify(dto)).not.toMatch(/"comparison_snapshot":/);
    expect(JSON.stringify(dto)).not.toMatch(/"equivalency_id":/);
    expect(JSON.stringify(dto)).not.toMatch(/"cost":/);
  });
});
