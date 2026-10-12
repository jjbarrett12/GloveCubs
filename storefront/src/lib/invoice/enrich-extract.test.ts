import { describe, expect, it } from "vitest";
import { invoiceExtractResponseSchema } from "@/lib/ai/schemas";
import { enrichExtractWithParser, parseInvoiceDate } from "@/lib/invoice/enrich-extract";

describe("parseInvoiceDate", () => {
  it("keeps a valid invoice date", () => {
    expect(parseInvoiceDate("2024-03-15")).toBe("2024-03-15");
  });

  it("stores unknown dates as null instead of today", () => {
    expect(parseInvoiceDate(null)).toBeNull();
    expect(parseInvoiceDate("")).toBeNull();
    expect(parseInvoiceDate("n/a")).toBeNull();
    expect(parseInvoiceDate("03/15/2024")).toBeNull();
  });
});

describe("enrichExtractWithParser", () => {
  it("parses abbreviated pack and UoM without fabricating missing fields", () => {
    const extract = invoiceExtractResponseSchema.parse({
      vendor_name: "Acme",
      invoice_number: "INV-1",
      invoice_date: "2024-06-01",
      po_number: null,
      subtotal: null,
      discounts: null,
      freight: null,
      tax: null,
      total_amount: 96,
      lines: [
        {
          description: "NITR GLV BLK XL 100/BX",
          quantity: 4,
          unit_price: 24,
          total: 96,
          sku_or_code: null,
        },
      ],
    });
    const enriched = enrichExtractWithParser(extract);
    const ln = enriched.lines[0]!;
    expect(ln.material).toBe("nitrile");
    expect(ln.color).toBe("black");
    expect(ln.size).toBe("xl");
    expect(ln.quantity_uom).toBe("BX");
    expect(ln.gloves_per_box).toBe(100);
    expect(ln.boxes_per_case).toBeNull();
    expect(ln.thickness_mil).toBeNull();
    expect(ln.pack.quantity_uom.source).toBe("parsed");
    expect(ln.specs.material.source).toBe("parsed");
  });

  it("keeps unknown pack fields null", () => {
    const extract = invoiceExtractResponseSchema.parse({
      lines: [
        {
          description: "MISC OFFICE SUPPLY",
          quantity: 1,
          unit_price: 5,
          total: 5,
        },
      ],
    });
    const ln = enrichExtractWithParser(extract).lines[0]!;
    expect(ln.quantity_uom).toBeNull();
    expect(ln.gloves_per_box).toBeNull();
    expect(ln.material).toBeNull();
    expect(ln.pack.quantity_uom.value).toBeNull();
  });
});
