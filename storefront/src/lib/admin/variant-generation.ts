import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import { normalizeSizeCode } from "@/lib/admin/import-draft-mapper";

export type EditorVariantRow = {
  id?: string;
  sizeCode: string;
  variantSku: string;
  listPrice: string;
};

export type VariantProposal = {
  proposed: EditorVariantRow[];
  added: string[];
  preserved: string[];
  removedOs: boolean;
  warnings: string[];
};

const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

function normSize(code: string): string {
  return code.trim().toUpperCase();
}

function dedupeBySize(rows: EditorVariantRow[]): EditorVariantRow[] {
  const seen = new Set<string>();
  const out: EditorVariantRow[] = [];
  for (const r of rows) {
    const k = normSize(r.sizeCode || "UNKNOWN");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...r, sizeCode: k === "" ? "UNKNOWN" : r.sizeCode.trim().toUpperCase() });
  }
  return out;
}

/** Collect size codes from draft variants and optional sizes_available strings. */
export function collectImportSizeCodes(
  draft: ImportDraftProductV1,
  sizesAvailable?: string[] | null
): string[] {
  const codes = new Set<string>();
  for (const v of draft.variants) {
    const c = normSize(v.normalized_size_code);
    if (c) codes.add(c);
  }
  if (sizesAvailable?.length) {
    for (const raw of sizesAvailable) {
      const c = normalizeSizeCode(raw);
      if (c) codes.add(c);
    }
  }
  if (draft.size) {
    const c = normalizeSizeCode(draft.size);
    if (c) codes.add(c);
  }
  return Array.from(codes);
}

function hasExplicitOneSizeEvidence(draft: ImportDraftProductV1): boolean {
  for (const v of draft.variants) {
    if (v.normalized_size_code !== "OS") continue;
    if (v.size_label && /\bone[\s-]?size\b/i.test(v.size_label)) return true;
  }
  if (draft.size && /\bone[\s-]?size\b/i.test(draft.size)) return true;
  return false;
}

/**
 * Propose variant rows from import evidence. Does not mutate existing rows unless merge options say so.
 */
export function proposeVariantsFromImport(
  draft: ImportDraftProductV1,
  existing: EditorVariantRow[],
  options?: { sizesAvailable?: string[] | null; replaceOs?: boolean }
): VariantProposal {
  const warnings: string[] = [];
  let importCodes = collectImportSizeCodes(draft, options?.sizesAvailable);

  const hasStandard = importCodes.some((c) => (STANDARD_SIZES as readonly string[]).includes(c));
  const hasOs = importCodes.includes("OS");
  let removedOs = false;

  if (hasOs && hasStandard && options?.replaceOs !== false) {
    if (hasExplicitOneSizeEvidence(draft)) {
      warnings.push("OS kept: explicit one-size evidence on import");
    } else {
      importCodes = importCodes.filter((c) => c !== "OS");
      removedOs = true;
      warnings.push("OS removed from proposal: standard sizes present without explicit one-size evidence");
    }
  }

  if (importCodes.length === 0) {
    return { proposed: existing, added: [], preserved: existing.map((v) => normSize(v.sizeCode)), removedOs, warnings: ["No import sizes found"] };
  }

  const existingBySize = new Map<string, EditorVariantRow>();
  for (const v of existing) {
    const k = normSize(v.sizeCode || "UNKNOWN");
    if (!existingBySize.has(k)) existingBySize.set(k, v);
  }

  const proposed: EditorVariantRow[] = [];
  const added: string[] = [];
  const preserved: string[] = [];

  for (const code of importCodes) {
    const prev = existingBySize.get(code);
    if (prev) {
      proposed.push({ ...prev, sizeCode: code });
      preserved.push(code);
    } else {
      const draftVar = draft.variants.find((v) => normSize(v.normalized_size_code) === code);
      proposed.push({
        sizeCode: code,
        variantSku: draftVar?.sku ?? draftVar?.mpn ?? "",
        listPrice: draftVar?.list_price ?? "",
      });
      added.push(code);
    }
  }

  for (const v of existing) {
    const k = normSize(v.sizeCode || "UNKNOWN");
    if (!importCodes.includes(k) && k !== "UNKNOWN") {
      proposed.push(v);
      preserved.push(k);
    }
  }

  return {
    proposed: dedupeBySize(proposed),
    added,
    preserved,
    removedOs,
    warnings,
  };
}

export function variantReadinessIssues(rows: EditorVariantRow[]): string[] {
  const issues: string[] = [];
  const sizes = rows.map((r) => normSize(r.sizeCode));
  const dupes = sizes.filter((s, i) => sizes.indexOf(s) !== i);
  if (dupes.length > 0) issues.push(`Duplicate sizes: ${Array.from(new Set(dupes)).join(", ")}`);
  if (rows.some((r) => normSize(r.sizeCode) === "UNKNOWN")) {
    issues.push("UNKNOWN size variant present");
  }
  if (rows.length === 0) issues.push("No variants");
  return issues;
}
