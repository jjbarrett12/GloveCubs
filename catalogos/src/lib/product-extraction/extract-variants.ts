import {
  clusterSkuFamily,
  normalizeGloveSizeCode,
  parseManufacturerSkuFamily,
  sizeCodeFromManufacturerSku,
} from "@glove-sku-intelligence";
import { makeFieldEvidence } from "./evidence-helpers";
import type {
  ExtractionSource,
  FamilyEvidenceTier,
  FieldEvidence,
  ProposedVariantFromUrl,
  VariantDimension,
  VariantDimensionName,
  VariantOption as ProductExtractionVariantOption,
} from "./types";

export type { FamilyEvidenceTier };

export type VariantExtractionInput = {
  html: string;
  pageUrl: string;
  rawTextSample?: string;
  jsonLdVariantRecords?: Record<string, unknown>[];
  specTable?: Record<string, string>;
};

export type VariantExtractionResult = {
  dimensions: VariantDimension[];
  options: ProductExtractionVariantOption[];
  proposedVariants: ProposedVariantFromUrl[];
  unresolvedVariantNotes: string[];
  manufacturerSkuCandidates: string[];
  supplierSkuCandidates: string[];
  familyBaseSku?: string;
  selectedSize?: string;
  selectedVariantIndex?: number;
  familyEvidenceTier?: FamilyEvidenceTier;
  familyEvidence?: string[];
};

type SkuCandidate = {
  manufacturerSku: string;
  size?: string;
  source: string;
  confidence: number;
};

type FamilySignals = {
  embeddedVariantList: boolean;
  mainProductIdList: boolean;
  sizeSelector: boolean;
  skuTable: boolean;
  siblingLinks: boolean;
  jsonLdOffers: boolean;
};

const INTERNAL_SKU_RE = /^(GLV|GC)[-_]/i;

const DIMENSION_FROM_NAME: Array<{ re: RegExp; name: VariantDimensionName }> = [
  { re: /\bsize|sizes\b/i, name: "size" },
  { re: /\bcolor|colour\b/i, name: "color" },
  { re: /\bmaterial\b/i, name: "material" },
  { re: /\bpack|packaging|box|case\b/i, name: "pack" },
  { re: /\blength\b/i, name: "length" },
  { re: /\bthickness|mil\b/i, name: "thickness" },
  { re: /\bstyle\b/i, name: "style" },
];

function inferDimensionName(label: string): VariantDimensionName {
  for (const { re, name } of DIMENSION_FROM_NAME) {
    if (re.test(label)) return name;
  }
  return "unknown";
}

function normalizeSizeValue(value: string): string | undefined {
  const code = normalizeGloveSizeCode(value);
  if (code) return code;
  const upper = value.trim().toUpperCase();
  return upper === "X" ? "X" : undefined;
}

export function isInternalManufacturerSku(sku: string): boolean {
  return INTERNAL_SKU_RE.test(sku.trim());
}

export function isPlausibleManufacturerSku(sku: string): boolean {
  const s = sku.trim().toUpperCase();
  if (!s || s.length < 5 || s.length > 40) return false;
  if (isInternalManufacturerSku(s)) return false;
  if (!/^[A-Z0-9-]+$/.test(s)) return false;
  if (!/[A-Z]/.test(s)) return false;
  const hasDigit = /[0-9]/.test(s);
  const hyphenatedMfr = /^[A-Z]{2,}-[A-Z0-9-]+$/.test(s);
  if (!hasDigit && !hyphenatedMfr) return false;
  if (/^(SELECT|CHOOSE|NULL|UNDEFINED|TRUE|FALSE)$/i.test(s)) return false;
  return true;
}

function extractSkuTokensFromText(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\b(GL-[A-Z0-9]{2,}(?:-[A-Z0-9]{1,4})?)\b/gi,
    /\b([A-Z]\d{3,}[A-Z0-9]{2,})\b/g,
    /\b([A-Z]{2,}\d+[A-Z0-9-]*)\b/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const token = m[1]?.trim().toUpperCase();
      if (token && isPlausibleManufacturerSku(token)) found.push(token);
    }
  }
  return [...new Set(found)];
}

function parseSelectOptions(html: string): Array<{
  name: string;
  dimension: VariantDimensionName;
  values: string[];
  skuByValue: Map<string, string>;
  selectedValue?: string;
  source: ExtractionSource;
  selector: string;
}> {
  const out: Array<{
    name: string;
    dimension: VariantDimensionName;
    values: string[];
    skuByValue: Map<string, string>;
    selectedValue?: string;
    source: ExtractionSource;
    selector: string;
  }> = [];

  const selectRe = /<select[^>]*(?:name|id)=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi;
  let m: RegExpExecArray | null;
  while ((m = selectRe.exec(html)) !== null) {
    const name = m[1] ?? "";
    const block = m[2] ?? "";
    const values: string[] = [];
    const skuByValue = new Map<string, string>();
    let selectedValue: string | undefined;

    const optRe = /<option([^>]*)>([\s\S]*?)<\/option>/gi;
    let o: RegExpExecArray | null;
    while ((o = optRe.exec(block)) !== null) {
      const attrs = o[1] ?? "";
      const label = o[2].replace(/<[^>]+>/g, "").trim();
      const valueMatch = attrs.match(/value=["']([^"']*)["']/i);
      const dataSkuMatch = attrs.match(/data-(?:sku|product-sku)=["']([^"']+)["']/i);
      const rawValue = (valueMatch?.[1] ?? label).trim();
      if (!label || /^(select|choose|--|please)/i.test(label)) continue;

      const skuToken =
        (dataSkuMatch?.[1] && isPlausibleManufacturerSku(dataSkuMatch[1]) ? dataSkuMatch[1].toUpperCase() : undefined) ??
        (isPlausibleManufacturerSku(rawValue) ? rawValue.toUpperCase() : undefined);

      values.push(label);
      if (skuToken) skuByValue.set(label, skuToken);
      if (/selected/i.test(attrs) && rawValue) selectedValue = rawValue;
    }
    if (values.length === 0) continue;
    out.push({
      name,
      dimension: inferDimensionName(name),
      values,
      skuByValue,
      selectedValue,
      source: "dom",
      selector: `select[name=${name}]`,
    });
  }
  return out;
}

function parseSwatchButtons(html: string): Array<{ dimension: VariantDimensionName; values: string[] }> {
  const colorValues: string[] = [];
  const swatchRe =
    /<(?:button|a|span|label)[^>]*(?:data-(?:value|option|variant)|class=["'][^"']*swatch[^"']*["'])[^>]*>([\s\S]*?)<\/(?:button|a|span|label)>/gi;
  let m: RegExpExecArray | null;
  while ((m = swatchRe.exec(html)) !== null) {
    const label = m[1].replace(/<[^>]+>/g, "").trim();
    if (label && label.length < 40) colorValues.push(label);
  }
  if (colorValues.length === 0) return [];
  return [{ dimension: "color", values: [...new Set(colorValues)] }];
}

function parseEmbeddedProductVariants(html: string): Record<string, unknown>[] {
  const variants: Record<string, unknown>[] = [];

  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = scriptRe.exec(html)) !== null) {
    const body = sm[1]?.trim() ?? "";
    if (!body.includes("variants")) continue;
    try {
      const parsed = JSON.parse(body) as { variants?: unknown } | unknown[];
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { variants?: unknown }).variants)
          ? (parsed as { variants: unknown[] }).variants
          : null;
      if (list) {
        for (const v of list) {
          if (v && typeof v === "object") variants.push(v as Record<string, unknown>);
        }
        if (variants.length > 0) return variants;
      }
    } catch {
      /* try regex fallback below */
    }
  }

  const patterns = [
    /"variants"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
    /var\s+meta\s*=\s*\{[\s\S]*?"variants"\s*:\s*(\[[\s\S]*?\])/,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (!match?.[1]) continue;
    try {
      const parsed = JSON.parse(match[1]) as unknown;
      if (Array.isArray(parsed)) {
        for (const v of parsed) {
          if (v && typeof v === "object") variants.push(v as Record<string, unknown>);
        }
      }
    } catch {
      /* skip malformed embedded JSON */
    }
  }
  return variants;
}

function parseTextSizeList(text: string): string[] {
  const m = text.match(/available\s+sizes?\s*:\s*([^.;\n]+)/i);
  if (!m?.[1]) return [];
  return m[1]
    .split(/[,/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSpecTableSize(specTable?: Record<string, string>): string | undefined {
  const raw = specTable?.size ?? specTable?.["glove size"];
  if (!raw?.trim()) return undefined;
  return normalizeSizeValue(raw.trim()) ?? raw.trim();
}

function parseMainProductIdSkus(html: string): string[] {
  const skus: string[] = [];
  const patterns = [
    /name=["']MainProductId["'][^>]*value=["']([^"']+)["']/gi,
    /id=["']MainProductId["'][^>]*value=["']([^"']+)["']/gi,
    /data-main-product-id=["']([^"']+)["']/gi,
    /MainProductId[^>]*value=["']([^"']+)["']/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1]?.trim();
      if (!raw) continue;
      for (const part of raw.split(/[,;|]/)) {
        const token = part.trim().toUpperCase();
        if (isPlausibleManufacturerSku(token)) skus.push(token);
      }
    }
  }
  return [...new Set(skus)];
}

function parseSkuRowsFromHtmlTables(html: string): SkuCandidate[] {
  const out: SkuCandidate[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html)) !== null) {
    const cells = [...(row[1]?.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [])].map((c) =>
      c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );
    if (cells.length < 2) continue;
    const joined = cells.join(" ");
    const skus = extractSkuTokensFromText(joined);
    if (skus.length === 0) continue;
    const sizeCell = cells.find((c) => normalizeSizeValue(c));
    const size = sizeCell ? normalizeSizeValue(sizeCell) : undefined;
    for (const manufacturerSku of skus) {
      out.push({ manufacturerSku, size, source: "sku_table", confidence: 0.86 });
    }
  }
  return out;
}

function parseSkuRowsFromSpecTable(specTable?: Record<string, string>): SkuCandidate[] {
  if (!specTable) return [];
  const out: SkuCandidate[] = [];
  const skuRaw =
    specTable.sku ??
    specTable["item number"] ??
    specTable["part number"] ??
    specTable.number ??
    specTable["manufacturer sku"];
  if (skuRaw && isPlausibleManufacturerSku(skuRaw)) {
    const size = parseSpecTableSize(specTable);
    out.push({
      manufacturerSku: skuRaw.trim().toUpperCase(),
      size,
      source: "product_spec_table",
      confidence: 0.88,
    });
  }
  return out;
}

type SiblingLinkHint = {
  size?: string;
  manufacturerSku?: string;
  href: string;
  trust: "probable" | "weak";
};

function parseSiblingProductLinks(html: string, pageUrl: string): SiblingLinkHint[] {
  const out: SiblingLinkHint[] = [];
  let pageHost = "";
  try {
    pageHost = new URL(pageUrl).hostname;
  } catch {
    return out;
  }

  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1]?.trim();
    const label = m[2]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!href || !label) continue;
    let absolute = href;
    try {
      absolute = new URL(href, pageUrl).href;
    } catch {
      continue;
    }
    if (new URL(absolute).hostname !== pageHost) continue;

    const hrefSkus = extractSkuTokensFromText(absolute);
    const labelSkus = extractSkuTokensFromText(label);
    const manufacturerSku = hrefSkus[0] ?? labelSkus[0];
    const sizeMatch = label.match(
      /\b(x-?small|x-?large|extra\s+large|extra\s+small|small|medium|large|xxl|xxxl|xs|xl)\b/i
    );
    const size = sizeMatch ? normalizeSizeValue(sizeMatch[1]!) ?? sizeMatch[1] : undefined;
    if (!manufacturerSku && !size) continue;

    out.push({
      href: absolute,
      manufacturerSku,
      size,
      trust: manufacturerSku && size ? "probable" : manufacturerSku ? "probable" : "weak",
    });
  }
  return out;
}

function parseUrlSkuTokens(pageUrl: string): string[] {
  return extractSkuTokensFromText(pageUrl);
}

function variantFromEmbeddedRecord(rec: Record<string, unknown>): ProposedVariantFromUrl | null {
  const title = typeof rec.title === "string" ? rec.title : typeof rec.name === "string" ? rec.name : undefined;
  const skuRaw = typeof rec.sku === "string" ? rec.sku : undefined;
  const sku = skuRaw && isPlausibleManufacturerSku(skuRaw) ? skuRaw.toUpperCase() : undefined;
  const option1 = typeof rec.option1 === "string" ? rec.option1 : undefined;
  const option2 = typeof rec.option2 === "string" ? rec.option2 : undefined;
  const sizeRaw = option1 && normalizeSizeValue(option1) ? option1 : undefined;
  const colorRaw = option2;
  const evidence: FieldEvidence<string>[] = [];
  if (sku) evidence.push(makeFieldEvidence(sku, 0.9, "embedded_json", { quote: sku }));

  const size = sizeRaw ? normalizeSizeValue(sizeRaw) ?? sizeRaw : undefined;
  const color = colorRaw?.trim() || undefined;

  if (!title && !sku && !size && !color) return null;

  return {
    sourceVariantId: rec.id != null ? String(rec.id) : undefined,
    title,
    size,
    color,
    manufacturerSku: sku,
    evidence,
    confidence: sku ? 0.88 : 0.72,
    trust: sku ? "probable" : "weak",
  };
}

function variantFromJsonLdRecord(rec: Record<string, unknown>): ProposedVariantFromUrl | null {
  const skuRaw =
    (typeof rec.sku === "string" ? rec.sku : undefined) ??
    (typeof rec.mpn === "string" ? rec.mpn : undefined);
  const sku = skuRaw && isPlausibleManufacturerSku(skuRaw) ? skuRaw.toUpperCase() : undefined;
  const name = typeof rec.name === "string" ? rec.name : undefined;
  if (!sku && !name) return null;
  const evidence: FieldEvidence<string>[] = [];
  if (sku) evidence.push(makeFieldEvidence(sku, 0.88, "json_ld", { quote: sku }));
  const sizeFromName = name ? normalizeSizeValue(name) : undefined;
  return {
    title: name,
    manufacturerSku: sku,
    size: sizeFromName,
    evidence,
    confidence: 0.85,
    trust: "probable",
  };
}

function proposedVariantFromSkuCandidate(
  candidate: SkuCandidate,
  clusterMembers: string[]
): ProposedVariantFromUrl {
  const size =
    candidate.size ??
    sizeCodeFromManufacturerSku(candidate.manufacturerSku, { clusterMembers }) ??
    undefined;
  return {
    size,
    manufacturerSku: candidate.manufacturerSku,
    evidence: [
      makeFieldEvidence(candidate.manufacturerSku, candidate.confidence, "dom", {
        quote: candidate.manufacturerSku,
        reasons: [candidate.source],
      }),
    ],
    confidence: candidate.confidence,
    trust: "probable",
  };
}

function computeFamilyEvidenceTier(
  memberCount: number,
  signals: FamilySignals
): FamilyEvidenceTier {
  const supportingSource =
    signals.embeddedVariantList ||
    signals.mainProductIdList ||
    signals.sizeSelector ||
    signals.skuTable ||
    signals.siblingLinks ||
    signals.jsonLdOffers;

  if (memberCount >= 3) return "strong";
  if (memberCount >= 2 && supportingSource) return "strong";
  if (memberCount >= 2) return "medium";
  return "weak";
}

function mergeSkuCandidates(...lists: SkuCandidate[][]): SkuCandidate[] {
  const bySku = new Map<string, SkuCandidate>();
  for (const list of lists) {
    for (const c of list) {
      const existing = bySku.get(c.manufacturerSku);
      if (!existing || c.confidence > existing.confidence) {
        bySku.set(c.manufacturerSku, c);
      } else if (existing && !existing.size && c.size) {
        bySku.set(c.manufacturerSku, { ...existing, size: c.size });
      }
    }
  }
  return [...bySku.values()];
}

/** Extract variant dimensions and source-confirmed proposed variants (no cartesian explosion). */
export function extractVariantsFromHtml(input: VariantExtractionInput): VariantExtractionResult {
  const dimensions: VariantDimension[] = [];
  const options: ProductExtractionVariantOption[] = [];
  let proposedVariants: ProposedVariantFromUrl[] = [];
  const unresolvedVariantNotes: string[] = [];
  const manufacturerSkuCandidates: string[] = [];
  const supplierSkuCandidates: string[] = [];
  const familyEvidence: string[] = [];

  const selects = parseSelectOptions(input.html);
  const swatches = parseSwatchButtons(input.html);
  const embedded = parseEmbeddedProductVariants(input.html);
  const jsonLdRecords = input.jsonLdVariantRecords ?? [];
  const textSizes = parseTextSizeList(input.rawTextSample ?? "");

  const signals: FamilySignals = {
    embeddedVariantList: embedded.length > 0,
    mainProductIdList: false,
    sizeSelector: false,
    skuTable: false,
    siblingLinks: false,
    jsonLdOffers: jsonLdRecords.length > 0,
  };

  const dimensionMap = new Map<VariantDimensionName, Set<string>>();

  for (const sel of selects) {
    if (sel.dimension === "size") signals.sizeSelector = true;
    const set = dimensionMap.get(sel.dimension) ?? new Set<string>();
    for (const v of sel.values) {
      const norm = sel.dimension === "size" ? normalizeSizeValue(v) ?? v : v;
      set.add(norm);
      options.push({
        dimension: sel.dimension,
        value: v,
        normalizedValue: norm !== v ? norm : undefined,
        confidence: 0.82,
        trust: "probable",
        source: sel.source,
        selector: sel.selector,
      });
      const optSku = sel.skuByValue.get(v);
      if (optSku) {
        manufacturerSkuCandidates.push(optSku);
        familyEvidence.push(`size_selector_sku:${optSku}`);
      }
    }
    dimensionMap.set(sel.dimension, set);
    dimensions.push({
      name: sel.dimension,
      confidence: 0.82,
      trust: "probable",
      source: sel.source,
      selector: sel.selector,
      options: [...set],
    });
  }

  for (const sw of swatches) {
    const set = dimensionMap.get(sw.dimension) ?? new Set<string>();
    for (const v of sw.values) set.add(v);
    dimensionMap.set(sw.dimension, set);
    dimensions.push({
      name: sw.dimension,
      confidence: 0.78,
      trust: "probable",
      source: "dom",
      options: [...set],
    });
  }

  if (textSizes.length > 0) {
    const normalized = textSizes.map((s) => normalizeSizeValue(s) ?? s);
    const set = dimensionMap.get("size") ?? new Set<string>();
    for (const s of normalized) set.add(s);
    dimensionMap.set("size", set);
    if (!dimensions.some((d) => d.name === "size")) {
      dimensions.push({
        name: "size",
        confidence: 0.7,
        trust: "probable",
        source: "text",
        options: [...set],
      });
    }
    for (const [raw, norm] of textSizes.map((s, i) => [s, normalized[i]!] as const)) {
      options.push({
        dimension: "size",
        value: raw,
        normalizedValue: norm !== raw ? norm : undefined,
        confidence: 0.68,
        trust: "probable",
        source: "text",
      });
    }
  }

  for (const rec of embedded) {
    const pv = variantFromEmbeddedRecord(rec);
    if (pv) {
      proposedVariants.push(pv);
      if (pv.manufacturerSku) manufacturerSkuCandidates.push(pv.manufacturerSku);
    }
  }

  for (const rec of jsonLdRecords) {
    const pv = variantFromJsonLdRecord(rec);
    if (pv) {
      proposedVariants.push(pv);
      if (pv.manufacturerSku) manufacturerSkuCandidates.push(pv.manufacturerSku);
    }
  }

  const sizeDim = dimensions.find((d) => d.name === "size");
  const hasMultipleDims = dimensions.filter((d) => d.name !== "unknown").length > 1;

  if (proposedVariants.length === 0 && sizeDim && sizeDim.options.length > 0 && !hasMultipleDims) {
    for (const size of sizeDim.options) {
      proposedVariants.push({
        size,
        evidence: [
          makeFieldEvidence(size, 0.65, "text", {
            quote: `size option: ${size}`,
            reasons: ["source_listed_size_without_sku"],
          }),
        ],
        confidence: 0.65,
        trust: "probable",
      });
    }
  } else if (proposedVariants.length === 0 && hasMultipleDims) {
    unresolvedVariantNotes.push(
      "Multiple variant dimensions detected without source-confirmed SKU/combination mapping; no cartesian variants generated."
    );
  } else if (proposedVariants.length === 0 && dimensions.length > 0) {
    unresolvedVariantNotes.push(
      "Variant dimensions detected but no source-confirmed variant rows; admin review required."
    );
  }

  const specCandidates = parseSkuRowsFromSpecTable(input.specTable);
  if (specCandidates.length) signals.skuTable = true;

  const tableCandidates = parseSkuRowsFromHtmlTables(input.html);
  if (tableCandidates.length) signals.skuTable = true;

  const mainProductIdSkus = parseMainProductIdSkus(input.html);
  if (mainProductIdSkus.length) {
    signals.mainProductIdList = true;
    familyEvidence.push(`main_product_id:${mainProductIdSkus.length}_skus`);
  }

  const siblingLinks = parseSiblingProductLinks(input.html, input.pageUrl);
  if (siblingLinks.length) signals.siblingLinks = true;

  const urlSkus = parseUrlSkuTokens(input.pageUrl);
  if (urlSkus.length) familyEvidence.push(`url_sku_token:${urlSkus[0]}`);

  const skuFromSpec =
    input.specTable?.sku ??
    input.specTable?.["item number"] ??
    input.specTable?.["part number"] ??
    input.specTable?.number;
  const currentSize = parseSpecTableSize(input.specTable);
  const currentSku =
    skuFromSpec && isPlausibleManufacturerSku(skuFromSpec) ? skuFromSpec.trim().toUpperCase() : undefined;

  const selectorCandidates: SkuCandidate[] = [];
  for (const sel of selects) {
    if (sel.dimension !== "size") continue;
    for (const [label, sku] of sel.skuByValue) {
      selectorCandidates.push({
        manufacturerSku: sku,
        size: normalizeSizeValue(label),
        source: "size_selector",
        confidence: 0.84,
      });
    }
  }

  const mainProductCandidates: SkuCandidate[] = mainProductIdSkus.map((manufacturerSku) => ({
    manufacturerSku,
    size: sizeCodeFromManufacturerSku(manufacturerSku, { clusterMembers: mainProductIdSkus }) ?? undefined,
    source: "main_product_id",
    confidence: 0.9,
  }));

  const siblingCandidates: SkuCandidate[] = siblingLinks
    .filter((l) => l.manufacturerSku && isPlausibleManufacturerSku(l.manufacturerSku))
    .map((l) => ({
      manufacturerSku: l.manufacturerSku!.toUpperCase(),
      size: l.size,
      source: "sibling_link",
      confidence: l.trust === "probable" ? 0.82 : 0.65,
    }));

  const urlCandidates: SkuCandidate[] = urlSkus.map((manufacturerSku) => ({
    manufacturerSku,
    size: sizeCodeFromManufacturerSku(manufacturerSku, { clusterMembers: urlSkus }) ?? undefined,
    source: "url_pattern",
    confidence: 0.72,
  }));

  const embeddedScanCandidates: SkuCandidate[] = extractSkuTokensFromText(input.html)
    .filter((s) => !proposedVariants.some((pv) => pv.manufacturerSku === s))
    .map((manufacturerSku) => ({
      manufacturerSku,
      source: "embedded_sku_scan",
      confidence: 0.7,
    }));

  const allCandidates = mergeSkuCandidates(
    specCandidates,
    tableCandidates,
    mainProductCandidates,
    selectorCandidates,
    siblingCandidates,
    urlCandidates,
    proposedVariants
      .filter((pv) => pv.manufacturerSku)
      .map((pv) => ({
        manufacturerSku: pv.manufacturerSku!,
        size: pv.size,
        source: "embedded_json",
        confidence: pv.confidence,
      }))
  );

  for (const c of allCandidates) {
    if (!manufacturerSkuCandidates.includes(c.manufacturerSku)) {
      manufacturerSkuCandidates.push(c.manufacturerSku);
    }
  }

  const clusterSkus = [...new Set(allCandidates.map((c) => c.manufacturerSku))];
  const cluster = clusterSkuFamily(clusterSkus);
  const familyEvidenceTier = computeFamilyEvidenceTier(cluster?.members.length ?? 0, signals);

  let familyBaseSku: string | undefined;
  let selectedSize = currentSize;
  let selectedVariantIndex: number | undefined;

  if (cluster && cluster.members.length >= 2 && (familyEvidenceTier === "strong" || familyEvidenceTier === "medium")) {
    familyBaseSku = cluster.parentBase;
    familyEvidence.push(`cluster_base:${cluster.parentBase}`, `cluster_members:${cluster.members.length}`);

    proposedVariants = cluster.members.map((member) => {
      const candidate =
        allCandidates.find((c) => c.manufacturerSku === member.rawSku) ??
        ({
          manufacturerSku: member.rawSku,
          size: member.sizeCode,
          source: member.decoderId ?? member.pattern,
          confidence: member.confidence,
        } satisfies SkuCandidate);
      return proposedVariantFromSkuCandidate(candidate, clusterSkus);
    });

    if (familyEvidenceTier === "medium") {
      unresolvedVariantNotes.push(
        "Variant family inferred from partial sibling evidence; confirm missing sizes before publish."
      );
    }
  } else if (cluster && cluster.members.length === 1 && familyEvidenceTier === "weak") {
    const only = cluster.members[0]!;
    familyBaseSku = only.parentBase;
    if (proposedVariants.length === 0) {
      proposedVariants.push(
        proposedVariantFromSkuCandidate(
          {
            manufacturerSku: only.rawSku,
            size: only.sizeCode,
            source: only.pattern,
            confidence: only.confidence,
          },
          clusterSkus
        )
      );
    }
    unresolvedVariantNotes.push(
      "Only one manufacturer SKU with validated size suffix found; full variant family not promoted without stronger sibling evidence."
    );
  } else if (familyEvidenceTier === "weak" && mainProductIdSkus.length > 1 && cluster && cluster.members.length < 2) {
    unresolvedVariantNotes.push(
      `Possible sibling variant SKU(s) ${mainProductIdSkus.filter((s) => s !== currentSku).join(", ")} require confirmed page evidence before family promotion.`
    );
  }

  if (proposedVariants.length === 0 && currentSize) {
    proposedVariants.push({
      size: currentSize,
      manufacturerSku: currentSku,
      evidence: [
        makeFieldEvidence(currentSize, 0.84, "table", {
          quote: `size: ${currentSize}`,
          reasons: ["product_details_size"],
        }),
        ...(currentSku
          ? [makeFieldEvidence(currentSku, 0.88, "table", { quote: currentSku, reasons: ["product_details_number"] })]
          : []),
      ],
      confidence: currentSku ? 0.86 : 0.78,
      trust: currentSku ? "probable" : "weak",
    });
    if (currentSku && !familyBaseSku) {
      const parse = parseManufacturerSkuFamily(currentSku, { clusterMembers: [currentSku] });
      if (parse) familyBaseSku = parse.parentBase;
    }
    if (familyEvidenceTier === "weak" || !familyEvidenceTier) {
      unresolvedVariantNotes.push(
        "Selected-size page only; no strong multi-SKU family evidence to promote full variant list."
      );
    }
  }

  if (currentSku || currentSize) {
    selectedVariantIndex = proposedVariants.findIndex(
      (pv) =>
        (currentSku && pv.manufacturerSku?.toUpperCase() === currentSku) ||
        (currentSize && pv.size?.toUpperCase() === currentSize.toUpperCase())
    );
    if (selectedVariantIndex < 0 && (currentSku || currentSize)) selectedVariantIndex = 0;
  }

  if (
    familyEvidenceTier === "weak" &&
    proposedVariants.length <= 1 &&
    /available\s+options/i.test(input.html) &&
    siblingLinks.length === 0 &&
    mainProductIdSkus.length <= 1
  ) {
    unresolvedVariantNotes.push(
      "Available Options section present but sibling variants were not found in static HTML; rendered or linked discovery may be required."
    );
  }

  const tier: FamilyEvidenceTier =
    cluster && cluster.members.length >= 2 && (familyEvidenceTier === "strong" || familyEvidenceTier === "medium")
      ? familyEvidenceTier
      : "weak";

  if (!familyBaseSku && cluster?.parentBase) familyBaseSku = cluster.parentBase;

  return {
    dimensions,
    options,
    proposedVariants,
    unresolvedVariantNotes: [...new Set(unresolvedVariantNotes)],
    manufacturerSkuCandidates: [...new Set(manufacturerSkuCandidates.filter((s) => !isInternalManufacturerSku(s)))],
    supplierSkuCandidates: [...new Set(supplierSkuCandidates)],
    familyBaseSku,
    selectedSize,
    selectedVariantIndex: selectedVariantIndex != null && selectedVariantIndex >= 0 ? selectedVariantIndex : undefined,
    familyEvidenceTier: tier,
    familyEvidence: familyEvidence.length ? familyEvidence : undefined,
  };
}
