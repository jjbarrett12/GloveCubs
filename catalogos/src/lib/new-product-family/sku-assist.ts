import {
  parseManufacturerSkuFamily,
  deriveGloveCubsParentSku,
  deriveGloveCubsVariantSku,
  detectSkuCollisionIssues,
  normalizeGloveSizeCode,
  type SkuFamilyParse,
  type GloveSizeCode,
} from "@glove-sku-intelligence";
import type { FamilySizeSlug, FamilyVariantRow, NewProductFamilyDraft } from "./types";
import { emptyVariantRow } from "./draft";

const GLUED_COMPACT_SUFFIX: Record<GloveSizeCode, string> = {
  XS: "XS",
  S: "SM",
  M: "MD",
  L: "LG",
  XL: "XL",
  XXL: "XXL",
  XXXL: "XXXL",
};

export function sizeSlugToCode(size: FamilySizeSlug): GloveSizeCode {
  return size.toUpperCase() as GloveSizeCode;
}

export function reconstructManufacturerSkuForSize(parse: SkuFamilyParse, size: GloveSizeCode): string | null {
  const base = parse.parentBase?.trim().toUpperCase();
  if (!base) return null;
  switch (parse.pattern) {
    case "hyphenated":
    case "vendor_plugin":
      return `${base}-${size}`;
    case "glued_letter": {
      const suffix = parse.matchedSuffix === "X" && parse.sizeCode === "XL" && size === "XL" ? "X" : size;
      if (parse.matchedSuffix === "X" && parse.sizeCode === "XL" && size !== "XL" && size.length > 1) {
        return `${base}${size}`;
      }
      return `${base}${suffix}`;
    }
    case "glued_compact": {
      const suffix = GLUED_COMPACT_SUFFIX[size];
      if (!suffix) return null;
      return `${base}${suffix}`;
    }
    case "numeric":
      return null;
    default:
      return null;
  }
}

export type ManufacturerSkuSuggestionResult = {
  parsed: boolean;
  exampleSize: FamilySizeSlug | null;
  parentBase: string | null;
  suggestions: Partial<Record<FamilySizeSlug, string>>;
};

/** Suggest remaining size SKUs from one typed example. Does not confirm. Returns empty suggestions if parse fails. */
export function suggestManufacturerSkusFromExample(
  example: string,
  sizes: FamilySizeSlug[]
): ManufacturerSkuSuggestionResult {
  const raw = example.trim();
  if (!raw) {
    return { parsed: false, exampleSize: null, parentBase: null, suggestions: {} };
  }
  const parse = parseManufacturerSkuFamily(raw);
  if (!parse) {
    return { parsed: false, exampleSize: null, parentBase: null, suggestions: {} };
  }
  const exampleSizeCode = normalizeGloveSizeCode(parse.sizeCode);
  const exampleSize = exampleSizeCode ? (exampleSizeCode.toLowerCase() as FamilySizeSlug) : null;
  const suggestions: Partial<Record<FamilySizeSlug, string>> = {};
  for (const size of sizes) {
    const code = sizeSlugToCode(size);
    const reconstructed = reconstructManufacturerSkuForSize(parse, code);
    if (exampleSize === size) {
      suggestions[size] = raw.trim().toUpperCase();
      continue;
    }
    if (reconstructed) suggestions[size] = reconstructed;
  }
  return { parsed: true, exampleSize, parentBase: parse.parentBase, suggestions };
}

export function applyManufacturerSuggestions(
  draft: NewProductFamilyDraft,
  suggestions: Partial<Record<FamilySizeSlug, string>>,
  exampleSize: FamilySizeSlug | null
): NewProductFamilyDraft {
  const variants: Record<string, FamilyVariantRow> = { ...draft.variants };
  for (const size of draft.sizes) {
    const row = variants[size] ?? emptyVariantRow(size);
    if (row.manufacturerConfirmed) continue;
    const suggested = suggestions[size] ?? null;
    const isExample = exampleSize === size && Boolean(suggested);
    variants[size] = {
      ...row,
      suggestedManufacturerSku: isExample ? null : suggested,
      manufacturerSku: isExample ? suggested ?? row.manufacturerSku : row.manufacturerSku,
      manufacturerConfirmed: isExample ? Boolean(suggested) : row.manufacturerConfirmed,
    };
    if (!isExample && !row.manufacturerConfirmed && suggested) {
      variants[size] = { ...variants[size]!, manufacturerSku: suggested, manufacturerConfirmed: false };
    }
  }
  return { ...draft, variants };
}

/** Explicit operator action: confirm every selected size that has a manufacturer SKU value. */
export function acceptAllManufacturerSuggestions(draft: NewProductFamilyDraft): NewProductFamilyDraft {
  const variants: Record<string, FamilyVariantRow> = {};
  for (const size of draft.sizes) {
    const row = draft.variants[size] ?? emptyVariantRow(size);
    const sku = row.manufacturerSku.trim() || row.suggestedManufacturerSku?.trim() || "";
    variants[size] = {
      ...row,
      manufacturerSku: sku,
      manufacturerConfirmed: sku.length > 0,
      suggestedManufacturerSku: sku ? null : row.suggestedManufacturerSku,
    };
  }
  return { ...draft, variants };
}

export function manufacturerSkuStatus(row: FamilyVariantRow): "incomplete" | "suggested" | "confirmed" {
  if (row.manufacturerConfirmed && row.manufacturerSku.trim()) return "confirmed";
  if (row.suggestedManufacturerSku && row.manufacturerSku.trim() && !row.manufacturerConfirmed) return "suggested";
  if (row.manufacturerSku.trim() && !row.manufacturerConfirmed) return "suggested";
  return "incomplete";
}

export function confirmedManufacturerSkus(draft: NewProductFamilyDraft): string[] {
  return draft.sizes
    .map((size) => draft.variants[size])
    .filter((row): row is FamilyVariantRow => Boolean(row?.manufacturerConfirmed && row.manufacturerSku.trim()))
    .map((row) => row.manufacturerSku.trim());
}

export function deriveFamilyGloveCubsSkus(draft: NewProductFamilyDraft): {
  parentSku: string | null;
  bySize: Partial<Record<FamilySizeSlug, string>>;
  warnings: string[];
} {
  const manufacturerSkus = confirmedManufacturerSkus(draft);
  const parent = deriveGloveCubsParentSku({
    manufacturerSkus,
    variantCount: draft.sizes.length,
  });
  const bySize: Partial<Record<FamilySizeSlug, string>> = {};
  if (!parent.value) {
    return { parentSku: null, bySize, warnings: parent.warnings };
  }
  for (const size of draft.sizes) {
    const variant = deriveGloveCubsVariantSku(parent.value, sizeSlugToCode(size));
    if (variant) bySize[size] = variant;
  }
  return { parentSku: parent.value, bySize, warnings: parent.warnings };
}

export function effectiveSupplierSku(draft: NewProductFamilyDraft, size: FamilySizeSlug): string {
  const row = draft.variants[size];
  if (!row) return "";
  if (draft.supplierSkuMirrorsManufacturer) return row.manufacturerSku.trim();
  return row.supplierSku.trim();
}

export type SkuCollisionInput = {
  existingParentSkus: Set<string>;
  existingVariantSkus: Set<string>;
};

/** GloveCubs SKUs already sitting in staging, ignoring supplier item numbers. */
export type SkuOwnerRow = {
  sku: string;
  ownedByDraft: boolean;
};

/** A SKU blocks a draft only when some other family or catalog row already uses it. */
export function skusOwnedByOthers(rows: SkuOwnerRow[]): string[] {
  const foreign = new Set<string>();
  for (const row of rows) {
    const sku = row.sku.trim().toUpperCase();
    if (!sku || row.ownedByDraft) continue;
    foreign.add(sku);
  }
  return [...foreign];
}

export function collectStagedGloveCubsSkus(
  rows: Array<{ inferred_base_sku?: string | null; normalized_data?: unknown }>
): { parentSkus: string[]; variantSkus: string[] } {
  const parentSkus: string[] = [];
  const variantSkus: string[] = [];
  for (const row of rows) {
    const base = row.inferred_base_sku?.trim().toUpperCase();
    if (base) parentSkus.push(base);
    if (!row.normalized_data || typeof row.normalized_data !== "object") continue;
    const record = row.normalized_data as Record<string, unknown>;
    const sku = typeof record.sku === "string" ? record.sku.trim().toUpperCase() : "";
    if (sku) variantSkus.push(sku);
    const proposals = record.sku_proposals;
    if (!proposals || typeof proposals !== "object") continue;
    const proposal = proposals as Record<string, unknown>;
    const parent = typeof proposal.applied_parent_sku === "string" ? proposal.applied_parent_sku.trim().toUpperCase() : "";
    if (parent) parentSkus.push(parent);
    const applied = proposal.applied_variant_skus;
    if (!applied || typeof applied !== "object") continue;
    for (const value of Object.values(applied as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) variantSkus.push(value.trim().toUpperCase());
    }
  }
  return { parentSkus, variantSkus };
}

export function familySkuCollisionIssues(
  draft: NewProductFamilyDraft,
  collisions: SkuCollisionInput
): { code: string; label: string }[] {
  const derived = deriveFamilyGloveCubsSkus(draft);
  const variantSkus = draft.sizes.map((s) => derived.bySize[s] ?? "").filter(Boolean);
  const manufacturerByVariant = draft.sizes.map((s) => draft.variants[s]?.manufacturerSku ?? "");
  return detectSkuCollisionIssues({
    parentSku: derived.parentSku,
    variantSkus,
    existingParentSkus: collisions.existingParentSkus,
    existingVariantSkus: collisions.existingVariantSkus,
    manufacturerSkusByVariant: manufacturerByVariant,
  });
}

export function duplicateManufacturerSkus(draft: NewProductFamilyDraft): string[] {
  const seen = new Map<string, number>();
  for (const size of draft.sizes) {
    const sku = draft.variants[size]?.manufacturerSku.trim().toUpperCase() ?? "";
    if (!sku) continue;
    seen.set(sku, (seen.get(sku) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([sku]) => sku);
}

export function applyExampleManufacturerSku(draft: NewProductFamilyDraft, example: string): NewProductFamilyDraft {
  const result = suggestManufacturerSkusFromExample(example, draft.sizes);
  return applyManufacturerSuggestions(
    { ...draft, manufacturerSkuExample: example },
    result.suggestions,
    result.exampleSize
  );
}

export function setSizeManufacturerSku(
  draft: NewProductFamilyDraft,
  size: FamilySizeSlug,
  sku: string
): NewProductFamilyDraft {
  const row = draft.variants[size] ?? emptyVariantRow(size);
  return {
    ...draft,
    variants: {
      ...draft.variants,
      [size]: {
        ...row,
        manufacturerSku: sku,
        manufacturerConfirmed: false,
      },
    },
  };
}

export function confirmManufacturerSku(draft: NewProductFamilyDraft, size: FamilySizeSlug): NewProductFamilyDraft {
  const row = draft.variants[size] ?? emptyVariantRow(size);
  const sku = row.manufacturerSku.trim() || row.suggestedManufacturerSku?.trim() || "";
  return {
    ...draft,
    variants: {
      ...draft.variants,
      [size]: {
        ...row,
        manufacturerSku: sku,
        manufacturerConfirmed: sku.length > 0,
        suggestedManufacturerSku: sku ? null : row.suggestedManufacturerSku,
      },
    },
  };
}

export const EMPTY_SKU_COLLISIONS: SkuCollisionInput = {
  existingParentSkus: new Set(),
  existingVariantSkus: new Set(),
};

export type SizeRowUiStatus = "ready" | "needs_confirmation" | "conflict";

export function sizeRowUiStatus(
  draft: NewProductFamilyDraft,
  size: FamilySizeSlug,
  collisions: SkuCollisionInput
): SizeRowUiStatus {
  const row = draft.variants[size];
  const sku = row?.manufacturerSku.trim().toUpperCase() ?? "";
  if (sku && duplicateManufacturerSkus(draft).includes(sku)) return "conflict";
  const derived = deriveFamilyGloveCubsSkus(draft);
  const glv = derived.bySize[size];
  if (glv && collisions.existingVariantSkus.has(glv)) return "conflict";
  if (glv && sku && glv === sku) return "conflict";
  const status = row ? manufacturerSkuStatus(row) : "incomplete";
  if (!row || status !== "confirmed" || !effectiveSupplierSku(draft, size) || !glv) {
    return "needs_confirmation";
  }
  return "ready";
}
