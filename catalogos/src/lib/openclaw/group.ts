/**
 * OpenClaw Step 5: Variant grouping — one row per purchasable variant.
 */

import type { ParsedProductPage } from "./types";
import type { NormalizedFamily } from "./normalize";
import type { VariantRow } from "./types";
import { normalizeToOntology } from "./normalize";
import { extractFromParsedPage } from "./extract";

export interface GroupedVariantInput {
  parsed: ParsedProductPage;
  normalized: NormalizedFamily;
  sourceSupplier: string;
  sourceCategoryPath: string;
}

function hashKey(parts: (string | number | undefined)[]): string {
  return parts
    .filter((p) => p != null && String(p).trim() !== "")
    .map((p) => String(p).toLowerCase().replace(/\s+/g, "_"))
    .join("_");
}

/**
 * Expand one parsed page into one or more variant rows (one per size/color/etc when present).
 */
export function groupVariants(input: GroupedVariantInput): VariantRow[] {
  const { parsed, normalized, sourceSupplier, sourceCategoryPath } = input;
  const variantOptions = parsed.variant_options ?? [];
  const sizeOpts = variantOptions.find((o) => o.dimension === "size")?.values ?? [];
  const colorOpts = variantOptions.find((o) => o.dimension === "color")?.values ?? [];

  const baseKey = hashKey([
    sourceSupplier,
    normalized.family_name,
    normalized.material,
    normalized.thickness_mil,
    normalized.powder_status,
  ]);

  if (sizeOpts.length === 0 && colorOpts.length === 0) {
    return [
      {
        family_group_key: baseKey,
        variant_group_key: hashKey([baseKey, normalized.size, normalized.color]),
        variation_dimensions: [],
        extracted: extractFromParsedPage(parsed, sourceSupplier, sourceCategoryPath),
        variant_index: 0,
      },
    ];
  }

  const rows: VariantRow[] = [];
  const sizeList = sizeOpts.length ? sizeOpts : [normalized.size ?? "unknown"];
  const colorList = colorOpts.length ? colorOpts : [normalized.color ?? "unknown"];
  let idx = 0;
  const baseExtracted = extractFromParsedPage(parsed, sourceSupplier, sourceCategoryPath);
  for (const size of sizeList) {
    for (const color of colorList) {
      const extracted = { ...baseExtracted } as typeof baseExtracted;
      if (sizeOpts.length)
        extracted.size = { raw_value: size, normalized_value: size, confidence: 0.9, extraction_method: "variant_json" as const };
      if (colorOpts.length)
        extracted.color = { raw_value: color, normalized_value: color, confidence: 0.9, extraction_method: "variant_json" as const };
      const dims: string[] = [];
      if (sizeOpts.length) dims.push("size");
      if (colorOpts.length) dims.push("color");
      rows.push({
        family_group_key: baseKey,
        variant_group_key: hashKey([baseKey, size, color]),
        variation_dimensions: dims,
        extracted,
        variant_index: idx++,
      });
    }
  }
  return rows;
}
