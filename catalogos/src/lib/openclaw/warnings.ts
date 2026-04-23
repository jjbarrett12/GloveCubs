/**
 * OpenClaw Step 6: Generate review flags and confidence per row.
 */

import { OPENCLAW_CONFIG } from "./config";
import type { NormalizedFamily } from "./normalize";
import type { RowWarnings, WarningCode } from "./types";

export function computeRowWarnings(normalized: NormalizedFamily): RowWarnings {
  const codes: WarningCode[] = [];
  const messages: string[] = [];
  let confidenceSum = 0;
  let confidenceCount = 0;

  if (!normalized.material) {
    codes.push("missing_material");
    messages.push("Material missing or not recognized");
  } else {
    confidenceSum += 0.9;
    confidenceCount++;
  }
  if (!normalized.size) {
    codes.push("missing_size");
    messages.push("Size missing or not recognized");
  } else {
    confidenceSum += 0.9;
    confidenceCount++;
  }
  if (normalized.box_qty == null || normalized.box_qty <= 0) {
    codes.push("missing_pack_quantity");
    messages.push("Box quantity missing");
  } else {
    confidenceSum += 0.85;
    confidenceCount++;
  }
  if (normalized.case_qty == null || normalized.case_qty <= 0) {
    codes.push("missing_case_quantity");
    messages.push("Case quantity missing");
  } else {
    confidenceSum += 0.85;
    confidenceCount++;
  }
  const thicknessStr = normalized.thickness_mil;
  if (!thicknessStr && normalized._extracted?.family_name && String(normalized._extracted.family_name).toLowerCase().includes("mil")) {
    codes.push("thickness_ambiguous");
    messages.push("Thickness mentioned but not parsed");
  } else if (thicknessStr) {
    confidenceSum += 0.85;
    confidenceCount++;
  }
  if (!normalized.sku) {
    codes.push("missing_required_attributes");
    messages.push("SKU missing");
  } else {
    confidenceSum += 0.9;
    confidenceCount++;
  }

  if (normalized.powder_status && normalized.sterile_status) {
    const pow = normalized.powder_status.toLowerCase();
    const ster = normalized.sterile_status.toLowerCase();
    if ((pow === "unknown" || !pow) && (ster === "unknown" || !ster)) {
      codes.push("conflicting_powder_sterile");
      messages.push("Powder/sterile status unclear");
    }
  }

  const overallConfidence = confidenceCount > 0 ? confidenceSum / Math.max(confidenceCount, 1) : 0.5;
  const needsReview =
    overallConfidence < OPENCLAW_CONFIG.needs_review_threshold || codes.length > 2;

  return {
    needs_review: needsReview,
    warning_codes: codes,
    warning_messages: messages,
    overall_confidence: Math.round(overallConfidence * 100) / 100,
  };
}
