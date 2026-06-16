import { extractCommercePackagingFromHtml } from "@commerce-packaging/extract";
import { makeFieldEvidence } from "./evidence-helpers";
import type { FieldEvidence } from "./types";

export type CommercePackagingExtractionInput = {
  html: string;
  pageUrl?: string;
  pageText?: string;
  specTable?: Record<string, string>;
  jsonLd?: Record<string, unknown>[];
  metaTags?: Record<string, string>;
  categorySlug?: string | null;
  packTextRaw?: string;
};

export type CommercePackagingExtractionResult = {
  unitsPerCase?: FieldEvidence<number>;
  innersPerCase?: FieldEvidence<number>;
  unitsPerInner?: FieldEvidence<number>;
  unitNoun?: FieldEvidence<string>;
  innerNoun?: FieldEvidence<string>;
  caseLabel?: FieldEvidence<string>;
  packTextRaw?: FieldEvidence<string>;
  parseWarnings: string[];
};

function provConfidence(conf?: number): number {
  if (typeof conf === "number" && Number.isFinite(conf)) return Math.min(1, Math.max(0, conf));
  return 0.75;
}

/** Delegate packaging math to canonical @commerce-packaging/extract and wrap as FieldEvidence. */
export function extractCommercePackagingFields(
  input: CommercePackagingExtractionInput
): CommercePackagingExtractionResult {
  const cp = extractCommercePackagingFromHtml({
    html: input.html,
    pageText: input.pageText ?? input.packTextRaw,
    url: input.pageUrl,
    categorySlug: input.categorySlug ?? "disposable_gloves",
    specTable: input.specTable,
    jsonLd: input.jsonLd,
    metaTags: input.metaTags,
  });

  const result: CommercePackagingExtractionResult = {
    parseWarnings: [...(cp.parse_warnings ?? [])],
  };

  const fp = cp.field_provenance ?? {};

  if (cp.units_per_case != null) {
    const prov = fp.units_per_case;
    result.unitsPerCase = makeFieldEvidence(cp.units_per_case, provConfidence(prov?.confidence), "text", {
      quote: prov?.evidence_text,
      reasons: prov?.source ? [prov.source] : undefined,
    });
  }

  if (cp.inners_per_case != null) {
    const prov = fp.inners_per_case;
    result.innersPerCase = makeFieldEvidence(cp.inners_per_case, provConfidence(prov?.confidence), "table", {
      quote: prov?.evidence_text,
      reasons: prov?.source ? [prov.source] : undefined,
    });
  }

  if (cp.units_per_inner != null) {
    const prov = fp.units_per_inner;
    result.unitsPerInner = makeFieldEvidence(cp.units_per_inner, provConfidence(prov?.confidence), "table", {
      quote: prov?.evidence_text,
      reasons: prov?.source ? [prov.source] : undefined,
    });
  }

  if (cp.unit_noun) {
    result.unitNoun = makeFieldEvidence(cp.unit_noun, 0.8, "heuristic", {
      reasons: ["derived_from_category_and_packaging"],
    });
  }

  if (cp.inner_unit_type) {
    result.innerNoun = makeFieldEvidence(cp.inner_unit_type, 0.78, "heuristic");
  }

  if (cp.case_label) {
    result.caseLabel = makeFieldEvidence(cp.case_label, 0.75, "heuristic", { quote: cp.case_label });
  }

  const rawPack =
    input.packTextRaw?.trim() ||
    fp.units_per_inner?.evidence_text ||
    fp.inners_per_case?.evidence_text ||
    fp.units_per_case?.evidence_text ||
    [input.pageText, fp.units_per_case?.evidence_text].filter(Boolean).join(" ").trim();
  if (rawPack) {
    result.packTextRaw = makeFieldEvidence(rawPack.slice(0, 500), 0.7, "text", {
      quote: rawPack.slice(0, 200),
    });
  }

  return result;
}
