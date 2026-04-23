/**
 * V1 deterministic facet extraction for staging only.
 * Outputs proposals merged into supplier_products_normalized.filter_attributes before publish;
 * never writes catalogos.product_attributes (publish path does that).
 */

import {
  COLOR_VALUES,
  MATERIAL_VALUES,
  PACKAGING_VALUES,
  SIZE_VALUES,
  THICKNESS_MIL_VALUES,
} from "@/lib/catalogos/attribute-dictionary-types";

export const FACET_PARSER_VERSION = "extract_facets_v1";

export type FacetExtractionSourceKind = "quick_add" | "csv_bulk" | "staging_edit";

/** Tier 0/1 inputs only; category is never inferred from text. */
export interface RawProductInput {
  category_slug: string;
  sku?: string | null;
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  specs_text?: string | null;
  source_kind?: FacetExtractionSourceKind;
}

export interface FacetExtractionIssue {
  code: string;
  message: string;
}

export interface FacetExtractionResult {
  proposed: Record<string, unknown>;
  issues: FacetExtractionIssue[];
  confidenceByKey: Record<string, number>;
}

const THICKNESS_SET = new Set<string>(THICKNESS_MIL_VALUES as unknown as string[]);
const MATERIAL_SET = new Set<string>(MATERIAL_VALUES as unknown as string[]);
/** Longest token first for SKU suffix scans. */
const SIZE_TOKENS_SKU = ["XXL", "XL", "XS", "S", "M", "L"] as const;

const SIZE_TOKEN_GROUP = "(xs|xxl|xl|s|m|l)";

/** Glove / catalog context: size tokens are only trusted with this signal (except explicit size: patterns). */
function hasGloveProductContext(text: string): boolean {
  if (/\b(gloves?|glove|nitrile|latex|vinyl|polyethylene|poly\s*ethylene|exam|industrial|disposable)\b/i.test(text))
    return true;
  if (/\bpe\b/i.test(text)) return true;
  // "mil" only counts with a glove material in the same string (avoids film/adhesive copy).
  return /\b(nitrile|latex|vinyl|polyethylene|gloves?|glove)\b.*\bmil\b|\bmil\b.*\b(nitrile|latex|vinyl|polyethylene|gloves?|glove)\b/i.test(
    text
  );
}

/** Block common non-size uses of size-adjacent words. */
function blocksSynonymSize(hay: string): boolean {
  return /\b(medium\s+duty|small\s+talk|large\s+format|large\s+print|large\s+quantity|large\s+order)\b/i.test(hay);
}

interface SizeMatch {
  slug: (typeof SIZE_VALUES)[number];
  confidence: number;
}

function parseSizeToken(tok: string): (typeof SIZE_VALUES)[number] | null {
  const t = tok.toLowerCase();
  return (SIZE_VALUES as readonly string[]).includes(t) ? (t as (typeof SIZE_VALUES)[number]) : null;
}

function pushSize(candidates: SizeMatch[], slug: (typeof SIZE_VALUES)[number] | null, confidence: number) {
  if (slug == null || !Number.isFinite(confidence)) return;
  candidates.push({ slug, confidence });
}

/**
 * Tiered size extraction: explicit labels and parens first (high confidence),
 * then word synonyms only with glove context, then SKU token only with glove context (below auto-merge).
 */
function extractSize(hay: string, sku?: string | null): SizeMatch | null {
  const candidates: SizeMatch[] = [];
  const h = hay.toLowerCase();

  // Tier 1 — explicit / structured (auto-merge safe)
  const sizeLabel = new RegExp(`\\b(?:size|fit)\\s*[:#]?\\s*${SIZE_TOKEN_GROUP}\\b`, "i").exec(hay);
  if (sizeLabel) {
    const slug = parseSizeToken(sizeLabel[1]!);
    pushSize(candidates, slug, 0.95);
  }
  const szAbbr = new RegExp(`\\bsz\\.?\\s*[:#]?\\s*${SIZE_TOKEN_GROUP}\\b`, "i").exec(hay);
  if (szAbbr) {
    const slug = parseSizeToken(szAbbr[1]!);
    pushSize(candidates, slug, 0.94);
  }
  const parenOnly = new RegExp(`\\(\\s*${SIZE_TOKEN_GROUP}\\s*\\)`, "i").exec(hay);
  if (parenOnly) {
    const slug = parseSizeToken(parenOnly[1]!);
    pushSize(candidates, slug, 0.93);
  }
  const dashSize = new RegExp(`(?:^|[\\s,;/])(?:[-–—]\\s+|\\s-\\s)${SIZE_TOKEN_GROUP}\\b`, "i").exec(hay);
  if (dashSize) {
    const slug = parseSizeToken(dashSize[1]!);
    pushSize(candidates, slug, 0.93);
  }

  const ctx = hasGloveProductContext(hay);
  const synOk = ctx && !blocksSynonymSize(hay);

  if (synOk) {
    const syn: Record<string, (typeof SIZE_VALUES)[number]> = {
      small: "s",
      medium: "m",
      large: "l",
      xlarge: "xl",
      "x-large": "xl",
      xxlarge: "xxl",
      "2xl": "xxl",
      "x-small": "xs",
      xsmall: "xs",
    };
    const synEntries = Object.entries(syn).sort((a, b) => b[0].length - a[0].length);
    for (const [phrase, slug] of synEntries) {
      if (new RegExp(`\\b${phrase.replace(/-/g, "\\-")}\\b`, "i").test(h)) {
        pushSize(candidates, slug, 0.92);
        break;
      }
    }
  }

  if (ctx && sku) {
    const s = sku.toUpperCase();
    for (const up of SIZE_TOKENS_SKU) {
      const low = up.toLowerCase() as (typeof SIZE_VALUES)[number];
      if (new RegExp(`[-_/]${up}(?:[-_/]|$)`).test(s) || s.endsWith(up)) {
        pushSize(candidates, low, 0.82);
        break;
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0]!;
}

function joinHaystack(input: RawProductInput): string {
  const parts = [input.name, input.description, input.specs_text, input.sku]
    .map((x) => (x == null ? "" : String(x)))
    .filter(Boolean);
  return parts.join(" \n ");
}

function normWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function matchMaterial(hay: string): (typeof MATERIAL_VALUES)[number] | null {
  const h = hay.toLowerCase();
  if (/\bpe\b|polyethylene|poly\s*ethylene/i.test(h)) {
    if (MATERIAL_SET.has("polyethylene_pe")) return "polyethylene_pe";
  }
  for (const m of MATERIAL_VALUES) {
    if (m === "polyethylene_pe") continue;
    if (new RegExp(`\\b${m.replace(/_/g, "[\\s_-]*")}\\b`, "i").test(h)) return m;
  }
  return null;
}

function matchColor(hay: string): (typeof COLOR_VALUES)[number] | null {
  const h = hay.toLowerCase();
  for (const c of COLOR_VALUES) {
    const pat = c === "light_blue" ? "light\\s*blue|light_blue" : c.replace(/_/g, "[\\s_-]*");
    if (new RegExp(`\\b(${pat})\\b`, "i").test(h)) return c;
  }
  return null;
}

function matchThicknessMil(hay: string): (typeof THICKNESS_MIL_VALUES)[number] | null {
  const m = /(\d+(?:\.\d+)?)\s*mil\b/i.exec(hay);
  if (!m) return null;
  const n = Math.round(Number(m[1]));
  if (!Number.isFinite(n)) return null;
  const key = String(n);
  if (THICKNESS_SET.has(key)) return key as (typeof THICKNESS_MIL_VALUES)[number];
  return null;
}

function matchPowder(hay: string): "powder_free" | "powdered" | null {
  if (/powder\s*free|powder-free|\bpf\b/i.test(hay)) return "powder_free";
  if (/\bpowdered\b|\bwith\s+powder\b/i.test(hay)) return "powdered";
  return null;
}

/** Map numeric units / case to packaging enum when unambiguous (Tier 1). */
function matchPackaging(hay: string): (typeof PACKAGING_VALUES)[number] | null {
  const m =
    /(\d+)\s*(?:\/|\s+per\s+)\s*(cs|case|cases)\b/i.exec(hay) ||
    /(\d+)\s*(?:count|ct|pcs?)\s*(?:\/|\s+per\s+)\s*(?:case|cs)\b/i.exec(hay) ||
    /\bcase\s*(?:of|qty)?\s*[:#]?\s*(\d+)\b/i.exec(hay);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n === 100) return "box_100_ct";
  if (n >= 200 && n <= 250) return "box_200_250_ct";
  if (n === 1000) return "case_1000_ct";
  if (n >= 2000) return "case_2000_plus_ct";
  return null;
}

function matchBrandFromText(hay: string): string | null {
  const m = /\b(?:mfg|manufacturer|brand)\s*[:#]\s*([^\n,;]{2,80})/i.exec(hay);
  if (!m) return null;
  return normWs(m[1]!);
}

/**
 * Deterministic Tier 0/1 extraction. Does not infer category from text.
 */
export function extractFacetsV1(input: RawProductInput): FacetExtractionResult {
  const issues: FacetExtractionIssue[] = [];
  const proposed: Record<string, unknown> = {};
  const confidenceByKey: Record<string, number> = {};

  const hay = joinHaystack(input);
  if (!String(input.category_slug ?? "").trim()) {
    issues.push({ code: "missing_category_slug", message: "category_slug is required on the row before facet extraction." });
  }

  const explicitBrand = input.brand != null && String(input.brand).trim() !== "" ? normWs(String(input.brand)) : null;
  if (explicitBrand) {
    proposed.brand = explicitBrand;
    confidenceByKey.brand = 1;
  } else {
    const inferred = matchBrandFromText(hay);
    if (inferred) {
      proposed.brand = inferred;
      confidenceByKey.brand = 0.85;
    }
  }

  const mat = matchMaterial(hay);
  if (mat) {
    proposed.material = mat;
    confidenceByKey.material = 0.95;
  }

  const col = matchColor(hay);
  if (col) {
    proposed.color = col;
    confidenceByKey.color = 0.9;
  }

  const sz = extractSize(hay, input.sku);
  if (sz) {
    proposed.size = sz.slug;
    confidenceByKey.size = sz.confidence;
  }

  const th = matchThicknessMil(hay);
  if (th) {
    proposed.thickness_mil = th;
    confidenceByKey.thickness_mil = 0.92;
  }

  const pw = matchPowder(hay);
  if (pw) {
    proposed.powder = pw;
    confidenceByKey.powder = 0.9;
  }

  const pk = matchPackaging(hay);
  if (pk) {
    proposed.packaging = pk;
    confidenceByKey.packaging = 0.88;
  } else if (/\d+\s*\/\s*(cs|case)\b/i.test(hay) || /\bper\s+case\b/i.test(hay)) {
    issues.push({
      code: "packaging_unmapped",
      message: "Detected pack/case quantity language but could not map to a known packaging enum.",
    });
  }

  return { proposed, issues, confidenceByKey };
}
