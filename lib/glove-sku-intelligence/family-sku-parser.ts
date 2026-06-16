import {
  decodeHospecoCompactManufacturerSku,
  normalizeGloveSizeCode,
  type GloveSizeCode,
} from "./glove-size-normalization";

export type SkuFamilyParsePattern =
  | "hyphenated"
  | "glued_letter"
  | "glued_compact"
  | "numeric"
  | "vendor_plugin";

export type SkuFamilyParse = {
  rawSku: string;
  parentBase: string;
  sizeCode: string;
  matchedSuffix: string;
  pattern: SkuFamilyParsePattern;
  confidence: number;
  evidence: string[];
  decoderId?: string;
};

export type SkuFamilyCluster = {
  parentBase: string;
  members: SkuFamilyParse[];
  confidence: number;
  evidence: string[];
  sizeCodes: string[];
};

export type ParseManufacturerSkuFamilyContext = {
  /** All SKUs in the candidate family — enables collision-safe suffix choice. */
  clusterMembers?: string[];
};

const INTERNAL_SKU_RE = /^(GLV|GC)[-_]/i;

/** Minimum confidence to use parse result in stripKnownSizeSuffix. */
export const STRIP_SUFFIX_MIN_CONFIDENCE = 0.7;

const F_BASE_PATTERN = /^[A-Z0-9]{4,}F$/;

/** Size suffixes glued after an F-terminated merchandise base (longest first; X before L). */
const F_TERMINATED_SIZE_SUFFIXES: ReadonlyArray<{ suffix: string; sizeCode: string }> = [
  { suffix: "XXXL", sizeCode: "XXXL" },
  { suffix: "XXL", sizeCode: "XXL" },
  { suffix: "XL", sizeCode: "XL" },
  { suffix: "XS", sizeCode: "XS" },
  { suffix: "X", sizeCode: "X" },
  { suffix: "L", sizeCode: "L" },
  { suffix: "M", sizeCode: "M" },
  { suffix: "S", sizeCode: "S" },
];

const HYPHENATED_SUFFIXES: ReadonlyArray<{ suffix: string; sizeCode: string }> = [
  { suffix: "XXXL", sizeCode: "XXXL" },
  { suffix: "XXL", sizeCode: "XXL" },
  { suffix: "XL", sizeCode: "XL" },
  { suffix: "XS", sizeCode: "XS" },
  { suffix: "SM", sizeCode: "S" },
  { suffix: "MD", sizeCode: "M" },
  { suffix: "LG", sizeCode: "L" },
  { suffix: "S", sizeCode: "S" },
  { suffix: "M", sizeCode: "M" },
  { suffix: "L", sizeCode: "L" },
  { suffix: "X", sizeCode: "X" },
];

const GLUED_SUFFIXES: ReadonlyArray<{ suffix: string; sizeCode: string }> = [
  { suffix: "XXXL", sizeCode: "XXXL" },
  { suffix: "XXL", sizeCode: "XXL" },
  { suffix: "XL", sizeCode: "XL" },
  { suffix: "XS", sizeCode: "XS" },
  { suffix: "SM", sizeCode: "S" },
  { suffix: "MD", sizeCode: "M" },
  { suffix: "LG", sizeCode: "L" },
];

const SINGLE_CHAR_SUFFIXES: ReadonlyArray<{ suffix: string; sizeCode: string }> = [
  { suffix: "S", sizeCode: "S" },
  { suffix: "M", sizeCode: "M" },
  { suffix: "L", sizeCode: "L" },
  { suffix: "X", sizeCode: "X" },
];

const NUMERIC_GLOVE_SIZE_RE = /^(0[7-9]|1[0-3])$/;

function normalizeSku(raw: string): string {
  return raw.trim().toUpperCase();
}

function memberSet(context?: ParseManufacturerSkuFamilyContext): Set<string> {
  const set = new Set<string>();
  for (const m of context?.clusterMembers ?? []) {
    const s = normalizeSku(m);
    if (s) set.add(s);
  }
  return set;
}

/** Reject strip when the proposed base equals another cluster member's full SKU. */
function isBaseCollision(parentBase: string, rawSku: string, members: Set<string>): boolean {
  if (members.size === 0) return false;
  const base = normalizeSku(parentBase);
  if (base === normalizeSku(rawSku)) return false;
  return members.has(base);
}

function parseFromHospecoPlugin(raw: string): SkuFamilyParse | null {
  const decoded = decodeHospecoCompactManufacturerSku(raw);
  if (!decoded) return null;

  const canonical = decoded.canonicalSku;
  const hyphenated = canonical.match(/^(.+)-([A-Z]{1,3})$/);
  const parentBase = hyphenated?.[1] ?? canonical;
  const matchedSuffix = raw.slice(parentBase.length).replace(/^-/, "") || decoded.rawSku.slice(parentBase.length);

  return {
    rawSku: normalizeSku(raw),
    parentBase,
    sizeCode: decoded.normalizedCode,
    matchedSuffix: matchedSuffix || decoded.normalizedCode,
    pattern: "vendor_plugin",
    confidence: 0.95,
    evidence: [`hospeco_compact:${decoded.rawSku}`, `canonical:${canonical}`],
    decoderId: "hospeco_gl_n125f",
  };
}

/**
 * F-terminated merchandise base + glued size suffix (e.g. N105ORF + XL → N105ORFXL).
 * Distinct from Hospeco compact where F is part of the compact token (GL-N125 + FL).
 */
function parseFromFTerminatedMerchandiseBase(
  raw: string,
  members: Set<string>
): SkuFamilyParse | null {
  const s = normalizeSku(raw);
  if (!s) return null;

  // Hospeco GL-N125* compact SKUs are handled by the Hospeco plugin first.
  if (/^[A-Z]{2,}-N\d/.test(s)) return null;

  for (const { suffix, sizeCode } of F_TERMINATED_SIZE_SUFFIXES) {
    if (!s.endsWith(suffix) || s.length <= suffix.length + 4) continue;
    const parentBase = s.slice(0, -suffix.length);
    if (!F_BASE_PATTERN.test(parentBase)) continue;
    if (isBaseCollision(parentBase, s, members)) continue;
    const normalized = normalizeGloveSizeCode(sizeCode) ?? sizeCode;
    return {
      rawSku: s,
      parentBase,
      sizeCode: normalized,
      matchedSuffix: suffix,
      pattern: "glued_compact",
      confidence: members.size >= 2 ? 0.94 : 0.9,
      evidence: [`f_terminated:${suffix}`, `base:${parentBase}`],
      decoderId: "f_terminated_merchandise",
    };
  }
  return null;
}

function tryHyphenatedParse(
  s: string,
  members: Set<string>
): SkuFamilyParse | null {
  for (const { suffix, sizeCode } of HYPHENATED_SUFFIXES) {
    const tail = `-${suffix}`;
    if (!s.endsWith(tail) || s.length <= tail.length + 2) continue;
    const parentBase = s.slice(0, -tail.length);
    if (isBaseCollision(parentBase, s, members)) continue;
    const normalized = normalizeGloveSizeCode(sizeCode) ?? sizeCode;
    return {
      rawSku: s,
      parentBase,
      sizeCode: normalized,
      matchedSuffix: tail,
      pattern: "hyphenated",
      confidence: members.size >= 2 ? 0.9 : 0.82,
      evidence: [`hyphenated:${tail}`],
    };
  }
  return null;
}

function tryGluedParse(
  s: string,
  members: Set<string>,
  allowSingleChar: boolean
): SkuFamilyParse | null {
  for (const { suffix, sizeCode } of GLUED_SUFFIXES) {
    if (!s.endsWith(suffix) || s.length <= suffix.length + 2) continue;
    const parentBase = s.slice(0, -suffix.length);
    if (!/[A-Z0-9]$/.test(parentBase)) continue;
    if (isBaseCollision(parentBase, s, members)) continue;
    const normalized = normalizeGloveSizeCode(sizeCode) ?? sizeCode;
    return {
      rawSku: s,
      parentBase,
      sizeCode: normalized,
      matchedSuffix: suffix,
      pattern: "glued_letter",
      confidence: members.size >= 2 ? 0.88 : 0.78,
      evidence: [`glued:${suffix}`],
    };
  }

  if (allowSingleChar) {
    for (const { suffix, sizeCode } of SINGLE_CHAR_SUFFIXES) {
      if (!s.endsWith(suffix) || s.length <= suffix.length + 3) continue;
      const parentBase = s.slice(0, -suffix.length);
      if (!/[A-Z0-9]$/.test(parentBase)) continue;
      if (isBaseCollision(parentBase, s, members)) continue;
      const normalized = normalizeGloveSizeCode(sizeCode) ?? sizeCode;
      return {
        rawSku: s,
        parentBase,
        sizeCode: normalized,
        matchedSuffix: suffix,
        pattern: "glued_letter",
        confidence: 0.86,
        evidence: [`glued_single:${suffix}`, "cluster_validated"],
      };
    }
  }
  return null;
}

function tryNumericParse(s: string, members: Set<string>): SkuFamilyParse | null {
  if (members.size < 2) return null;

  const numericMembers = [...members].filter((m) => {
    const n = m.slice(-2);
    return NUMERIC_GLOVE_SIZE_RE.test(n);
  });
  if (numericMembers.length < 2) return null;

  const bases = new Set(
    numericMembers.map((m) => {
      const n = m.slice(-2);
      return m.slice(0, -n.length);
    })
  );
  if (bases.size !== 1) return null;

  const sizeSuffix = s.slice(-2);
  if (!NUMERIC_GLOVE_SIZE_RE.test(sizeSuffix)) return null;
  const parentBase = s.slice(0, -2);
  if (normalizeSku([...bases][0]!) !== parentBase) return null;
  if (isBaseCollision(parentBase, s, members)) return null;

  return {
    rawSku: s,
    parentBase,
    sizeCode: sizeSuffix,
    matchedSuffix: sizeSuffix,
    pattern: "numeric",
    confidence: 0.88,
    evidence: ["numeric_glove_size_cluster"],
  };
}

function hasClusterEvidence(context?: ParseManufacturerSkuFamilyContext): boolean {
  return (context?.clusterMembers?.length ?? 0) >= 2;
}

/** Family-aware manufacturer SKU parse (single SKU). */
export function parseManufacturerSkuFamily(
  sku: string,
  context?: ParseManufacturerSkuFamilyContext
): SkuFamilyParse | null {
  const s = normalizeSku(sku);
  if (!s) return null;
  if (INTERNAL_SKU_RE.test(s)) return null;

  const members = memberSet(context);
  if (members.size === 0) members.add(s);

  const hospeco = parseFromHospecoPlugin(s);
  if (hospeco) return hospeco;

  const fTerminated = parseFromFTerminatedMerchandiseBase(s, members);
  if (fTerminated) return fTerminated;

  const numeric = tryNumericParse(s, members);
  if (numeric) return numeric;

  const hyphenated = tryHyphenatedParse(s, members);
  if (hyphenated) return hyphenated;

  const glued = tryGluedParse(s, members, hasClusterEvidence(context));
  if (glued) return glued;

  return null;
}

/** Cluster candidate manufacturer SKUs by inferred parent base. */
export function clusterSkuFamily(members: string[]): SkuFamilyCluster | null {
  const normalized = [...new Set(members.map(normalizeSku).filter(Boolean))];
  if (normalized.length === 0) return null;

  const ctx: ParseManufacturerSkuFamilyContext = { clusterMembers: normalized };
  const parses: SkuFamilyParse[] = [];

  for (const sku of normalized) {
    const parse = parseManufacturerSkuFamily(sku, ctx);
    if (parse) parses.push(parse);
  }

  if (parses.length === 0) return null;

  const byBase = new Map<string, SkuFamilyParse[]>();
  for (const p of parses) {
    const list = byBase.get(p.parentBase) ?? [];
    list.push(p);
    byBase.set(p.parentBase, list);
  }

  let best: SkuFamilyCluster | null = null;
  for (const [parentBase, group] of byBase) {
    const sizeCodes = [...new Set(group.map((g) => g.sizeCode))];
    if (sizeCodes.length !== group.length) continue;

    const confidence =
      group.reduce((sum, g) => sum + g.confidence, 0) / group.length +
      (group.length >= 3 ? 0.05 : 0);

    const cluster: SkuFamilyCluster = {
      parentBase,
      members: group,
      confidence: Math.min(0.98, confidence),
      evidence: group.flatMap((g) => g.evidence),
      sizeCodes,
    };

    if (!best || group.length > best.members.length || cluster.confidence > best.confidence) {
      best = cluster;
    }
  }

  if (best && best.members.length >= 2) return best;

  if (parses.length === 1 && parses[0]) {
    const p = parses[0]!;
    return {
      parentBase: p.parentBase,
      members: [p],
      confidence: p.confidence,
      evidence: p.evidence,
      sizeCodes: [p.sizeCode],
    };
  }

  return best;
}

/** Strip trailing size suffix using family-aware parser (backward-compatible wrapper). */
export function stripKnownSizeSuffixWithParser(
  input: string,
  context?: ParseManufacturerSkuFamilyContext
): string {
  const s = normalizeSku(input);
  if (!s) return s;

  const members = context?.clusterMembers ?? (context ? [] : [s]);
  const parse = parseManufacturerSkuFamily(s, {
    clusterMembers: members.length > 0 ? members : [s],
  });

  if (parse && parse.confidence >= STRIP_SUFFIX_MIN_CONFIDENCE) {
    return parse.parentBase;
  }

  return s;
}

/** Resolve size code from a manufacturer SKU using the family parser. */
export function sizeCodeFromManufacturerSku(
  sku: string,
  context?: ParseManufacturerSkuFamilyContext
): string | null {
  const parse = parseManufacturerSkuFamily(sku, context);
  if (!parse) return null;
  return normalizeGloveSizeCode(parse.sizeCode) ?? parse.sizeCode;
}

export type { GloveSizeCode };
