import { normalizeCommercePackaging, deriveUnitNoun } from "./labels";
import {
  CASE_PRICE_PATTERNS,
  CASES_PER_PALLET_PATTERNS,
  INNERS_PER_CASE_PATTERNS,
  PALLET_PRICE_PATTERNS,
  SLASH_INNER_CASE_PATTERNS,
  SPEC_TABLE_INNER_CASE_KEYS,
  SPEC_TABLE_INNER_KEYS,
  SPEC_TABLE_PALLET_KEYS,
  UNITS_PER_CASE_PATTERNS,
  UNITS_PER_INNER_PATTERNS,
  type PatternDef,
} from "./patterns";
import type {
  CommercePackagingV1,
  InnerUnitType,
  PackagingFieldKey,
  PackagingFieldProvenance,
  PackagingSource,
} from "./types";

export type ExtractCommercePackagingInput = {
  html?: string;
  pageText?: string;
  url?: string;
  categorySlug?: string | null;
  specTable?: Record<string, string>;
  jsonLd?: Record<string, unknown>[];
  metaTags?: Record<string, string>;
};

type Candidate = {
  field: PackagingFieldKey | "inner_unit_type";
  value: unknown;
  confidence: number;
  source: PackagingSource;
  evidence_text: string;
  inferred?: boolean;
};

const SOURCE_PRIORITY: Record<PackagingSource, number> = {
  json_ld: 7,
  product_spec_table: 6,
  variant_table: 5,
  product_description: 4,
  meta_tags: 3,
  page_text_fallback: 2,
  url_pattern: 1,
  manual_admin_entry: 0,
};

function parseIntLoose(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonLdBlocks(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]!.trim()) as unknown;
      if (Array.isArray(parsed)) {
        for (const node of parsed) {
          if (node && typeof node === "object") out.push(node as Record<string, unknown>);
        }
      } else if (parsed && typeof parsed === "object") {
        out.push(parsed as Record<string, unknown>);
      }
    } catch {
      /* skip invalid JSON-LD */
    }
  }
  return out;
}

function parseSpecTablesFromHtml(html: string): Record<string, string> {
  const table: Record<string, string> = {};
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html)) !== null) {
    const cells = Array.from(row[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((c) =>
      stripHtml(c[1] ?? "").trim()
    );
    if (cells.length >= 2 && cells[0] && cells[1]) {
      table[cells[0].toLowerCase()] = cells[1];
    }
  }
  return table;
}

function inferInnerTypeFromText(text: string, unitsPerInner?: number | null): InnerUnitType | null {
  if (/\bdozen\b|\bdz\b/i.test(text)) return "dozen";
  if (/\bbox|\bbx\b/i.test(text)) return "box";
  if (/\bbag\b/i.test(text)) return "bag";
  if (/\bpack\b/i.test(text)) return "pack";
  if (/\bpair\b/i.test(text)) return "pair";
  if (unitsPerInner === 1) return "each";
  return null;
}

function runPatternGroup(text: string, patterns: PatternDef[], source: PackagingSource): Candidate[] {
  const out: Candidate[] = [];
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    if (p.map === "units_per_inner") {
      const v = parseIntLoose(m[1]);
      if (v) out.push({ field: "units_per_inner", value: v, confidence: 0.85, source, evidence_text: m[0] });
    } else if (p.map === "inners_per_case") {
      const v = parseIntLoose(m[1]);
      if (v) {
        out.push({ field: "inners_per_case", value: v, confidence: 0.85, source, evidence_text: m[0] });
        out.push({ field: "inner_unit_type", value: "box", confidence: 0.8, source, evidence_text: m[0] });
      }
    } else if (p.map === "inner_dozen_case") {
      const v = parseIntLoose(m[1]);
      if (v) {
        out.push({ field: "inners_per_case", value: v, confidence: 0.88, source, evidence_text: m[0] });
        out.push({ field: "units_per_inner", value: 12, confidence: 0.88, source, evidence_text: m[0] });
        out.push({ field: "inner_unit_type", value: "dozen", confidence: 0.88, source, evidence_text: m[0] });
      }
    } else if (p.map === "units_per_case") {
      const v = parseIntLoose(m[1]);
      if (v) out.push({ field: "units_per_case", value: v, confidence: 0.82, source, evidence_text: m[0] });
    } else if (p.map === "pairs_per_case") {
      const v = parseIntLoose(m[1]);
      if (v) {
        out.push({ field: "units_per_case", value: v, confidence: 0.85, source, evidence_text: m[0] });
        out.push({ field: "inner_unit_type", value: "pair", confidence: 0.75, source, evidence_text: m[0], inferred: true });
      }
    } else if (p.map === "slash_case") {
      const inners = parseIntLoose(m[1]);
      const innerUnits = parseIntLoose(m[2]);
      if (inners && innerUnits) {
        out.push({ field: "inners_per_case", value: inners, confidence: 0.9, source, evidence_text: m[0] });
        out.push({ field: "units_per_inner", value: innerUnits, confidence: 0.9, source, evidence_text: m[0] });
        out.push({ field: "inner_unit_type", value: "box", confidence: 0.85, source, evidence_text: m[0] });
      }
    } else if (p.map === "put_up_case") {
      const unitsPerInner = parseIntLoose(m[1]);
      const inners = parseIntLoose(m[2]);
      if (inners && unitsPerInner) {
        out.push({ field: "units_per_inner", value: unitsPerInner, confidence: 0.92, source, evidence_text: m[0] });
        out.push({ field: "inners_per_case", value: inners, confidence: 0.92, source, evidence_text: m[0] });
        out.push({ field: "inner_unit_type", value: "box", confidence: 0.9, source, evidence_text: m[0] });
      }
    } else if (p.map === "cases_per_pallet") {
      const v = parseIntLoose(m[1]);
      if (v) out.push({ field: "cases_per_pallet", value: v, confidence: 0.85, source, evidence_text: m[0] });
    } else if (p.map === "units_per_pallet") {
      const v = parseIntLoose(m[1]);
      if (v) out.push({ field: "units_per_pallet", value: v, confidence: 0.82, source, evidence_text: m[0] });
    } else if (p.map === "case_price") {
      const v = parsePrice(m[1]);
      if (v != null) out.push({ field: "case_price", value: v, confidence: 0.8, source, evidence_text: m[0] });
    } else if (p.map === "pallet_price") {
      const v = parsePrice(m[1]);
      if (v != null) out.push({ field: "pallet_price", value: v, confidence: 0.8, source, evidence_text: m[0] });
    }
  }
  return out;
}

function extractPalletTierQuantity(key: string, val: string): Candidate[] {
  if (!SPEC_TABLE_PALLET_KEYS.some((alias) => key.includes(alias))) return [];
  const out: Candidate[] = [];
  const tierMatch = val.match(/(\d+)\s*[x×]\s*(\d+)\s*=\s*(\d+)/i);
  if (tierMatch) {
    const qty = parseIntLoose(tierMatch[3]);
    if (qty) {
      out.push({
        field: "cases_per_pallet",
        value: qty,
        confidence: 0.88,
        source: "product_spec_table",
        evidence_text: `${key}: ${val}`,
      });
    }
  }
  return out;
}

function extractFromSpecTable(spec: Record<string, string>): Candidate[] {
  const out: Candidate[] = [];
  for (const [key, val] of Object.entries(spec)) {
    const k = key.toLowerCase().trim();
    const v = val.trim();
    if (!v) continue;

    if (SPEC_TABLE_PALLET_KEYS.some((alias) => k.includes(alias))) {
      out.push(...extractPalletTierQuantity(k, v));
      continue;
    }

    if (SPEC_TABLE_INNER_KEYS.some((alias) => k.includes(alias))) {
      const n = parseIntLoose(v) ?? parseIntLoose(v.match(/(\d+)/)?.[1]);
      if (n) {
        out.push({ field: "units_per_inner", value: n, confidence: 0.92, source: "product_spec_table", evidence_text: `${key}: ${v}` });
        const inner = inferInnerTypeFromText(k + " " + v, n);
        if (inner) out.push({ field: "inner_unit_type", value: inner, confidence: 0.9, source: "product_spec_table", evidence_text: `${key}: ${v}` });
      }
    }

    if (/boxes?\s*per\s*case|box\s*per\s*case|case\s*pack/i.test(k)) {
      const n = parseIntLoose(v) ?? parseIntLoose(v.match(/(\d+)/)?.[1]);
      if (n) {
        out.push({ field: "inners_per_case", value: n, confidence: 0.92, source: "product_spec_table", evidence_text: `${key}: ${v}` });
        out.push({ field: "inner_unit_type", value: "box", confidence: 0.88, source: "product_spec_table", evidence_text: `${key}: ${v}` });
      }
    }

    if (/dozen\s*per\s*case|\bdz\b/i.test(k + " " + v)) {
      const n = parseIntLoose(v) ?? parseIntLoose(v.match(/(\d+)/)?.[1]);
      if (n) {
        out.push({ field: "inners_per_case", value: n, confidence: 0.92, source: "product_spec_table", evidence_text: `${key}: ${v}` });
        out.push({ field: "units_per_inner", value: 12, confidence: 0.92, source: "product_spec_table", evidence_text: `${key}: ${v}` });
        out.push({ field: "inner_unit_type", value: "dozen", confidence: 0.92, source: "product_spec_table", evidence_text: `${key}: ${v}` });
      }
    }

    if (/units?\s*per\s*case|gloves?\s*per\s*case|pairs?\s*per\s*case/i.test(k)) {
      const n = parseIntLoose(v.replace(/,/g, "")) ?? parseIntLoose(v.match(/([\d,]+)/)?.[1]?.replace(/,/g, ""));
      if (n) out.push({ field: "units_per_case", value: n, confidence: 0.9, source: "product_spec_table", evidence_text: `${key}: ${v}` });
    }

    if (/cases?\s*per\s*pallet|pallet\s*(qty|quantity)/i.test(k)) {
      const n = parseIntLoose(v);
      if (n) out.push({ field: "cases_per_pallet", value: n, confidence: 0.9, source: "product_spec_table", evidence_text: `${key}: ${v}` });
    }

    if (/pack\s*size/i.test(k) && /\d+\s*[x×]\s*\d+/i.test(v)) {
      out.push(...runPatternGroup(v, SLASH_INNER_CASE_PATTERNS, "product_spec_table"));
    }

    if (SPEC_TABLE_INNER_CASE_KEYS.some((alias) => k.includes(alias)) && !out.some((c) => c.evidence_text === `${key}: ${v}`)) {
      out.push(...runPatternGroup(v, [...UNITS_PER_INNER_PATTERNS, ...INNERS_PER_CASE_PATTERNS, ...UNITS_PER_CASE_PATTERNS], "product_spec_table"));
    }
  }
  return out;
}

function extractFromJsonLd(nodes: Record<string, unknown>[]): Candidate[] {
  const out: Candidate[] = [];
  for (const node of nodes) {
    const desc = typeof node.description === "string" ? node.description : "";
    if (desc) out.push(...runPatternGroup(desc, [...UNITS_PER_CASE_PATTERNS, ...INNERS_PER_CASE_PATTERNS, ...UNITS_PER_INNER_PATTERNS], "json_ld"));

    const offers = node.offers;
    const offerList = Array.isArray(offers) ? offers : offers && typeof offers === "object" ? [offers] : [];
    for (const offer of offerList) {
      if (!offer || typeof offer !== "object") continue;
      const o = offer as Record<string, unknown>;
      const price = parsePrice(String(o.price ?? o.lowPrice ?? ""));
      const desc2 = typeof o.description === "string" ? o.description : "";
      if (price != null && /case/i.test(desc2 + String(o.name ?? ""))) {
        out.push({ field: "case_price", value: price, confidence: 0.75, source: "json_ld", evidence_text: `offer price ${price}` });
      }
    }

    const props = node.additionalProperty;
    const propList = Array.isArray(props) ? props : props && typeof props === "object" ? [props] : [];
    for (const prop of propList) {
      if (!prop || typeof prop !== "object") continue;
      const p = prop as Record<string, unknown>;
      const name = String(p.name ?? p.propertyID ?? "").toLowerCase();
      const val = String(p.value ?? "");
      if (name && val) {
        out.push(...extractFromSpecTable({ [name]: val }));
      }
    }
  }
  return out;
}

function pickBest(candidates: Candidate[]): Map<string, Candidate> {
  const best = new Map<string, Candidate>();
  const filtered = candidates.filter((c) => {
    if (c.field !== "units_per_case") return true;
    if (/pallet\s*ti|ti\s*x\s*hi|=\s*\d+\s*$/i.test(c.evidence_text)) return false;
    return true;
  });
  for (const c of filtered) {
    const prev = best.get(c.field);
    const cScore = c.confidence + SOURCE_PRIORITY[c.source] * 0.01;
    const pScore = prev ? prev.confidence + SOURCE_PRIORITY[prev.source] * 0.01 : -1;
    if (!prev || cScore > pScore) best.set(c.field, c);
  }
  return best;
}

function candidateToProvenance(c: Candidate): PackagingFieldProvenance {
  return {
    value: c.value,
    confidence: c.confidence,
    source: c.source,
    evidence_text: c.evidence_text,
    inferred: c.inferred,
  };
}

export function extractCommercePackagingFromHtml(input: ExtractCommercePackagingInput): CommercePackagingV1 {
  const html = input.html ?? "";
  const pageText = input.pageText?.trim() || (html ? stripHtml(html) : "");
  const categorySlug = input.categorySlug ?? null;
  const warnings: string[] = [];

  const specTable = { ...(input.specTable ?? {}), ...(html ? parseSpecTablesFromHtml(html) : {}) };
  const jsonLd = input.jsonLd ?? (html ? extractJsonLdBlocks(html) : []);
  const metaBlob = input.metaTags ? Object.entries(input.metaTags).map(([k, v]) => `${k}: ${v}`).join("\n") : "";

  const candidates: Candidate[] = [];
  candidates.push(...extractFromJsonLd(jsonLd));
  candidates.push(...extractFromSpecTable(specTable));
  candidates.push(
    ...runPatternGroup(pageText, [...SLASH_INNER_CASE_PATTERNS, ...UNITS_PER_INNER_PATTERNS, ...INNERS_PER_CASE_PATTERNS, ...UNITS_PER_CASE_PATTERNS], "page_text_fallback")
  );
  candidates.push(...runPatternGroup(pageText, CASES_PER_PALLET_PATTERNS, "page_text_fallback"));
  candidates.push(...runPatternGroup(pageText, CASE_PRICE_PATTERNS, "page_text_fallback"));
  candidates.push(...runPatternGroup(pageText, PALLET_PRICE_PATTERNS, "page_text_fallback"));
  if (metaBlob) {
    candidates.push(...runPatternGroup(metaBlob, [...UNITS_PER_CASE_PATTERNS, ...CASE_PRICE_PATTERNS], "meta_tags"));
  }
  if (input.url) {
    candidates.push(...runPatternGroup(input.url, UNITS_PER_CASE_PATTERNS, "url_pattern"));
  }

  const best = pickBest(candidates);
  const field_provenance: CommercePackagingV1["field_provenance"] = {};
  const values: Record<string, unknown> = {};

  for (const [field, c] of Array.from(best.entries())) {
    values[field] = c.value;
    if (field !== "inner_unit_type") {
      field_provenance[field as PackagingFieldKey] = candidateToProvenance(c);
    }
  }

  const unitsPerCaseDirect = values.units_per_case as number | undefined;
  const hasInnerBreakdown = values.units_per_inner != null && values.inners_per_case != null;

  if (unitsPerCaseDirect != null && !hasInnerBreakdown) {
    warnings.push("Parser found units per case but could not determine inner packaging.");
  }

  const unitNoun = deriveUnitNoun(categorySlug, values.inner_unit_type as InnerUnitType | null);

  return normalizeCommercePackaging(
    {
      inner_unit_type: (values.inner_unit_type as InnerUnitType | null) ?? null,
      units_per_inner: (values.units_per_inner as number | null) ?? null,
      inners_per_case: (values.inners_per_case as number | null) ?? null,
      units_per_case: unitsPerCaseDirect ?? null,
      cases_per_pallet: (values.cases_per_pallet as number | null) ?? null,
      case_price: (values.case_price as number | null) ?? null,
      pallet_price: (values.pallet_price as number | null) ?? null,
      unit_noun: unitNoun,
      field_provenance,
      parse_warnings: warnings,
    },
    categorySlug
  );
}

export function mergeCommercePackagingProvenance(
  target: CommercePackagingV1,
  incoming: CommercePackagingV1,
  overwrite: boolean
): CommercePackagingV1 {
  const merged = { ...target, field_provenance: { ...target.field_provenance }, parse_warnings: [...target.parse_warnings] };
  const fields: (keyof CommercePackagingV1)[] = [
    "inner_unit_type",
    "units_per_inner",
    "inners_per_case",
    "units_per_case",
    "cases_per_pallet",
    "units_per_pallet",
    "case_price",
    "pallet_price",
    "pallet_discount_percent",
  ];
  for (const f of fields) {
    const current = merged[f];
    const next = incoming[f];
    const prov = incoming.field_provenance[f as PackagingFieldKey];
    const isEmpty = current == null || current === "";
    if (next != null && (overwrite || isEmpty)) {
      (merged as Record<string, unknown>)[f] = next;
      if (prov) merged.field_provenance[f as PackagingFieldKey] = prov;
    }
  }
  for (const w of incoming.parse_warnings) {
    if (!merged.parse_warnings.includes(w)) merged.parse_warnings.push(w);
  }
  return normalizeCommercePackaging(merged, null);
}
