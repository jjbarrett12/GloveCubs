import type { CompareWizardRow } from "@/lib/catalog/compare-wizard-utils.types";

export type { CompareWizardRow } from "@/lib/catalog/compare-wizard-utils.types";

export type CompareWizardSortKey =
  | "sku"
  | "name"
  | "boxesPerCase"
  | "sizes"
  | "material"
  | "color"
  | "thicknessMil"
  | "grade"
  | "certifications"
  | "casePrice"
  | "palletPrice"
  | "bestFor";

export type CompareWizardSortDir = "asc" | "desc";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL"] as const;

const NUMERIC_SORT_KEYS = new Set<CompareWizardSortKey>(["casePrice", "palletPrice", "boxesPerCase", "thicknessMil"]);

export function finitePositive(n: unknown): number | null {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  return x;
}

function parseCommercePackaging(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1) return null;
  return o;
}

function boxesFromPackagingSummary(caseLabel: string | null | undefined): number | null {
  if (!caseLabel?.trim()) return null;
  const m = caseLabel.trim().match(/^(\d+(?:\.\d+)?)\s+(?:boxes?|bx\b|inner|pack)/i);
  if (!m) return null;
  return finitePositive(Number(m[1]));
}

/** Storefront-safe boxes/case resolution — no guessed values when math is unsafe. */
export function resolveBoxesPerCase(
  meta: Record<string, unknown> | null | undefined,
  caseLabel: string | null | undefined
): number | null {
  if (!meta) return boxesFromPackagingSummary(caseLabel);

  const rootBoxes = finitePositive(meta.boxes_per_case);
  if (rootBoxes) return rootBoxes;

  const cp = parseCommercePackaging(meta.commerce_packaging);
  if (cp) {
    const inners = finitePositive(cp.inners_per_case);
    if (inners) return inners;

    const boxesPerCase = finitePositive(cp.boxes_per_case);
    if (boxesPerCase) return boxesPerCase;

    const unitsPerCase = finitePositive(cp.units_per_case);
    const unitsPerInner = finitePositive(cp.units_per_inner);
    if (unitsPerCase != null && unitsPerInner != null && unitsPerInner > 0 && unitsPerCase % unitsPerInner === 0) {
      const computed = unitsPerCase / unitsPerInner;
      if (computed >= 1 && computed <= 9999) return computed;
    }
  }

  return boxesFromPackagingSummary(caseLabel);
}

export function normalizeSizeCode(code: string): string {
  const upper = code.trim().toUpperCase();
  if (upper === "ONE_SIZE" || upper === "ONE SIZE") return "One Size";
  return upper;
}

export function formatSizeRange(codes: string[]): string | null {
  const normalized = codes.map(normalizeSizeCode).filter(Boolean);
  const unique = Array.from(new Set(normalized));
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  const sorted = unique.sort((a, b) => sizeRank(a) - sizeRank(b));
  return `${sorted[0]}–${sorted[sorted.length - 1]}`;
}

function sizeRank(size: string): number {
  if (size === "One Size") return 0;
  const idx = SIZE_ORDER.indexOf(size as (typeof SIZE_ORDER)[number]);
  return idx === -1 ? 999 : idx;
}

/** Expand a size range label or single code into comparable size tokens. */
export function expandSizeCodes(sizeLabel: string | null, rawCodes: string[]): string[] {
  const fromRaw = rawCodes.map(normalizeSizeCode).filter(Boolean);
  if (fromRaw.length > 0) return Array.from(new Set(fromRaw));

  if (!sizeLabel?.trim()) return [];
  const label = sizeLabel.trim();
  if (label === "One Size") return ["One Size"];

  const parts = label.split(/[–-]/).map((p) => normalizeSizeCode(p));
  if (parts.length === 1) return [parts[0]];

  const start = sizeRank(parts[0]);
  const end = sizeRank(parts[1]);
  if (start === 999 || end === 999 || start > end) return parts;

  const inRange = SIZE_ORDER.filter((code) => {
    const rank = sizeRank(code);
    return rank >= start && rank <= end;
  });
  return inRange.length > 0 ? [...inRange] : parts;
}

export function sizeFilterMatches(row: Pick<CompareWizardRow, "sizes" | "sizeCodes">, selectedSize: string): boolean {
  if (!selectedSize) return true;
  const target = normalizeSizeCode(selectedSize);
  const codes = expandSizeCodes(row.sizes, row.sizeCodes);
  return codes.includes(target);
}

export function parseThicknessMil(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const m = value.match(/[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function isMissingValue(row: CompareWizardRow, key: CompareWizardSortKey): boolean {
  if (NUMERIC_SORT_KEYS.has(key)) {
    if (key === "thicknessMil") return parseThicknessMil(row.thicknessMil) == null;
    const val = row[key as "casePrice" | "palletPrice" | "boxesPerCase"];
    return val == null;
  }
  const val = row[key];
  return val == null || (typeof val === "string" && !val.trim());
}

export function compareCompareWizardRows(
  a: CompareWizardRow,
  b: CompareWizardRow,
  key: CompareWizardSortKey
): number {
  const missingA = isMissingValue(a, key);
  const missingB = isMissingValue(b, key);
  if (missingA && missingB) return 0;
  if (missingA) return 1;
  if (missingB) return -1;

  if (key === "casePrice" || key === "palletPrice" || key === "boxesPerCase") {
    return (a[key] as number) - (b[key] as number);
  }

  if (key === "thicknessMil") {
    return parseThicknessMil(a.thicknessMil)! - parseThicknessMil(b.thicknessMil)!;
  }

  const av = String(a[key] ?? "").toLowerCase();
  const bv = String(b[key] ?? "").toLowerCase();
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

export function sortCompareWizardRows(
  rows: CompareWizardRow[],
  key: CompareWizardSortKey,
  dir: CompareWizardSortDir
): CompareWizardRow[] {
  return [...rows].sort((a, b) => {
    const missingA = isMissingValue(a, key);
    const missingB = isMissingValue(b, key);
    if (missingA && missingB) return 0;
    if (missingA) return 1;
    if (missingB) return -1;

    let cmp = 0;
    if (key === "casePrice" || key === "palletPrice" || key === "boxesPerCase") {
      cmp = (a[key] as number) - (b[key] as number);
    } else if (key === "thicknessMil") {
      cmp = parseThicknessMil(a.thicknessMil)! - parseThicknessMil(b.thicknessMil)!;
    } else {
      const av = String(a[key] ?? "").toLowerCase();
      const bv = String(b[key] ?? "").toLowerCase();
      cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

export function rowMatchesCompareWizardSearch(row: CompareWizardRow, q: string): boolean {
  if (!q) return true;
  const hay = [
    row.sku,
    row.name,
    row.material,
    row.color,
    row.grade,
    row.certifications,
    row.bestFor,
    row.sizes,
    row.thicknessMil,
    row.industries.join(" "),
    row.badges.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function filterCompareWizardRows(
  rows: CompareWizardRow[],
  filters: {
    material?: string;
    industry?: string;
    grade?: string;
    color?: string;
    size?: string;
    search?: string;
  }
): CompareWizardRow[] {
  const q = (filters.search ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.material && row.material !== filters.material) return false;
    if (filters.grade && row.grade !== filters.grade) return false;
    if (filters.color && row.color !== filters.color) return false;
    if (filters.size && !sizeFilterMatches(row, filters.size)) return false;
    if (filters.industry && !row.industries.includes(filters.industry)) return false;
    return rowMatchesCompareWizardSearch(row, q);
  });
}

export function buildCompareWizardPdpHref(slug: string): string {
  return `/store/p/${encodeURIComponent(slug)}`;
}

export function isStorefrontGcSku(sku: string | null | undefined): boolean {
  return typeof sku === "string" && sku.trim().toUpperCase().startsWith("GC-");
}

export function storefrontSafeCasePrice(casePrice: number | null | undefined): number | null {
  if (casePrice == null || !Number.isFinite(casePrice) || casePrice <= 0) return null;
  return casePrice;
}

export function storefrontSafePalletPrice(
  palletPrice: number | null | undefined,
  palletPricingAvailable: boolean
): number | null {
  if (!palletPricingAvailable) return null;
  if (palletPrice == null || !Number.isFinite(palletPrice) || palletPrice <= 0) return null;
  return palletPrice;
}

export function uniqueIndividualSizeOptions(rows: CompareWizardRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    for (const code of expandSizeCodes(row.sizes, row.sizeCodes)) set.add(code);
  }
  return Array.from(set).sort((a, b) => sizeRank(a) - sizeRank(b));
}

/** Public row surface — blocks accidental supplier/admin field exposure in tests. */
export const PUBLIC_COMPARE_WIZARD_ROW_KEYS = [
  "id",
  "slug",
  "sku",
  "name",
  "boxesPerCase",
  "sizes",
  "sizeCodes",
  "material",
  "color",
  "thicknessMil",
  "grade",
  "certifications",
  "casePrice",
  "palletPrice",
  "bestFor",
  "industries",
  "badges",
  "pdpHref",
] as const;
