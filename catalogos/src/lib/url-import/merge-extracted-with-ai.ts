/**
 * Merge OpenAI HTML enrich patch into deterministic ExtractedProductFamily.
 * Rules: never overwrite ≥0.85; overwrite <0.70; fill missing; never touch sku / brand / mpn.
 */

import type { ExtractedField, ExtractedProductFamily, ExtractionMethod } from "@/lib/openclaw/types";
import type { HtmlAiProductPatch } from "./html-product-ai-enrich";

const AI_METHOD: ExtractionMethod = "ai_semantic";

const PROTECTED_KEYS = new Set<string>(["sku", "brand", "mpn"]);

/** Fields considered for “low confidence” trigger (excludes category — deterministic category is often ~0.6). */
export const HTML_AI_CONFIDENCE_MONITORED_KEYS = [
  "material",
  "size",
  "color",
  "thickness_mil",
  "powder_status",
  "sterile_status",
  "glove_type",
  "grade",
  "texture",
  "cuff_style",
  "box_qty",
  "case_qty",
] as const;

export type HtmlAiMonitoredKey = (typeof HTML_AI_CONFIDENCE_MONITORED_KEYS)[number];

const REQUIRED_KEYS: (keyof ExtractedProductFamily)[] = ["material", "size"];

const THRESH_LOW = 0.7;
const THRESH_HIGH = 0.85;

function strFromField(f: ExtractedField | undefined): string {
  if (!f) return "";
  const v = f.normalized_value ?? f.raw_value;
  if (v == null) return "";
  return String(v).trim();
}

function conf(f: ExtractedField | undefined): number {
  return f?.confidence ?? 0;
}

function fieldFromAi(
  raw: unknown,
  normalized: unknown,
  fieldKey: string,
  patch: HtmlAiProductPatch
): ExtractedField {
  const fc = patch.field_confidence?.[fieldKey];
  const c =
    typeof fc === "number" && Number.isFinite(fc) ? Math.min(0.85, Math.max(0, fc)) : 0.72;
  return {
    raw_value: raw,
    normalized_value: normalized,
    confidence: c,
    extraction_method: AI_METHOD,
  };
}

/** True when material or size is absent after extraction. */
export function htmlAiRequiredFieldsMissing(extracted: ExtractedProductFamily): boolean {
  for (const k of REQUIRED_KEYS) {
    const f = extracted[k] as ExtractedField | undefined;
    if (!strFromField(f)) return true;
  }
  return false;
}

/**
 * Call HTML AI when required attributes are missing OR any monitored field present has confidence < 0.70.
 * If every present monitored field is ≥ 0.85 and required fields exist, returns false (no AI).
 */
export function shouldCallHtmlAi(extracted: ExtractedProductFamily): boolean {
  if (htmlAiRequiredFieldsMissing(extracted)) return true;
  for (const k of HTML_AI_CONFIDENCE_MONITORED_KEYS) {
    const f = extracted[k as keyof ExtractedProductFamily] as ExtractedField | undefined;
    if (!f) continue;
    if (strFromField(f) === "") continue;
    if (conf(f) < THRESH_LOW) return true;
  }
  return false;
}

/**
 * When required fields exist and every populated monitored field is ≥ 0.85, skip the HTML AI call.
 */
export function shouldSkipHtmlAiAllStrong(extracted: ExtractedProductFamily): boolean {
  if (htmlAiRequiredFieldsMissing(extracted)) return false;
  for (const k of HTML_AI_CONFIDENCE_MONITORED_KEYS) {
    const f = extracted[k as keyof ExtractedProductFamily] as ExtractedField | undefined;
    if (!f || strFromField(f) === "") continue;
    if (conf(f) < THRESH_HIGH) return false;
  }
  return true;
}

function shouldApplyAiToField(existing: ExtractedField | undefined): "fill" | "replace" | "skip" {
  if (!existing || strFromField(existing) === "") return "fill";
  const c = conf(existing);
  if (c >= THRESH_HIGH) return "skip";
  if (c < THRESH_LOW) return "replace";
  return "skip";
}

export interface HtmlAiExtractionProvenance {
  applied_fields: string[];
  skipped_high_confidence: string[];
  model?: string;
  at: string;
}

export function mergeExtractedWithAiPatch(
  extracted: ExtractedProductFamily,
  patch: HtmlAiProductPatch,
  meta: { model?: string }
): {
  merged: ExtractedProductFamily;
  appliedFields: string[];
  provenance: HtmlAiExtractionProvenance;
} {
  const merged: ExtractedProductFamily = { ...extracted };
  const appliedFields: string[] = [];
  const skippedHigh: string[] = [];

  const tryApply = (familyKey: keyof ExtractedProductFamily, next: ExtractedField | undefined) => {
    if (PROTECTED_KEYS.has(String(familyKey)) || next == null) return;
    const cur = merged[familyKey] as ExtractedField | undefined;
    const mode = shouldApplyAiToField(cur);
    if (mode === "skip") {
      if (cur && strFromField(cur) !== "" && conf(cur) >= THRESH_HIGH) skippedHigh.push(String(familyKey));
      return;
    }
    merged[familyKey] = next;
    appliedFields.push(String(familyKey));
  };

  const p = patch;

  if (p.material != null && String(p.material).trim()) {
    const s = String(p.material).trim();
    tryApply("material", fieldFromAi(s, s, "material", p));
  }
  if (p.size != null && String(p.size).trim()) {
    const s = String(p.size).trim();
    tryApply("size", fieldFromAi(s, s, "size", p));
  }
  if (p.color != null && String(p.color).trim()) {
    const s = String(p.color).trim();
    tryApply("color", fieldFromAi(s, s, "color", p));
  }
  if (p.thickness_mil != null && String(p.thickness_mil).trim() !== "") {
    const n = typeof p.thickness_mil === "number" ? p.thickness_mil : parseFloat(String(p.thickness_mil).replace(/[^\d.]/g, ""));
    if (Number.isFinite(n)) {
      tryApply("thickness_mil", fieldFromAi(n, n, "thickness_mil", p));
    }
  }
  if (p.powder_status != null && String(p.powder_status).trim()) {
    const s = String(p.powder_status).trim();
    tryApply("powder_status", fieldFromAi(s, s, "powder_status", p));
  }
  if (p.sterile_status != null && String(p.sterile_status).trim()) {
    const s = String(p.sterile_status).trim();
    tryApply("sterile_status", fieldFromAi(s, s, "sterile_status", p));
  }
  if (p.glove_type != null && String(p.glove_type).trim()) {
    const s = String(p.glove_type).trim();
    tryApply("glove_type", fieldFromAi(s, s, "glove_type", p));
  }
  if (p.texture != null && String(p.texture).trim()) {
    const s = String(p.texture).trim();
    tryApply("texture", fieldFromAi(s, s, "texture", p));
  }
  if (p.cuff_style != null && String(p.cuff_style).trim()) {
    const s = String(p.cuff_style).trim();
    tryApply("cuff_style", fieldFromAi(s, s, "cuff_style", p));
  }
  if (p.box_qty != null && Number.isFinite(Number(p.box_qty))) {
    const n = Math.round(Number(p.box_qty));
    tryApply("box_qty", fieldFromAi(n, n, "box_qty", p));
  }
  if (p.case_qty != null && Number.isFinite(Number(p.case_qty))) {
    const n = Math.round(Number(p.case_qty));
    tryApply("case_qty", fieldFromAi(n, n, "case_qty", p));
  }
  if (p.category_hint != null && String(p.category_hint).trim()) {
    const s = String(p.category_hint).trim();
    tryApply("category", fieldFromAi(s, s, "category_hint", p));
  }
  if (p.use_case_tags && p.use_case_tags.length) {
    const raw = p.use_case_tags;
    const joined = raw.join("; ");
    tryApply("use_case_tags", fieldFromAi(raw, joined, "use_case_tags", p));
  }
  if (p.compliance_tags && p.compliance_tags.length) {
    const raw = p.compliance_tags;
    const joined = raw.join("; ");
    tryApply("compliance_tags", fieldFromAi(raw, joined, "compliance_tags", p));
  }

  return {
    merged,
    appliedFields: [...new Set(appliedFields)],
    provenance: {
      applied_fields: [...new Set(appliedFields)],
      skipped_high_confidence: skippedHigh,
      model: meta.model,
      at: new Date().toISOString(),
    },
  };
}
