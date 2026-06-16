import { makeFieldEvidence } from "./evidence-helpers";
import { sanitizeParentCopy } from "./sanitize-parent-copy";
import type { FieldEvidence } from "./types";

export type NormalizeUrlProductInput = {
  sourceTitle?: string;
  brand?: string;
  pageTitle?: string;
  ogTitle?: string;
  h1?: string;
  selectedSize?: string;
  availableSizes?: string[];
};

export type NormalizeUrlProductResult = {
  sourceTitle?: FieldEvidence<string>;
  normalizedTitle?: FieldEvidence<string>;
  brand?: FieldEvidence<string>;
};

function pickSourceTitle(input: NormalizeUrlProductInput): string | undefined {
  return (
    input.sourceTitle?.trim() ||
    input.h1?.trim() ||
    input.ogTitle?.trim() ||
    input.pageTitle?.trim() ||
    undefined
  );
}

function stripStoreSuffix(title: string): string {
  const parts = title.split(/\s*[|\-–—]\s*/);
  if (parts.length <= 1) return title.trim();
  const last = parts[parts.length - 1]?.trim() ?? "";
  if (/shop|store|home|official|site|catalog/i.test(last) && last.split(/\s+/).length <= 4) {
    return parts.slice(0, -1).join(" - ").trim();
  }
  return title.trim();
}

function stripDuplicateBrand(title: string, brand?: string): string {
  if (!brand) return title;
  const b = brand.trim();
  if (!b || b.length < 2) return title;
  const re = new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
  if (re.test(title)) return title.replace(re, "").trim();
  return title;
}

/** Light title/brand normalization; preserve meaningful product descriptors. */
export function normalizeUrlProduct(input: NormalizeUrlProductInput): NormalizeUrlProductResult {
  const raw = pickSourceTitle(input);
  if (!raw) return {};

  const sourceTitle = makeFieldEvidence(raw, 0.85, "title", { quote: raw.slice(0, 200) });

  let normalized = stripStoreSuffix(raw);
  normalized = stripDuplicateBrand(normalized, input.brand);
  normalized = normalized.replace(/\s+/g, " ").trim();
  if (!normalized) normalized = raw;

  if (input.selectedSize?.trim()) {
    const sanitized = sanitizeParentCopy({
      title: normalized,
      selectedSize: input.selectedSize,
      availableSizes: input.availableSizes,
    });
    if (sanitized.title && sanitized.removedTokens.length > 0) {
      normalized = sanitized.title;
    }
  }

  const normalizedTitle = makeFieldEvidence(normalized, 0.82, "heuristic", {
    quote: normalized.slice(0, 200),
    reasons: input.selectedSize?.trim()
      ? ["strip_store_suffix", "dedupe_brand_prefix", "sanitize_parent_copy"]
      : ["strip_store_suffix", "dedupe_brand_prefix"],
  });

  const brand = input.brand?.trim()
    ? makeFieldEvidence(input.brand.trim(), 0.8, "meta", { quote: input.brand.trim() })
    : undefined;

  return { sourceTitle, normalizedTitle, brand };
}
