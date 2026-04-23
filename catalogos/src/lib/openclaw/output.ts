/**
 * OpenClaw Step 7: Build flat row-per-variant output (site-filter fields only).
 */

import type { NormalizedFamily } from "./normalize";
import type { RowWarnings } from "./types";
import type { GloveCatalogRow } from "./types";

function s(v: string | number | undefined): string {
  return v != null ? String(v) : "";
}

export function buildCatalogRow(
  normalized: NormalizedFamily,
  warnings: RowWarnings,
  options: {
    raw_title?: string;
    raw_description?: string;
    raw_specs_json?: string;
    extraction_notes?: string;
    family_group_key?: string;
    variant_group_key?: string;
  } = {}
): GloveCatalogRow {
  return {
    source_url: normalized.source_url,
    family_name: normalized.family_name ?? "",
    variant_name: normalized.variant_name ?? normalized.family_name ?? "",
    sku: s(normalized.sku),
    brand: s(normalized.brand),
    material: s(normalized.material),
    glove_type: s(normalized.glove_type),
    size: s(normalized.size),
    color: s(normalized.color),
    thickness_mil: s(normalized.thickness_mil),
    powder_status: s(normalized.powder_status),
    sterile_status: s(normalized.sterile_status),
    box_qty: s(normalized.box_qty),
    case_qty: s(normalized.case_qty),
    texture: s(normalized.texture),
    cuff_style: s(normalized.cuff_style),
    category: s(normalized.category),
    overall_confidence: warnings.overall_confidence,
    needs_review: warnings.needs_review,
    warning_messages: warnings.warning_messages.join(" | "),
    raw_title: options.raw_title ?? "",
    raw_description: options.raw_description ?? "",
    raw_specs_json: options.raw_specs_json ?? "",
    extraction_notes: options.extraction_notes ?? "",
    field_extraction: normalized._fieldExtraction,
    family_group_key: options.family_group_key,
    variant_group_key: options.variant_group_key,
  };
}

export function setGroupKeys(row: GloveCatalogRow, familyKey: string, variantKey: string): void {
  row.family_group_key = familyKey;
  row.variant_group_key = variantKey;
}
