export type GloveSizeCode = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "XXXL";

export const GLOVE_SIZE_SORT_ORDER: GloveSizeCode[] = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const SIZE_ALIASES: Array<{ code: GloveSizeCode; patterns: RegExp[] }> = [
  { code: "XXXL", patterns: [/\bxxx[\s-]?large\b/i, /\b3\s*xl\b/i, /\b3x[\s-]?large\b/i, /\bxxxl\b/i] },
  { code: "XXL", patterns: [/\bxx[\s-]?large\b/i, /\b2\s*xl\b/i, /\b2x[\s-]?large\b/i, /\bxxl\b/i] },
  { code: "XL", patterns: [/\bx[\s-]?large\b/i, /\bextra\s+large\b/i, /\bxl\b/i] },
  { code: "XS", patterns: [/\bx[\s-]?small\b/i, /\bextra\s+small\b/i, /\bxs\b/i] },
  { code: "L", patterns: [/\blarge\b/i, /\blg\b/i, /\b(?<![x])l\b/i] },
  { code: "M", patterns: [/\bmedium\b/i, /\bmed\b/i, /\bm\b/i] },
  { code: "S", patterns: [/\bsmall\b/i, /\bsm\b/i, /\b(?<![x])s\b/i] },
];

/** Normalize glove size label to standard code (XS–XXXL) or null. */
export function normalizeGloveSizeCode(input: string): GloveSizeCode | null {
  const t = input.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  if (GLOVE_SIZE_SORT_ORDER.includes(upper as GloveSizeCode)) return upper as GloveSizeCode;
  const lower = t.toLowerCase();
  for (const { code, patterns } of SIZE_ALIASES) {
    if (patterns.some((p) => p.test(lower))) return code;
  }
  return null;
}

/** Canonical display label for a size phrase (e.g. "X-Small" → "XS"). */
export function normalizeGloveSizeLabel(input: string): string | null {
  const code = normalizeGloveSizeCode(input);
  return code;
}

/** Hospeco compact suffixes glued after GL-N125 (includes grade F). Longest first. */
const HOSPECO_COMPACT_SUFFIXES: ReadonlyArray<{ compact: string; code: GloveSizeCode }> = [
  { compact: "FXS", code: "XS" },
  { compact: "FS", code: "S" },
  { compact: "FM", code: "M" },
  { compact: "FL", code: "L" },
  { compact: "FX", code: "XL" },
];

/**
 * Decode Hospeco compact manufacturer SKUs (e.g. GL-N125FL → L, GL-N125F-XL unchanged).
 * Returns canonical hyphenated manufacturer SKU when recognized.
 */
export function decodeHospecoCompactManufacturerSku(
  raw: string
): { normalizedCode: GloveSizeCode; canonicalSku: string; rawSku: string } | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;

  const hyphenated = s.match(/^([A-Z]{2,}-N\d+F)-([A-Z]{1,3})$/);
  if (hyphenated) {
    const code = normalizeGloveSizeCode(hyphenated[2]!);
    if (code) {
      return {
        normalizedCode: code,
        canonicalSku: `${hyphenated[1]}-${code}`,
        rawSku: s,
      };
    }
  }

  for (const { compact, code } of HOSPECO_COMPACT_SUFFIXES) {
    if (!s.endsWith(compact) || s.length <= compact.length + 3) continue;
    const base = s.slice(0, -compact.length);
    if (!/^[A-Z]{2,}-N\d+$/.test(base)) continue;
    return {
      normalizedCode: code,
      canonicalSku: `${base}F-${code}`,
      rawSku: s,
    };
  }

  return null;
}

/** Canonicalize manufacturer SKU when Hospeco compact form is recognized. */
export function canonicalizeManufacturerSku(raw: string): string {
  const decoded = decodeHospecoCompactManufacturerSku(raw);
  return decoded?.canonicalSku ?? raw.trim().toUpperCase();
}

/** Sort size codes in natural glove order (XS → XXXL). Unknown codes sort last. */
export function sortGloveSizeCodes(sizeCodes: string[]): string[] {
  const rank = new Map(GLOVE_SIZE_SORT_ORDER.map((c, i) => [c, i]));
  return [...sizeCodes].sort((a, b) => {
    const au = a.trim().toUpperCase();
    const bu = b.trim().toUpperCase();
    const ra = rank.get(au as GloveSizeCode) ?? 999;
    const rb = rank.get(bu as GloveSizeCode) ?? 999;
    if (ra !== rb) return ra - rb;
    return au.localeCompare(bu);
  });
}
