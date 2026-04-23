/**
 * OpenClaw Step 3: Extract glove attributes from parsed pages (with confidence + method).
 */

import type {
  ParsedProductPage,
  ExtractedProductFamily,
  ExtractedField,
  ExtractionMethod,
} from "./types";

function field(
  raw: unknown,
  normalized: unknown,
  confidence: number,
  method: ExtractionMethod
): ExtractedField {
  return { raw_value: raw, normalized_value: normalized, confidence, extraction_method: method };
}

function fromSpec(key: string, spec: Record<string, string>, keyAliases: string[]): string | undefined {
  const k = key.toLowerCase();
  for (const alias of keyAliases) {
    const v = spec[alias] ?? spec[alias.replace(/\s/g, "_")];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  for (const [specKey, val] of Object.entries(spec)) {
    if (specKey.toLowerCase().includes(k) && val != null && String(val).trim()) return String(val).trim();
  }
  return undefined;
}

const MATERIAL_PATTERNS: [RegExp, string][] = [
  [/nitrile/i, "nitrile"],
  [/latex|natural\s*rubber/i, "latex"],
  [/vinyl|pvc/i, "vinyl"],
  [/polyethylene|poly\s*glove|\bpe\b/i, "polyethylene"],
  [/neoprene|chloroprene/i, "neoprene"],
  [/blend|hybrid/i, "blend"],
];

const SIZE_PATTERNS: [RegExp, string][] = [
  [/\bxs\b|extra\s*small|x-small/i, "XS"],
  [/\bsmall\b|\bs\b(?!terile|pecial)/i, "S"],
  [/\bmedium\b|\bmed\b|\bm\b/i, "M"],
  [/\blarge\b|\blg\b|\bl\b/i, "L"],
  [/\bxl\b|x-?large|extra\s*large/i, "XL"],
  [/\bxxl\b|2xl|xx-?large/i, "XXL"],
  [/\bxxxl\b|3xl/i, "XXXL"],
];

const POWDER_PATTERNS: [RegExp, string][] = [
  [/powder\s*free|powder-free|pf\b/i, "powder_free"],
  [/powdered|with\s*powder/i, "powdered"],
];

function inferFromText(text: string): { material?: string; size?: string; powder?: string } {
  const out: { material?: string; size?: string; powder?: string } = {};
  for (const [re, val] of MATERIAL_PATTERNS) {
    if (re.test(text)) {
      out.material = val;
      break;
    }
  }
  for (const [re, val] of SIZE_PATTERNS) {
    if (re.test(text)) {
      out.size = val;
      break;
    }
  }
  for (const [re, val] of POWDER_PATTERNS) {
    if (re.test(text)) {
      out.powder = val;
      break;
    }
  }
  return out;
}

function parseThickness(text: string): number | undefined {
  const m = text.match(/(\d+(?:\.\d+)?)\s*mil|(\d+(?:\.\d+)?)\s*mil\s*thick|thickness[:\s]*(\d+)/i);
  if (m) return parseFloat(m[1] ?? m[2] ?? m[3] ?? "0");
  const m2 = text.match(/\b(\d)\s*mil\b/i);
  if (m2) return parseFloat(m2[1]);
  return undefined;
}

export function extractFromParsedPage(
  parsed: ParsedProductPage,
  sourceSupplier: string,
  sourceCategoryPath: string
): ExtractedProductFamily {
  const spec = parsed.spec_table ?? {};
  const text = [parsed.product_title, parsed.description, parsed.raw_html_snippet].filter(Boolean).join(" ");
  const inferred = inferFromText(text);
  const fam: ExtractedProductFamily = {
    source_url: parsed.url,
    source_category_path: sourceCategoryPath,
    family_name: parsed.product_title ?? undefined,
    variant_name: parsed.product_title ?? undefined,
  };

  const skuVal = parsed.sku ?? fromSpec("sku", spec, ["sku", "item number", "item no", "part number"]);
  if (skuVal) fam.sku = field(skuVal, skuVal, 0.95, "exact_text");

  const mpnVal = parsed.mpn ?? fromSpec("mpn", spec, ["mpn", "mfg part", "manufacturer part"]);
  if (mpnVal) fam.mpn = field(mpnVal, mpnVal, 0.9, "table_parse");

  if (parsed.brand) fam.brand = field(parsed.brand, parsed.brand, 0.9, "exact_text");
  fam.supplier_name = field(sourceSupplier, sourceSupplier, 0.7, "inference");

  const materialVal = fromSpec("material", spec, ["material", "composition", "glove material"]) ?? inferred.material;
  if (materialVal) fam.material = field(materialVal, materialVal, inferred.material ? 0.75 : 0.9, inferred.material ? "inference" : "table_parse");

  const sizeVal = fromSpec("size", spec, ["size", "glove size"]) ?? inferred.size;
  if (sizeVal) fam.size = field(sizeVal, sizeVal, inferred.size ? 0.7 : 0.9, inferred.size ? "pattern_match" : "table_parse");

  const thicknessVal = parseThickness(text) ?? (spec["thickness"] ?? spec["mil"]) ? parseFloat(String(spec["thickness"] ?? spec["mil"] ?? 0)) : undefined;
  if (thicknessVal != null && !Number.isNaN(thicknessVal))
    fam.thickness_mil = field(thicknessVal, thicknessVal, 0.85, spec["thickness"] || spec["mil"] ? "table_parse" : "pattern_match");

  const powderVal = fromSpec("powder", spec, ["powder", "powder free"]) ?? inferred.powder;
  if (powderVal) fam.powder_status = field(powderVal, powderVal, 0.85, "table_parse");

  const sterileVal = fromSpec("sterile", spec, ["sterile", "sterility"]);
  if (sterileVal) fam.sterile_status = field(sterileVal, sterileVal, 0.9, "table_parse");

  const boxQty = spec["box qty"] ?? spec["per box"] ?? spec["gloves per box"] ?? spec["quantity"];
  if (boxQty) fam.box_qty = field(boxQty, boxQty, 0.85, "table_parse");
  const caseQty = spec["case qty"] ?? spec["per case"] ?? spec["units per case"];
  if (caseQty) fam.case_qty = field(caseQty, caseQty, 0.85, "table_parse");

  if (parsed.description) fam.description_clean = field(parsed.description, parsed.description, 0.8, "exact_text");
  if (parsed.images?.length) fam.image_url = field(parsed.images[0], parsed.images[0], 0.9, "exact_text");

  fam.category = field("disposable_gloves", "disposable_gloves", 0.6, "inference");

  return fam;
}
