import { parseGloveInvoiceLine } from "@invoice-line-parse";
import type { InvoiceExtractResponse, InvoiceLine } from "@/lib/ai/schemas";
import { pickAiThenParsed, provenanced, type Provenanced } from "@/lib/invoice/provenance";

export type EnrichedInvoiceLine = InvoiceLine & {
  pack: {
    quantity_uom: Provenanced<string>;
    gloves_per_box: Provenanced<number>;
    boxes_per_case: Provenanced<number>;
    gloves_per_case: Provenanced<number>;
    pack_notation: Provenanced<string>;
  };
  specs: {
    material: Provenanced<string>;
    color: Provenanced<string>;
    size: Provenanced<string>;
    thickness_mil: Provenanced<number>;
    grade: Provenanced<string>;
    powder: Provenanced<string>;
  };
};

export type EnrichedInvoiceExtract = InvoiceExtractResponse & {
  lines: EnrichedInvoiceLine[];
};

function numOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

export function enrichExtractWithParser(extract: InvoiceExtractResponse): EnrichedInvoiceExtract {
  return {
    ...extract,
    lines: extract.lines.map((ln) => {
      const parsed = parseGloveInvoiceLine(ln.description ?? "");
      return {
        ...ln,
        quantity_uom: ln.quantity_uom ?? parsed.quantity_uom,
        gloves_per_box: ln.gloves_per_box ?? parsed.gloves_per_box,
        boxes_per_case: ln.boxes_per_case ?? parsed.boxes_per_case,
        gloves_per_case: ln.gloves_per_case ?? parsed.gloves_per_case,
        pack_notation: ln.pack_notation ?? parsed.pack_notation,
        material: ln.material ?? parsed.material,
        color: ln.color ?? parsed.color,
        size: ln.size ?? parsed.size,
        thickness_mil: ln.thickness_mil ?? parsed.thickness_mil,
        grade: ln.grade ?? parsed.grade,
        powder: ln.powder ?? parsed.powder,
        texture: ln.texture ?? parsed.texture,
        cuff: ln.cuff ?? parsed.cuff,
        pack: {
          quantity_uom: pickAiThenParsed(ln.quantity_uom, parsed.quantity_uom),
          gloves_per_box: pickAiThenParsed(numOrNull(ln.gloves_per_box), parsed.gloves_per_box),
          boxes_per_case: pickAiThenParsed(numOrNull(ln.boxes_per_case), parsed.boxes_per_case),
          gloves_per_case: pickAiThenParsed(numOrNull(ln.gloves_per_case), parsed.gloves_per_case),
          pack_notation: pickAiThenParsed(ln.pack_notation, parsed.pack_notation),
        },
        specs: {
          material: pickAiThenParsed(ln.material, parsed.material),
          color: pickAiThenParsed(ln.color, parsed.color),
          size: pickAiThenParsed(ln.size, parsed.size),
          thickness_mil: pickAiThenParsed(numOrNull(ln.thickness_mil), parsed.thickness_mil),
          grade: pickAiThenParsed(ln.grade, parsed.grade),
          powder: pickAiThenParsed(ln.powder, parsed.powder),
        },
      };
    }),
  };
}

export function headerProvenance(extract: InvoiceExtractResponse) {
  return {
    vendor_name: provenanced(extract.vendor_name ?? null, "invoice", 0.85),
    invoice_number: provenanced(extract.invoice_number ?? null, "invoice", 0.85),
    invoice_date: provenanced(parseInvoiceDate(extract.invoice_date), "invoice", 0.85),
    po_number: provenanced(extract.po_number ?? null, "invoice", 0.85),
    subtotal: provenanced(numOrNull(extract.subtotal), "invoice", 0.85),
    discounts: provenanced(numOrNull(extract.discounts), "invoice", 0.85),
    freight: provenanced(numOrNull(extract.freight), "invoice", 0.85),
    tax: provenanced(numOrNull(extract.tax), "invoice", 0.85),
    total_amount: provenanced(numOrNull(extract.total_amount), "invoice", 0.85),
  };
}

export function parseInvoiceDate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
