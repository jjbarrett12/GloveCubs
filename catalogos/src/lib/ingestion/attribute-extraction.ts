/**
 * Rules-based attribute extraction for disposable glove products.
 * Parses material, color, size, thickness, powder_free, latex_free, case_qty;
 * infers product_type = disposable_gloves when confidence is strong.
 */

import type { ParsedRow } from "./types";
import type { GloveAttributes, ProductTypeConfidence } from "./types";

const MATERIALS = ["nitrile", "vinyl", "latex", "neoprene", "poly"] as const;
const COLORS = ["blue", "black", "white", "clear", "green", "orange"] as const;
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: unknown): boolean | undefined {
  if (v == null) return undefined;
  const s = str(v);
  if (["1", "true", "yes", "y", "x"].includes(s)) return true;
  if (["0", "false", "no", "n", ""].includes(s)) return false;
  return undefined;
}

/**
 * Extract disposable glove attributes from a raw row.
 * Uses common column names (sku, name, material, color, size, thickness, etc.).
 */
export function extractGloveAttributes(row: ParsedRow): {
  attributes: GloveAttributes;
  productTypeConfidence: ProductTypeConfidence;
} {
  const attributes: GloveAttributes = {};
  const combined = [
    str(row.name),
    str(row.title),
    str(row.description),
    str(row.product_name),
    str(row.material),
    str(row.type),
    str(row.glove_type),
  ].join(" ");

  // Material
  const materialRaw = str(row.material ?? row.type ?? row.glove_type) || combined;
  for (const m of MATERIALS) {
    if (materialRaw.includes(m)) {
      attributes.material = m;
      break;
    }
  }

  // Color
  const colorRaw = str(row.color ?? row.colour) || combined;
  for (const c of COLORS) {
    if (colorRaw.includes(c)) {
      attributes.color = c;
      break;
    }
  }

  // Size: normalize to XS/S/M/L/XL/XXL
  const sizeRaw = str(row.size ?? row.sizes);
  if (sizeRaw) {
    const upper = sizeRaw.toUpperCase().replace(/\s+/g, "");
    for (const s of SIZES) {
      if (upper === s || upper.includes(s)) {
        attributes.size = s;
        break;
      }
    }
    if (!attributes.size && sizeRaw) {
      const u = sizeRaw.toUpperCase();
      if (SIZES.includes(u as (typeof SIZES)[number])) attributes.size = u as GloveAttributes["size"];
    }
  }

  // Thickness (mil)
  const thickness = num(row.thickness ?? row.thickness_mil ?? row.mil) ?? parseMilFromText(combined);
  if (thickness != null && thickness >= 0) attributes.thickness_mil = thickness;

  // Powder free / latex free
  const pf = bool(row.powder_free ?? row["powder-free"] ?? row.powderfree);
  if (pf != null) attributes.powder_free = pf;
  const lf = bool(row.latex_free ?? row["latex-free"] ?? row.latexfree);
  if (lf != null) attributes.latex_free = lf;

  // Case quantity
  const cq = num(row.case_qty ?? row.caseqty ?? row.qty_per_case ?? row.pack_qty);
  if (cq != null && cq >= 1) attributes.case_qty = Math.floor(cq);

  // Infer product_type = disposable_gloves when we have strong signals
  const productTypeConfidence = inferProductTypeConfidence(combined, attributes);
  if (productTypeConfidence >= 0.6) attributes.product_type = "disposable_gloves";

  return { attributes, productTypeConfidence };
}

function parseMilFromText(text: string): number | undefined {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:mil|mil)/i) ?? text.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

function inferProductTypeConfidence(text: string, attrs: GloveAttributes): number {
  let score = 0;
  if (/glove|nitrile|vinyl|latex|exam|disposable/.test(text)) score += 0.3;
  if (attrs.material) score += 0.25;
  if (attrs.color || attrs.size) score += 0.2;
  if (attrs.thickness_mil != null || attrs.powder_free != null) score += 0.25;
  return Math.min(1, score);
}
