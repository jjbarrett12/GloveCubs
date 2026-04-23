/**
 * Variant family inference: base SKU stem, variant axis (size, color, pack, …), stable family_group_key.
 * Deterministic rules first (SKU suffix / hyphen tokens, color codes, pack counts); optional title stem clustering.
 */

/** Minimum structural parse confidence before guardrails run (final score may be lower). */
export const FAMILY_GROUPING_CONFIDENCE_THRESHOLD = 0.85;

/** Lower bar for title-stem-only clustering (ambiguous SKUs). */
const TITLE_STEM_CLUSTER_CONFIDENCE = 0.68;

/** Default guardrails (override via computeFamilyInference options). */
export const FAMILY_GUARD_DEFAULTS = {
  /** Min pairwise Jaccard on title tokens when any row is not strong SKU-suffix size parse. */
  minTitleSimilarity: 0.34,
  /** Stricter title gate for stem-only / title-heavy groups. */
  minTitleSimilarityStem: 0.42,
  /** Min title token overlap for description-similarity size families (SKU parse failed). */
  minTitleDescriptionSimilarity: 0.52,
  /** Minimum normalized title length to use description-similarity clustering. */
  minTitleLengthForDescriptionCluster: 16,
  /** Stem token length floor (after size/color phrases stripped). */
  minStemTokenLength: 10,
  /** Require brand, material, and category_slug to agree when present on ≥2 rows. */
  strictCoreIdentity: true,
  /** Pairwise normalized-LCP ratio on inferred base SKUs; below this adds a review flag and lowers score. */
  minSkuStemCoherence: 0.35,
} as const;

/**
 * Attributes that must **agree when both sides are non-empty** (variant axis field excluded).
 * Missing on one row is allowed — handles messy normalization.
 */
export const FAMILY_GROUPING_ATTRS = [
  "brand",
  "material",
  "thickness_mil",
  "color",
  "powder",
  "grade",
  "packaging",
] as const;

export type FamilyGuardOptions = typeof FAMILY_GUARD_DEFAULTS;

/** Persisted on each row in a multi-member family for operator review (rules-only v1). */
export interface FamilyGroupMetaV1 {
  v: 1;
  /** Final grouping score in [0,1] (see computeFamilyGroupingScore). */
  score: number;
  breakdown: {
    parse_mean: number;
    title_factor: number;
    core_identity: number;
    sku_stem_factor: number;
    source_tier_factor: number;
  };
  /** Human-readable guard / risk tags for the proposed family. */
  flags: string[];
  /** Minimum pairwise title token Jaccard in the group; null if waived (all strong SKU size). */
  title_similarity_min: number | null;
  variant_axis: VariantAxis;
  row_count: number;
  /** Distinct parse sources in the group (e.g. sku_suffix, title_stem_cluster). */
  sources: string[];
  /** Coarse signal quality tier for operator review. */
  grouping_tier?: "ai_hint" | "title_similarity" | "title_stem" | "sku_rules";
}

const TITLE_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "with",
  "per",
  "ct",
  "pk",
  "box",
  "case",
  "each",
  "exam",
  "grade",
  "powder",
  "free",
]);

export type VariantAxis = "size" | "color" | "pack" | "thickness" | "length" | "none";

/** Longest-first alternation for SKU size tails (numeric shoe/glove sizes last). */
const SIZE_SUFFIX_ALTS = [
  "3xl",
  "2xl",
  "xxl",
  "xl",
  "xs",
  "sm",
  "md",
  "lg",
  "s",
  "m",
  "l",
  "14",
  "13",
  "12",
  "11",
  "10",
  "9",
  "8",
  "7",
] as const;

const SKU_SIZE_TOKEN_GROUP = SIZE_SUFFIX_ALTS.join("|");

/** Map raw SKU/title token to canonical variant slug. */
export function canonicalSizeSlug(raw: string): string {
  const t = raw.toLowerCase();
  if (t === "2xl") return "xxl";
  if (t === "xxxl" || t === "3xl") return "3xl";
  if (t === "sm") return "s";
  if (t === "md") return "m";
  if (t === "lg") return "l";
  return t;
}

/** End of SKU: optional separator then size token (longest wins via alternation order). */
const SKU_SIZE_TAIL = new RegExp(`^(.+?)(?:[-_/])?(${SKU_SIZE_TOKEN_GROUP})$`, "i");

/** Explicit SZ / SIZE prefix before token: PROD-SZ-M, ITEM_SIZE_XL */
const SKU_SIZE_EXPLICIT = new RegExp(
  `^(.+?)[-_]?(?:sz|size)[-_]?(${SKU_SIZE_TOKEN_GROUP})$`,
  "i"
);

/** Color / material suffix tokens (longer alternations first where needed). */
const COLOR_TOKEN_MAP: [string, string][] = [
  ["black", "black"],
  ["white", "white"],
  ["yellow", "yellow"],
  ["orange", "orange"],
  ["purple", "purple"],
  ["navy", "navy"],
  ["teal", "teal"],
  ["pink", "pink"],
  ["blue", "blue"],
  ["blu", "blue"],
  ["blk", "black"],
  ["wht", "white"],
  ["yel", "yellow"],
  ["org", "orange"],
  ["pnk", "pink"],
  ["pur", "purple"],
  ["nav", "navy"],
  ["tel", "teal"],
  ["red", "red"],
  ["grn", "green"],
  ["green", "green"],
  ["tan", "tan"],
  ["gry", "gray"],
  ["grey", "gray"],
  ["gray", "gray"],
];

const COLOR_ALTS = COLOR_TOKEN_MAP.map(([k]) => k).sort((a, b) => b.length - a.length);
const SKU_COLOR_TAIL = new RegExp(`^(.+?)(?:[-_/])?(${COLOR_ALTS.join("|")})$`, "i");

/** Pack / count tail: -100, _100PK, x100ct */
const SKU_PACK_TAIL = /^(.+?)(?:[-_/x])(\d{2,4})(?:pk|ct|ea|cs|bx)?$/i;

/** Thickness tail: -4mil, _6MIL, 4mil */
const SKU_THICKNESS_TAIL = /^(.+?)(?:[-_/])?(\d+(?:\.\d+)?)\s*mil$/i;

const SKU_THICKNESS_SHORT = /^(.+?)(?:[-_/])?(\d+(?:\.\d+)?)mil$/i;

/** Length tail: -12IN, _18", 24inch (kept distinct from pack counts via unit). */
const SKU_LENGTH_TAIL =
  /^(.+?)(?:[-_/])(\d{1,2})(?:\s*)(?:in(?:ch(?:es)?)?|")$/i;

export interface InferBaseSkuResult {
  baseSku: string;
  size: string;
  confidence: number;
  source: "sku_suffix" | "title_or_specs" | "none";
}

export interface SkuVariantParse {
  baseSku: string;
  axis: VariantAxis;
  /** Normalized value for axis (size slug, color slug, digits for pack, etc.). */
  value: string;
  confidence: number;
  source:
    | "sku_suffix"
    | "sku_color"
    | "sku_pack"
    | "sku_thickness"
    | "title_or_specs"
    | "title_stem_cluster"
    | "title_description_cluster"
    | "ai_variant_hint"
    | "none";
}

/** Extract size-only parse (backward compatible with legacy callers). */
export function inferBaseSkuAndSizeFromSku(sku: string): InferBaseSkuResult | null {
  const v = inferVariantFromSku(sku);
  if (!v || v.axis !== "size" || !v.value) return null;
  return {
    baseSku: v.baseSku,
    size: v.value,
    confidence: v.confidence,
    source: v.source === "title_or_specs" ? "title_or_specs" : "sku_suffix",
  };
}

/**
 * Deterministic variant parse from SKU string only (no title).
 */
export function inferVariantFromSku(sku: string): SkuVariantParse | null {
  const raw = (sku ?? "").trim();
  if (raw.length < 4) return null;

  let m = raw.match(SKU_SIZE_EXPLICIT);
  if (m) {
    const baseSku = m[1].trim();
    const tok = m[2].toLowerCase();
    if (baseSku.length >= 2) {
      return {
        baseSku,
        axis: "size",
        value: canonicalSizeSlug(tok),
        confidence: 0.93,
        source: "sku_suffix",
      };
    }
  }

  m = raw.match(SKU_SIZE_TAIL);
  if (m) {
    const baseSku = m[1].trim();
    const tok = m[2].toLowerCase();
    if (baseSku.length >= 2) {
      return {
        baseSku,
        axis: "size",
        value: canonicalSizeSlug(tok),
        confidence: 0.95,
        source: "sku_suffix",
      };
    }
  }

  m = raw.match(SKU_COLOR_TAIL);
  if (m) {
    const baseSku = m[1].trim();
    const tok = m[2].toLowerCase();
    if (baseSku.length >= 2) {
      const mapped = COLOR_TOKEN_MAP.find(([k]) => k === tok)?.[1] ?? tok;
      return {
        baseSku,
        axis: "color",
        value: mapped,
        confidence: 0.88,
        source: "sku_color",
      };
    }
  }

  m = raw.match(SKU_PACK_TAIL);
  if (m) {
    const baseSku = m[1].trim();
    const n = m[2];
    if (baseSku.length >= 2 && n) {
      return {
        baseSku,
        axis: "pack",
        value: n,
        confidence: 0.82,
        source: "sku_pack",
      };
    }
  }

  m = raw.match(SKU_THICKNESS_TAIL) || raw.match(SKU_THICKNESS_SHORT);
  if (m) {
    const baseSku = m[1].trim();
    const t = m[2];
    if (baseSku.length >= 2) {
      return {
        baseSku,
        axis: "thickness",
        value: t,
        confidence: 0.85,
        source: "sku_thickness",
      };
    }
  }

  m = raw.match(SKU_LENGTH_TAIL);
  if (m) {
    const baseSku = m[1].trim();
    const n = m[2];
    if (baseSku.length >= 2 && n) {
      return {
        baseSku,
        axis: "length",
        value: n,
        confidence: 0.86,
        source: "sku_suffix",
      };
    }
  }

  return null;
}

/** Extract size from title/specs text (e.g. "Small", "Medium", "3XL", "Size 10"). */
const TITLE_SIZE_NUMERIC = /\b(?:size|sz)[\s.:_-]*((?:1[0-4]|[7-9]))\b/i;

const TITLE_SIZE_PATTERNS: [RegExp, string][] = [
  [/\b(3\s*x\s*l|3xl|xxxl|triple\s*xl)\b/i, "3xl"],
  [/\b(2\s*x\s*l|2xl|double\s*x\s*large)\b/i, "xxl"],
  [/\b(xxl)\b/i, "xxl"],
  [/\b(extra\s*small|xs)\b/i, "xs"],
  [/\b(extra\s*large|xl)\b/i, "xl"],
  [/\b(small)\b/i, "s"],
  [/\b(medium)\b/i, "m"],
  [/\b(large)\b/i, "l"],
  [/\b(sm)\b/i, "s"],
  [/\b(md)\b/i, "m"],
  [/\b(lg)\b/i, "l"],
  [/\b(s\b)(?=\s|,|\.|$)/i, "s"],
  [/\b(m\b)(?=\s|,|\.|$)/i, "m"],
  [/\b(l\b)(?=\s|,|\.|$)/i, "l"],
];

export function inferSizeFromTitleOrSpecs(titleOrSpecs: string): string | null {
  const text = (titleOrSpecs ?? "").trim();
  if (!text) return null;
  for (const [re, size] of TITLE_SIZE_PATTERNS) {
    if (re.test(text)) return canonicalSizeSlug(size);
  }
  const nm = text.match(TITLE_SIZE_NUMERIC);
  if (nm) return nm[1].toLowerCase();
  return null;
}

/** Color phrases in titles (maps to canonical slug). */
const TITLE_COLOR_PATTERNS: [RegExp, string][] = [
  [/\b(navy\s*blue|navy)\b/i, "navy"],
  [/\b(royal\s*blue|royal)\b/i, "blue"],
  [/\b(light\s*blue|sky\s*blue)\b/i, "blue"],
  [/\b(black|blk)\b/i, "black"],
  [/\b(white|wht)\b/i, "white"],
  [/\b(red)\b/i, "red"],
  [/\b(green)\b/i, "green"],
  [/\b(purple|violet)\b/i, "purple"],
  [/\b(orange)\b/i, "orange"],
  [/\b(pink)\b/i, "pink"],
  [/\b(yellow)\b/i, "yellow"],
  [/\b(teal)\b/i, "teal"],
  [/\b(tan|beige)\b/i, "tan"],
  [/\b(gray|grey)\b/i, "gray"],
  [/\b(blue)\b/i, "blue"],
];

export function inferColorFromTitleOrSpecs(titleOrSpecs: string): string | null {
  const text = (titleOrSpecs ?? "").trim();
  if (!text) return null;
  for (const [re, slug] of TITLE_COLOR_PATTERNS) {
    if (re.test(text)) return slug;
  }
  return null;
}

/** Lowercase title with size phrases stripped — for loose clustering. */
export function normalizeTitleStem(title: string): string {
  let t = (title ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  for (const [re] of TITLE_SIZE_PATTERNS) {
    t = t.replace(re, " ");
  }
  for (const [re] of TITLE_COLOR_PATTERNS) {
    t = t.replace(re, " ");
  }
  return t.replace(/\s+/g, " ").trim();
}

function attrTrimLower(attrs: Record<string, unknown>, key: string): string {
  const v = attrs[key];
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(String).sort().join("|");
  return String(v).trim().toLowerCase();
}

function mergeSkuParseWithContext(
  sku: string,
  parsed: SkuVariantParse | null,
  options: { title?: string; sizeFromAttrs?: string; attrs?: Record<string, unknown> }
): SkuVariantParse {
  const attrs = options.attrs ?? {};
  if (parsed) {
    if (parsed.axis === "size") return parsed;
    const sizeFromAttrs = options.sizeFromAttrs?.toLowerCase().trim();
    const fromTitle = inferSizeFromTitleOrSpecs(options.title ?? "");
    const sizeExtra = sizeFromAttrs || fromTitle;
    if (sizeExtra) {
      return {
        ...parsed,
        confidence: Math.min(parsed.confidence, 0.9),
      };
    }
    return parsed;
  }

  const sizeFromAttrs = options.sizeFromAttrs?.toLowerCase().trim();
  const fromTitleSize = inferSizeFromTitleOrSpecs(options.title ?? "");
  const fromTitleColor = inferColorFromTitleOrSpecs(options.title ?? "");
  const size = sizeFromAttrs || fromTitleSize;
  const baseSku = (sku ?? "").trim() || "unknown";
  if (size) {
    return {
      baseSku,
      axis: "size",
      value: canonicalSizeSlug(size),
      confidence: sizeFromAttrs ? 0.9 : fromTitleSize ? 0.78 : 0.72,
      source: "title_or_specs",
    };
  }
  const hasBrand = Boolean(attrTrimLower(attrs, "brand"));
  const hasMaterial = Boolean(attrTrimLower(attrs, "material"));
  if (fromTitleColor && baseSku !== "unknown" && hasBrand && hasMaterial) {
    return {
      baseSku,
      axis: "color",
      value: fromTitleColor,
      confidence: 0.87,
      source: "title_or_specs",
    };
  }
  return {
    baseSku,
    axis: "none",
    value: "",
    confidence: 0,
    source: "none",
  };
}

export function inferBaseSkuAndSize(
  sku: string,
  options: { title?: string; sizeFromAttrs?: string }
): InferBaseSkuResult {
  const fromSku = inferBaseSkuAndSizeFromSku(sku);
  if (fromSku) return fromSku;

  const sizeFromAttrs = options.sizeFromAttrs?.toLowerCase().trim();
  const fromTitle = inferSizeFromTitleOrSpecs(options.title ?? "");
  const size = sizeFromAttrs || fromTitle || null;
  if (size) {
    const baseSku = (sku ?? "").trim() || "unknown";
    return {
      baseSku,
      size: canonicalSizeSlug(size),
      confidence: sizeFromAttrs ? 0.9 : 0.75,
      source: "title_or_specs",
    };
  }
  return {
    baseSku: (sku ?? "").trim() || "unknown",
    size: "",
    confidence: 0,
    source: "none",
  };
}

/** @internal Same as {@link FAMILY_GROUPING_ATTRS}. */
const FAMILY_KEY_ATTRS = FAMILY_GROUPING_ATTRS;

function getAttr(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(String).sort().join("|");
  return String(v).trim().toLowerCase();
}

function attrKeyForAxis(axis: VariantAxis): (typeof FAMILY_GROUPING_ATTRS)[number] | null {
  if (axis === "color") return "color";
  if (axis === "thickness") return "thickness_mil";
  return null;
}

/**
 * Legacy stable key: base SKU + shared attributes (size is not part of the key — variants differ by inferred size).
 */
export function buildFamilyGroupKey(baseSku: string, attrs: Record<string, unknown>): string {
  const parts = [baseSku.trim().toLowerCase()];
  for (const k of FAMILY_KEY_ATTRS) {
    parts.push(getAttr(attrs, k));
  }
  return parts.join("\0");
}

/**
 * Family key including variant axis. For `size`, matches legacy {@link buildFamilyGroupKey} exactly.
 */
export function buildFamilyGroupKeyForAxis(
  baseSku: string,
  attrs: Record<string, unknown>,
  axis: VariantAxis
): string {
  if (axis === "size") return buildFamilyGroupKey(baseSku, attrs);
  const skip = attrKeyForAxis(axis);
  const parts: string[] = [axis, baseSku.trim().toLowerCase()];
  for (const k of FAMILY_KEY_ATTRS) {
    if (skip && k === skip) continue;
    parts.push(getAttr(attrs, k));
  }
  return parts.join("\0");
}

/**
 * Strict legacy check: every non-variant attribute must match exactly (including empty).
 * Prefer {@link attrsCompatiblePair} for messy supplier normalization.
 */
export function onlyDiffersOnVariantAxis(
  attrsA: Record<string, unknown>,
  attrsB: Record<string, unknown>,
  axis: VariantAxis
): boolean {
  const skip = attrKeyForAxis(axis);
  for (const k of FAMILY_KEY_ATTRS) {
    if (skip && k === skip) continue;
    if (getAttr(attrsA, k) !== getAttr(attrsB, k)) return false;
  }
  return true;
}

/**
 * Family-safe attribute match: missing vs present is allowed; if both sides have a value they must match.
 * Rejects when multiple attributes would disagree (any pair of non-empty differing values on the same key).
 */
export function attrsCompatiblePair(
  attrsA: Record<string, unknown>,
  attrsB: Record<string, unknown>,
  axis: VariantAxis
): boolean {
  const skip = attrKeyForAxis(axis);
  for (const k of FAMILY_KEY_ATTRS) {
    if (skip && k === skip) continue;
    const a = getAttr(attrsA, k);
    const b = getAttr(attrsB, k);
    if (a && b && a !== b) return false;
  }
  return true;
}

function buildFamilyGroupKeyFromConsensus(
  baseSku: string,
  attrsList: Record<string, unknown>[],
  axis: VariantAxis
): string {
  const skip = attrKeyForAxis(axis);
  const parts: string[] = axis === "size" ? [baseSku.trim().toLowerCase()] : [axis, baseSku.trim().toLowerCase()];
  for (const k of FAMILY_KEY_ATTRS) {
    if (skip && k === skip) continue;
    const vals = new Set(attrsList.map((a) => getAttr(a, k)).filter(Boolean));
    if (vals.size > 1) throw new Error(`family key conflict on ${k}`);
    parts.push(vals.size === 1 ? [...vals][0] : "");
  }
  return parts.join("\0");
}

function partitionIntoPairwiseCompatibleGroups(
  idxs: number[],
  axis: VariantAxis,
  getAttrs: (i: number) => Record<string, unknown>
): number[][] {
  const unassigned = new Set(idxs);
  const groups: number[][] = [];
  while (unassigned.size) {
    const seed = unassigned.values().next().value as number;
    unassigned.delete(seed);
    const group = [seed];
    for (const j of [...unassigned]) {
      if (group.every((i) => attrsCompatiblePair(getAttrs(i), getAttrs(j), axis))) {
        group.push(j);
        unassigned.delete(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

function sourceTierMultiplier(sources: string[]): { factor: number; tier: FamilyGroupMetaV1["grouping_tier"] } {
  const s = new Set(sources);
  if (s.has("ai_variant_hint")) return { factor: 0.78, tier: "ai_hint" };
  if (s.has("title_description_cluster")) return { factor: 0.86, tier: "title_similarity" };
  if (s.has("title_stem_cluster")) return { factor: 0.9, tier: "title_stem" };
  const skuStemSources = ["sku_suffix", "sku_color", "sku_pack", "sku_thickness"];
  const onlySkuStem = [...s].every((x) => skuStemSources.includes(x));
  if (onlySkuStem && s.size > 0) return { factor: 1, tier: "sku_rules" };
  if (!s.has("title_or_specs")) return { factor: 0.93, tier: "sku_rules" };
  return { factor: 0.9, tier: "sku_rules" };
}

/** @deprecated Use onlyDiffersOnVariantAxis(..., "size"). */
export function onlySizeDiffers(attrsA: Record<string, unknown>, attrsB: Record<string, unknown>): boolean {
  return onlyDiffersOnVariantAxis(attrsA, attrsB, "size");
}

export interface StagingRowForInference {
  id: string;
  sku: string;
  normalized_data?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
}

export interface InferredFamilyRow {
  id: string;
  inferred_base_sku: string;
  inferred_size: string;
  family_group_key: string | null;
  grouping_confidence: number | null;
  variant_axis: VariantAxis | null;
  variant_value: string | null;
  /** Populated when this row is part of a validated multi-member family (rules audit). */
  family_group_meta: FamilyGroupMetaV1 | null;
}

function rowAttrs(row: StagingRowForInference): Record<string, unknown> {
  const nd = row.normalized_data ?? {};
  return (row.attributes ?? nd.filter_attributes ?? nd) as Record<string, unknown>;
}

function tokenizeTitleForGuard(title: string): Set<string> {
  const t = (title ?? "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const set = new Set<string>();
  for (const w of t.split(" ")) {
    if (w.length < 2) continue;
    if (TITLE_STOPWORDS.has(w)) continue;
    set.add(w);
  }
  return set;
}

/** Minimum pairwise Jaccard similarity on title tokens (0–1). Exported for tests. */
export function minPairwiseTitleJaccard(titles: string[]): number {
  const trimmed = titles.map((t) => (t ?? "").trim());
  const anyText = trimmed.some((t) => t.length > 0);
  if (!anyText) return 1;
  const hasMix = trimmed.some((t) => t.length === 0) && trimmed.some((t) => t.length > 0);
  if (hasMix) return 0;
  const sets = trimmed.map(tokenizeTitleForGuard);
  const nonempty = sets.filter((s) => s.size > 0);
  if (nonempty.length < 2) return 1;
  let min = 1;
  for (let i = 0; i < nonempty.length; i++) {
    for (let j = i + 1; j < nonempty.length; j++) {
      const a = nonempty[i];
      const b = nonempty[j];
      let inter = 0;
      for (const tok of a) if (b.has(tok)) inter++;
      const uni = a.size + b.size - inter;
      const jacc = uni === 0 ? 1 : inter / uni;
      min = Math.min(min, jacc);
    }
  }
  return min;
}

function normalizeSkuStemAlnum(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Minimum pairwise prefix coherence on alphanumeric SKU stems (0–1). */
export function minPairwiseSkuStemCoherence(baseSkus: string[]): number {
  const stems = baseSkus.map(normalizeSkuStemAlnum).filter((x) => x.length > 0);
  if (stems.length < 2) return 1;
  let min = 1;
  for (let i = 0; i < stems.length; i++) {
    for (let j = i + 1; j < stems.length; j++) {
      const a = stems[i];
      const b = stems[j];
      let k = 0;
      const maxK = Math.min(a.length, b.length);
      while (k < maxK && a[k] === b[k]) k++;
      const denom = Math.max(a.length, b.length, 1);
      min = Math.min(min, k / denom);
    }
  }
  return min;
}

function isStrongSkuSizeSuffix(v: SkuVariantParse): boolean {
  return v.axis === "size" && v.source === "sku_suffix";
}

function isStemClusterFamilyKey(key: string): boolean {
  return key.startsWith("stem\0");
}

function isTitleSimClusterFamilyKey(key: string): boolean {
  return key.startsWith("titlesim\0");
}

function applyVariantBucketGrouping(
  parsed: { variant: SkuVariantParse; attrs: Record<string, unknown>; row: StagingRowForInference }[],
  results: InferredFamilyRow[],
  candidateFilter: Set<number> | null,
  threshold: number
): void {
  const consider = candidateFilter ? [...candidateFilter] : parsed.map((_, i) => i);
  const candidateIdxs = consider.filter((i) => {
    const v = parsed[i].variant;
    return v.axis !== "none" && v.value && v.confidence >= threshold;
  });
  const buckets = new Map<string, number[]>();
  for (const i of candidateIdxs) {
    const v = parsed[i].variant;
    const bk = `${v.baseSku.trim().toLowerCase()}\n${v.axis}`;
    const arr = buckets.get(bk) ?? [];
    arr.push(i);
    buckets.set(bk, arr);
  }
  for (const [, idxs] of buckets) {
    const axis = parsed[idxs[0]].variant.axis;
    const groups = partitionIntoPairwiseCompatibleGroups(idxs, axis, (j) => parsed[j].attrs);
    for (const g of groups) {
      if (g.length < 2) continue;
      if (g.some((i) => results[i].family_group_key)) continue;
      const valueSet = new Set(g.map((i) => parsed[i].variant.value));
      if (valueSet.size < 2) continue;
      const baseSku = parsed[g[0]].variant.baseSku.trim();
      let key: string;
      try {
        key = buildFamilyGroupKeyFromConsensus(baseSku, g.map((i) => parsed[i].attrs), axis);
      } catch {
        continue;
      }
      for (const i of g) {
        results[i].family_group_key = key;
        results[i].variant_axis = axis;
        results[i].variant_value = parsed[i].variant.value;
        results[i].grouping_confidence = parsed[i].variant.confidence;
        results[i].inferred_base_sku = baseSku;
      }
    }
  }
}

function categorySlugForGuard(attrs: Record<string, unknown>, nd: Record<string, unknown>): string {
  return (
    getAttr(attrs, "category_slug") ||
    getAttr(attrs, "category_id") ||
    String(nd.category_slug ?? nd.category_id ?? "")
      .trim()
      .toLowerCase()
  );
}

function coreIdentityViolations(
  idxs: number[],
  parsed: { attrs: Record<string, unknown>; row: StagingRowForInference }[],
  strict: boolean
): { ok: boolean; flags: string[] } {
  const flags: string[] = [];
  if (!strict) return { ok: true, flags };
  for (const f of ["brand", "material"] as const) {
    const vals = new Set<string>();
    for (const i of idxs) {
      const v = getAttr(parsed[i].attrs, f);
      if (v) vals.add(v);
    }
    if (vals.size > 1) flags.push(`core_identity_${f}_mismatch`);
  }
  const catVals = new Set<string>();
  for (const i of idxs) {
    const nd = parsed[i].row.normalized_data ?? {};
    const c = categorySlugForGuard(parsed[i].attrs, nd);
    if (c) catVals.add(c);
  }
  if (catVals.size > 1) flags.push("core_identity_category_mismatch");
  return { ok: flags.length === 0, flags };
}

function computeFamilyGroupingScore(input: {
  variants: SkuVariantParse[];
  minTitleJaccard: number | null;
  titleWaiver: boolean;
  stemCluster: boolean;
  coreIdentityOk: boolean;
  skuStemCoherence: number;
  sourceTierFactor: number;
  guards: FamilyGuardOptions;
}): { score: number; breakdown: FamilyGroupMetaV1["breakdown"]; flags: string[] } {
  const flags: string[] = [];
  const parseMean =
    input.variants.reduce((s, v) => s + v.confidence, 0) / Math.max(input.variants.length, 1);
  let titleFactor = 1;
  if (!input.titleWaiver) {
    const t = input.minTitleJaccard ?? 1;
    titleFactor = Math.max(0.5, Math.min(1, 0.45 + 0.55 * t));
    if (input.stemCluster) titleFactor *= 0.92;
  }
  const tierFactor = input.sourceTierFactor;
  if (!input.coreIdentityOk) {
    return {
      score: 0,
      breakdown: {
        parse_mean: Math.round(1000 * parseMean) / 1000,
        title_factor: Math.round(1000 * titleFactor) / 1000,
        core_identity: 0,
        sku_stem_factor: 0,
        source_tier_factor: Math.round(1000 * tierFactor) / 1000,
      },
      flags,
    };
  }
  const coreIdentity = 1;
  let skuStemFactor = 1;
  if (input.skuStemCoherence < input.guards.minSkuStemCoherence) {
    flags.push("low_sku_stem_coherence");
    skuStemFactor = 0.9;
  }
  const score =
    Math.round(
      10000 * parseMean * titleFactor * coreIdentity * skuStemFactor * tierFactor
    ) / 10000;
  return {
    score,
    breakdown: {
      parse_mean: Math.round(1000 * parseMean) / 1000,
      title_factor: Math.round(1000 * titleFactor) / 1000,
      core_identity: coreIdentity,
      sku_stem_factor: skuStemFactor,
      source_tier_factor: Math.round(1000 * tierFactor) / 1000,
    },
    flags,
  };
}

/**
 * Optional AI hook: return null to stay rules-only (default).
 * Invoked only for rows that still lack a family after deterministic + title fallbacks.
 */
export type AiVariantHintFn = (input: {
  sku: string;
  title: string;
  description?: string;
}) => Promise<SkuVariantParse | null>;

function clearInferredFamilyFields(r: InferredFamilyRow) {
  r.family_group_key = null;
  r.grouping_confidence = null;
  r.variant_axis = null;
  r.variant_value = null;
  r.family_group_meta = null;
}

const TITLE_DESCRIPTION_PARSE_CONFIDENCE = 0.74;

export async function computeFamilyInference(
  rows: StagingRowForInference[],
  options: {
    confidenceThreshold?: number;
    /** When true, run title-stem clustering for rows that did not get a SKU-based key. */
    enableTitleStemCluster?: boolean;
    /** When true, cluster by high title similarity + size in title when SKU parse failed. */
    enableTitleDescriptionCluster?: boolean;
    /** When false, skip OpenAI variant hints even if aiVariantHint is set. */
    enableAiVariantHint?: boolean;
    aiVariantHint?: AiVariantHintFn;
    /** Min parse confidence to accept AI hints (default 0.58). */
    aiConfidenceThreshold?: number;
    /** Cap AI calls per batch (default 50). */
    aiMaxRows?: number;
    guards?: Partial<FamilyGuardOptions>;
  } = {}
): Promise<InferredFamilyRow[]> {
  const threshold = options.confidenceThreshold ?? FAMILY_GROUPING_CONFIDENCE_THRESHOLD;
  const enableStem = options.enableTitleStemCluster !== false;
  const enableTitleDesc = options.enableTitleDescriptionCluster !== false;
  const guards: FamilyGuardOptions = { ...FAMILY_GUARD_DEFAULTS, ...options.guards };
  const aiTh = options.aiConfidenceThreshold ?? 0.58;
  const aiMax = options.aiMaxRows ?? 50;
  const enableAi = options.enableAiVariantHint !== false && Boolean(options.aiVariantHint);

  type ParsedRow = {
    row: StagingRowForInference;
    variant: SkuVariantParse;
    attrs: Record<string, unknown>;
    title: string;
  };

  const parsed: ParsedRow[] = [];

  for (const row of rows) {
    const nd = row.normalized_data ?? {};
    const attrs = rowAttrs(row);
    const title = (nd.canonical_title ?? nd.name ?? "") as string;
    const sizeFromAttrs = (attrs.size ?? nd.size) as string | undefined;
    const sku = row.sku ?? (nd.supplier_sku ?? nd.sku ?? "");
    const fromSku = inferVariantFromSku(String(sku));
    const variant = mergeSkuParseWithContext(String(sku), fromSku, {
      title,
      sizeFromAttrs,
      attrs,
    });

    parsed.push({ row, variant, attrs, title });
  }

  const results: InferredFamilyRow[] = parsed.map(({ row, variant, attrs, title }) => {
    const rawAttrSize = String((attrs.size as string) ?? "").trim().toLowerCase();
    const inferredSize =
      variant.axis === "size" && variant.value
        ? variant.value
        : inferSizeFromTitleOrSpecs(title) || (rawAttrSize ? canonicalSizeSlug(rawAttrSize) : "") || "";

    return {
      id: row.id,
      inferred_base_sku: variant.baseSku,
      inferred_size: inferredSize,
      family_group_key: null,
      grouping_confidence: null,
      variant_axis: null,
      variant_value: null,
      family_group_meta: null,
    };
  });

  applyVariantBucketGrouping(parsed, results, null, threshold);

  // Title-stem: same normalized stem, tolerant attrs, ≥2 distinct sizes from title path.
  if (enableStem) {
    const stemToIdxs = new Map<string, number[]>();
    results.forEach((r, idx) => {
      if (r.family_group_key) return;
      const p = parsed[idx];
      if (p.variant.source !== "title_or_specs" || !p.variant.value || p.variant.axis !== "size") return;
      const stem = normalizeTitleStem(p.title);
      if (stem.length < guards.minStemTokenLength) return;
      const list = stemToIdxs.get(stem) ?? [];
      list.push(idx);
      stemToIdxs.set(stem, list);
    });

    for (const [stem, idxs] of stemToIdxs) {
      if (idxs.length < 2) continue;
      const subgroups = partitionIntoPairwiseCompatibleGroups(idxs, "size", (j) => parsed[j].attrs);
      for (const g of subgroups) {
        if (g.length < 2) continue;
        if (g.some((i) => results[i].family_group_key)) continue;
        const sizes = new Set(g.map((i) => results[i].inferred_size).filter(Boolean));
        if (sizes.size < 2) continue;
        const attrsList = g.map((i) => parsed[i].attrs);
        const skuStem = g
          .map((i) => normalizeSkuStemAlnum(String(parsed[i].row.sku ?? "")))
          .filter((s) => s.length >= 4)
          .sort((a, b) => b.length - a.length)[0];
        const baseSku = skuStem || stem.slice(0, 48);
        let innerKey: string;
        try {
          innerKey = buildFamilyGroupKeyFromConsensus(baseSku, attrsList, "size");
        } catch {
          innerKey = `${stem.slice(0, 120)}\0${[...g].sort((a, b) => a - b).join(",")}`;
        }
        const syntheticKey = `stem\0${innerKey.slice(0, 280)}`;
        for (const i of g) {
          parsed[i].variant = {
            ...parsed[i].variant,
            source: "title_stem_cluster",
            confidence: TITLE_STEM_CLUSTER_CONFIDENCE,
            baseSku,
          };
          results[i].family_group_key = syntheticKey;
          results[i].grouping_confidence = TITLE_STEM_CLUSTER_CONFIDENCE;
          results[i].variant_axis = "size";
          results[i].variant_value = results[i].inferred_size || null;
          results[i].inferred_base_sku = baseSku;
        }
      }
    }
  }

  // High title similarity + size in title; SKU did not yield a confident variant parse.
  if (enableTitleDesc) {
    const stemToIdxs = new Map<string, number[]>();
    for (let idx = 0; idx < results.length; idx++) {
      if (results[idx].family_group_key) continue;
      const p = parsed[idx];
      if (p.variant.source !== "none" && p.variant.confidence >= threshold) continue;
      const t = p.title.trim();
      if (t.length < guards.minTitleLengthForDescriptionCluster) continue;
      const stem = normalizeTitleStem(t);
      if (stem.length < guards.minStemTokenLength) continue;
      const list = stemToIdxs.get(stem) ?? [];
      list.push(idx);
      stemToIdxs.set(stem, list);
    }

    for (const [stem, idxs] of stemToIdxs) {
      if (idxs.length < 2) continue;
      const subgroups = partitionIntoPairwiseCompatibleGroups(idxs, "size", (j) => parsed[j].attrs);
      for (const g of subgroups) {
        if (g.length < 2) continue;
        if (g.some((i) => results[i].family_group_key)) continue;
        const gSized = g.filter((i) => inferSizeFromTitleOrSpecs(parsed[i].title));
        if (gSized.length < 2) continue;
        const titles = gSized.map((i) => parsed[i].title);
        if (minPairwiseTitleJaccard(titles) < guards.minTitleDescriptionSimilarity) continue;
        const sizes = new Set(
          gSized.map((i) => inferSizeFromTitleOrSpecs(parsed[i].title)).filter(Boolean) as string[]
        );
        if (sizes.size < 2) continue;
        const skuStem = gSized
          .map((i) => normalizeSkuStemAlnum(String(parsed[i].row.sku ?? "")))
          .filter((s) => s.length >= 4)
          .sort((a, b) => b.length - a.length)[0];
        const baseSku = (skuStem && skuStem.length >= 4 ? skuStem : stem.slice(0, 48)) || "unknown";
        for (const i of gSized) {
          const sz = inferSizeFromTitleOrSpecs(parsed[i].title);
          if (!sz) continue;
          parsed[i].variant = {
            baseSku,
            axis: "size",
            value: sz,
            confidence: TITLE_DESCRIPTION_PARSE_CONFIDENCE,
            source: "title_description_cluster",
          };
          results[i].inferred_size = sz;
          results[i].inferred_base_sku = baseSku;
        }
        let innerKey: string;
        try {
          innerKey = buildFamilyGroupKeyFromConsensus(
            baseSku,
            gSized.map((i) => parsed[i].attrs),
            "size"
          );
        } catch {
          continue;
        }
        const syntheticKey = `titlesim\0${innerKey.slice(0, 280)}`;
        for (const i of gSized) {
          if (!parsed[i].variant.value) continue;
          results[i].family_group_key = syntheticKey;
          results[i].variant_axis = "size";
          results[i].variant_value = parsed[i].variant.value;
          results[i].grouping_confidence = TITLE_DESCRIPTION_PARSE_CONFIDENCE;
        }
      }
    }
  }

  if (enableAi && options.aiVariantHint) {
    const aiHint = options.aiVariantHint;
    const touched = new Set<number>();
    let calls = 0;
    for (let i = 0; i < results.length && calls < aiMax; i++) {
      if (results[i].family_group_key) continue;
      const nd = parsed[i].row.normalized_data ?? {};
      const sku = String(parsed[i].row.sku ?? "");
      const title = parsed[i].title;
      const description = String(nd.description ?? nd.long_description ?? "").slice(0, 2000);
      if (!title.trim() && !sku.trim()) continue;
      const hint = await aiHint({ sku, title, description });
      calls++;
      if (!hint || hint.axis === "none" || !hint.value) continue;
      const conf = Math.min(hint.confidence ?? 0.62, 0.72);
      parsed[i].variant = {
        ...hint,
        confidence: conf,
        source: "ai_variant_hint",
      };
      touched.add(i);
      if (hint.axis === "size") {
        results[i].inferred_size = hint.value;
      }
      results[i].inferred_base_sku = hint.baseSku.trim();
    }
    if (touched.size > 0) {
      applyVariantBucketGrouping(parsed, results, touched, aiTh);
    }
  }

  const keyToIndices = new Map<string, number[]>();
  results.forEach((r, idx) => {
    if (!r.family_group_key || !r.variant_axis) return;
    const list = keyToIndices.get(r.family_group_key) ?? [];
    list.push(idx);
    keyToIndices.set(r.family_group_key, list);
  });

  const passingKeys = new Set<string>();

  for (const [familyGroupKey, idxs] of keyToIndices) {
    if (idxs.length <= 1) continue;

    const axisSet = new Set(idxs.map((i) => results[i].variant_axis).filter(Boolean));
    if (axisSet.size !== 1) {
      for (const i of idxs) clearInferredFamilyFields(results[i]);
      continue;
    }
    const axis = idxs.map((i) => results[i].variant_axis)[0] as VariantAxis;

    let attrSafe = true;
    for (let a = 0; a < idxs.length && attrSafe; a++) {
      const attrsA = rowAttrs(parsed[idxs[a]].row);
      for (let b = a + 1; b < idxs.length && attrSafe; b++) {
        const attrsB = rowAttrs(parsed[idxs[b]].row);
        if (!attrsCompatiblePair(attrsA, attrsB, axis)) attrSafe = false;
      }
    }
    if (!attrSafe) {
      for (const i of idxs) clearInferredFamilyFields(results[i]);
      continue;
    }

    const { ok: coreOk, flags: coreFlags } = coreIdentityViolations(idxs, parsed, guards.strictCoreIdentity);
    if (!coreOk) {
      for (const i of idxs) clearInferredFamilyFields(results[i]);
      continue;
    }

    const stemCluster = isStemClusterFamilyKey(familyGroupKey);
    const titleSimCluster = isTitleSimClusterFamilyKey(familyGroupKey);
    const allStrongSize = idxs.every((i) => isStrongSkuSizeSuffix(parsed[i].variant));
    const titleWaiver = allStrongSize && !stemCluster && !titleSimCluster;
    const titles = idxs.map((i) => parsed[i].title);
    const minTitleJ = minPairwiseTitleJaccard(titles);
    const titleThreshold = stemCluster
      ? guards.minTitleSimilarityStem
      : titleSimCluster
        ? guards.minTitleDescriptionSimilarity
        : guards.minTitleSimilarity;
    if (!titleWaiver && minTitleJ < titleThreshold) {
      for (const i of idxs) clearInferredFamilyFields(results[i]);
      continue;
    }

    const bases = idxs.map((i) => parsed[i].variant.baseSku);
    const skuStemCoherence = minPairwiseSkuStemCoherence(bases);
    const variants = idxs.map((i) => parsed[i].variant);
    const { factor: tierFactor, tier } = sourceTierMultiplier(variants.map((v) => v.source));
    const { score, breakdown, flags: scoreFlags } = computeFamilyGroupingScore({
      variants,
      minTitleJaccard: titleWaiver ? null : minTitleJ,
      titleWaiver,
      stemCluster: stemCluster || titleSimCluster,
      coreIdentityOk: true,
      skuStemCoherence,
      sourceTierFactor: tierFactor,
      guards,
    });

    const meta: FamilyGroupMetaV1 = {
      v: 1,
      score,
      breakdown,
      flags: [...coreFlags, ...scoreFlags],
      title_similarity_min: titleWaiver ? null : minTitleJ,
      variant_axis: axis,
      row_count: idxs.length,
      sources: [...new Set(variants.map((v) => v.source))],
      grouping_tier: tier,
    };

    for (const i of idxs) {
      results[i].grouping_confidence = score;
      results[i].family_group_meta = meta;
    }
    passingKeys.add(familyGroupKey);
  }

  for (const r of results) {
    if (r.family_group_key && !passingKeys.has(r.family_group_key)) {
      clearInferredFamilyFields(r);
    }
  }

  return results;
}
