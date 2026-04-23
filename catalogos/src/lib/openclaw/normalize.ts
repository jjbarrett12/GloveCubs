/**
 * OpenClaw Step 4: Normalize to site filters only.
 * Uses catalogos filter-attributes as source of truth. No new dimensions.
 */

import {
  normalizeMaterialSite,
  normalizeSizeSite,
  normalizeColorSite,
  normalizeThicknessSite,
  normalizePowderSite,
  normalizeSterilitySite,
  normalizeGradeSite,
  normalizeTextureSite,
  normalizeCuffStyleSite,
  normalizeCategorySite,
} from "./site-filter-ontology";
import type { ExtractedProductFamily, ExtractedField } from "./types";
import type { FieldExtraction } from "./types";

export interface NormalizedFamily {
  source_url: string;
  source_category_path?: string;
  family_name?: string;
  variant_name?: string;
  brand?: string;
  sku?: string;
  material?: string;
  glove_type?: string;
  size?: string;
  color?: string;
  thickness_mil?: string;
  powder_status?: string;
  sterile_status?: string;
  box_qty?: number;
  case_qty?: number;
  texture?: string;
  cuff_style?: string;
  category?: string;
  /** Unmapped / raw content for extraction_notes, raw_specs_json, warning_messages */
  _extracted?: ExtractedProductFamily;
  /** Per-field raw_value, normalized_value, confidence for output */
  _fieldExtraction?: Record<string, FieldExtraction>;
}

function numVal(f: ExtractedField | undefined): number | undefined {
  if (!f) return undefined;
  const v = f.normalized_value ?? f.raw_value;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? undefined : n;
}

function strVal(f: ExtractedField | undefined): string {
  if (!f) return "";
  const v = f.normalized_value ?? f.raw_value;
  return v != null ? String(v).trim() : "";
}

function conf(f: ExtractedField | undefined): number {
  return f?.confidence ?? 0;
}

export function normalizeToOntology(extracted: ExtractedProductFamily): NormalizedFamily {
  const e = extracted;
  const fieldExtraction: Record<string, FieldExtraction> = {};

  const rawMaterial = strVal(e.material);
  const material = rawMaterial ? normalizeMaterialSite(rawMaterial) : "";
  if (rawMaterial) fieldExtraction.material = { raw_value: rawMaterial, normalized_value: material || rawMaterial, confidence: conf(e.material) };

  const rawSize = strVal(e.size);
  const size = rawSize ? normalizeSizeSite(rawSize) : "";
  if (rawSize) fieldExtraction.size = { raw_value: rawSize, normalized_value: size || rawSize, confidence: conf(e.size) };

  const rawColor = strVal(e.color);
  const color = rawColor ? normalizeColorSite(rawColor) : "";
  if (rawColor) fieldExtraction.color = { raw_value: rawColor, normalized_value: color || rawColor, confidence: conf(e.color) };

  const rawThickness = e.thickness_mil ? (numVal(e.thickness_mil) ?? strVal(e.thickness_mil)) : "";
  const thicknessStr = rawThickness !== "" ? normalizeThicknessSite(rawThickness) : "";
  if (rawThickness !== "") fieldExtraction.thickness_mil = { raw_value: rawThickness, normalized_value: thicknessStr || rawThickness, confidence: conf(e.thickness_mil) };

  const rawPowder = strVal(e.powder_status);
  const powder = rawPowder ? normalizePowderSite(rawPowder) : "";
  if (rawPowder) fieldExtraction.powder_status = { raw_value: rawPowder, normalized_value: powder || rawPowder, confidence: conf(e.powder_status) };

  const rawSterile = strVal(e.sterile_status);
  const sterile = rawSterile ? normalizeSterilitySite(rawSterile) : "";
  if (rawSterile) fieldExtraction.sterile_status = { raw_value: rawSterile, normalized_value: sterile || rawSterile, confidence: conf(e.sterile_status) };

  const rawGrade = strVal(e.glove_type as ExtractedField) || strVal(e.grade);
  const gloveType = rawGrade ? normalizeGradeSite(rawGrade) : "";
  if (rawGrade) fieldExtraction.glove_type = { raw_value: rawGrade, normalized_value: gloveType || rawGrade, confidence: conf((e.glove_type ?? e.grade) as ExtractedField | undefined) };

  const rawTexture = strVal(e.texture);
  const texture = rawTexture ? normalizeTextureSite(rawTexture) : "";
  if (rawTexture) fieldExtraction.texture = { raw_value: rawTexture, normalized_value: texture || rawTexture, confidence: conf(e.texture) };

  const rawCuff = strVal(e.cuff_style);
  const cuff = rawCuff ? normalizeCuffStyleSite(rawCuff) : "";
  if (rawCuff) fieldExtraction.cuff_style = { raw_value: rawCuff, normalized_value: cuff || rawCuff, confidence: conf(e.cuff_style) };

  const rawCategory = strVal(e.category);
  const category = normalizeCategorySite(rawCategory || "disposable");
  fieldExtraction.category = { raw_value: rawCategory || "disposable", normalized_value: category, confidence: rawCategory ? 0.8 : 0.5 };

  const boxQty = numVal(e.box_qty);
  if (e.box_qty) fieldExtraction.box_qty = { raw_value: boxQty ?? strVal(e.box_qty), normalized_value: boxQty ?? "", confidence: conf(e.box_qty) };
  const caseQty = numVal(e.case_qty);
  if (e.case_qty) fieldExtraction.case_qty = { raw_value: caseQty ?? strVal(e.case_qty), normalized_value: caseQty ?? "", confidence: conf(e.case_qty) };

  const brandVal = strVal(e.brand);
  if (brandVal) fieldExtraction.brand = { raw_value: brandVal, normalized_value: brandVal, confidence: conf(e.brand) };

  return {
    source_url: e.source_url,
    source_category_path: e.source_category_path,
    family_name: strVal(e.family_name as ExtractedField | undefined) || undefined,
    variant_name: strVal(e.variant_name as ExtractedField | undefined) || undefined,
    brand: brandVal || undefined,
    sku: strVal(e.sku) || undefined,
    material: material || undefined,
    glove_type: gloveType || undefined,
    size: size || undefined,
    color: color || undefined,
    thickness_mil: thicknessStr || undefined,
    powder_status: powder || undefined,
    sterile_status: sterile || undefined,
    box_qty: boxQty ?? undefined,
    case_qty: caseQty ?? undefined,
    texture: texture || undefined,
    cuff_style: cuff || undefined,
    category: category || undefined,
    _extracted: extracted,
    _fieldExtraction: fieldExtraction,
  };
}
